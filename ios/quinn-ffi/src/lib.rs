use anyhow::Result;
use libc::{c_char, c_int};
use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::net::ToSocketAddrs;
use std::pin::Pin;
use std::ptr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Once, OnceLock};
use std::task::{Context, Poll};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use quinn::{ClientConfig, Connection, Endpoint, RecvStream, SendStream, TransportConfig};
use rustls::{
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    pki_types::{CertificateDer, ServerName, UnixTime},
    CertificateError, Error as TlsError, SignatureScheme,
};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::time::timeout;
use tokio::runtime::Runtime;

use lib_crypto::{hash_sha3_256, Hash, KeyPair, PrivateKey};
use serde_json::Value as JsonValue;
use lib_crypto::types::SignatureAlgorithm;
use lib_identity::{NodeId, ZhtpIdentity};
use lib_network::handshake::{
    self, ClientHello, ClientFinish, HandshakeCapabilities, HandshakeContext, HandshakeMessage,
    HandshakePayload, HandshakeRole, NetworkEpoch, NonceCache, PqcCapability,
};
use lib_network::handshake::core::{recv_message, send_message};
use lib_network::handshake::orchestrator::extract_payload;

const NONCE_TTL_SECS: u64 = 300;
const NONCE_MAX_ENTRIES: usize = 10_000;
const QUINN_FFI_VERSION: &str = "quinn-ffi-v1.0.0-runtime";
const ALPN_PUBLIC: &[u8] = b"zhtp-public/1";
const ALPN_AUTH: &[u8] = b"zhtp-uhp/2";

static CLIENTS: OnceLock<Mutex<HashMap<u64, QuinnClient>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static CRYPTO_PROVIDER: Once = Once::new();

/// Process-wide singleton client `Endpoint`. Quinn's `Endpoint` is Arc-backed
/// and `Clone`, so every connect site can share the same UDP socket + I/O
/// driver task. Without this, each FFI call bound a fresh socket — under load
/// (e.g. once the persistent-session FFI's handshake bug forced every
/// authenticated request through quinn-ffi instead of multiplexing on one
/// long-lived session) iOS exhausted its per-app UDP socket budget and the
/// kernel started rejecting new binds with `EPERM` ("Operation not
/// permitted"), which bubbled up to JS as `QuicSession.open failed:
/// openFailed`. Same fix-shape lib-network shipped on the server-team side
/// (PR #2703).
///
/// The endpoint's I/O driver task is spawned on `RUNTIME`, which is a
/// process-wide multi-thread runtime — so the driver outlives any single
/// FFI call's scope.
///
/// Per-connection TLS config goes through `connect_with(...)`. We do NOT
/// touch `set_default_client_config` on the shared endpoint — two
/// concurrent FFI calls with different ALPNs / verifiers would race on the
/// default (lib-network hit the same trap in PR #2702).
static CLIENT_ENDPOINT: OnceLock<Endpoint> = OnceLock::new();
static CLIENT_ENDPOINT_MUTEX: Mutex<()> = Mutex::new(());

fn shared_client_endpoint() -> Result<Endpoint> {
    if let Some(ep) = CLIENT_ENDPOINT.get() {
        return Ok(ep.clone());
    }
    let _guard = CLIENT_ENDPOINT_MUTEX
        .lock()
        .map_err(|_| anyhow::anyhow!("client endpoint init mutex poisoned"))?;
    if let Some(ep) = CLIENT_ENDPOINT.get() {
        return Ok(ep.clone());
    }
    // Enter the long-lived runtime so the endpoint's I/O driver is parented
    // to it (and survives any caller-local async scope ending).
    let rt = runtime();
    let _enter = rt.enter();
    let bind_addr: std::net::SocketAddr = "[::]:0"
        .parse()
        .map_err(|e| anyhow::anyhow!("Failed to parse default bind address: {e}"))?;
    let ep = Endpoint::client(bind_addr)
        .map_err(|e| anyhow::anyhow!("Failed to create shared QUIC endpoint: {e}"))?;
    let _ = CLIENT_ENDPOINT.set(ep.clone());
    Ok(ep)
}

thread_local! {
    static LAST_ERROR: RefCell<Option<CString>> = RefCell::new(None);
}

fn set_last_error(message: impl Into<String>) {
    let msg = CString::new(message.into()).unwrap_or_else(|_| CString::new("unknown error").unwrap());
    LAST_ERROR.with(|err| {
        *err.borrow_mut() = Some(msg);
    });
}

#[no_mangle]
pub extern "C" fn uhp_quinn_last_error_message() -> *const c_char {
    LAST_ERROR.with(|err| match &*err.borrow() {
        Some(msg) => msg.as_ptr(),
        None => ptr::null(),
    })
}

#[no_mangle]
pub extern "C" fn uhp_quinn_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(CString::from_raw(ptr));
    }
}

#[no_mangle]
pub extern "C" fn uhp_quinn_version() -> *const c_char {
    QUINN_FFI_VERSION.as_ptr() as *const c_char
}

fn clients() -> &'static Mutex<HashMap<u64, QuinnClient>> {
    CLIENTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_io()
            .enable_time()
            .build()
            .expect("failed to create tokio runtime")
    })
}

fn block_on_with_runtime<F, T>(future: F) -> T
where
    F: std::future::Future<Output = T>,
{
    let rt = runtime();
    let _guard = rt.enter();
    rt.block_on(future)
}

fn ensure_crypto_provider() {
    CRYPTO_PROVIDER.call_once(|| {
        let _ = rustls::crypto::CryptoProvider::install_default(
            rustls::crypto::ring::default_provider(),
        );
    });
}

/// Read 32 bytes of SPKI pin from a raw pointer. Returns None when the
/// pointer is null (caller will use AcceptAnyVerifier instead).
fn parse_spki_pin(spki_pin_32: *const u8) -> Result<Option<[u8; 32]>, String> {
    if spki_pin_32.is_null() {
        return Ok(None);
    }
    let spki = unsafe { std::slice::from_raw_parts(spki_pin_32, 32) };
    let mut spki_pin = [0u8; 32];
    spki_pin.copy_from_slice(spki);
    Ok(Some(spki_pin))
}

#[no_mangle]
pub extern "C" fn uhp_quinn_init() {
    ensure_crypto_provider();
}

#[repr(C)]
pub struct UhpPrivateKeyBytes {
    pub dilithium_sk_ptr: *const u8,
    pub dilithium_sk_len: usize,
    pub kyber_sk_ptr: *const u8,
    pub kyber_sk_len: usize,
    pub master_seed_ptr: *const u8,
    pub master_seed_len: usize,
}

#[repr(C)]
pub struct UhpSession {
    pub session_key: [u8; 32],
    pub session_id: [u8; 32],
    pub session_id_len: usize,
    pub handshake_hash: [u8; 32],
    pub peer_did: *mut c_char,
    pub peer_did_len: usize,
    pub pqc_hybrid_enabled: u8,
}

#[derive(Debug)]
struct SpkiPinVerifier {
    pinned_spki_sha256: [u8; 32],
}

impl SpkiPinVerifier {
    fn new(pin: [u8; 32]) -> Self {
        Self { pinned_spki_sha256: pin }
    }
}

impl ServerCertVerifier for SpkiPinVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        let (_, cert) = x509_parser::parse_x509_certificate(end_entity.as_ref())
            .map_err(|_| TlsError::InvalidCertificate(CertificateError::BadEncoding))?;

        let spki_der = cert.tbs_certificate.subject_pki.raw.to_owned();
        let mut h = Sha256::new();
        h.update(&spki_der);
        let digest = h.finalize();

        if digest[..] == self.pinned_spki_sha256[..] {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(TlsError::InvalidCertificate(CertificateError::UnknownIssuer))
        }
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Err(TlsError::General("TLS1.2 not supported".into()))
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ED25519,
            SignatureScheme::RSA_PSS_SHA256,
        ]
    }
}

/// Accept-any TLS cert verifier. Used when peer authenticity is checked at a
/// higher layer (UHP-v2 handshake's `peer_did` matched against the configured
/// gateway DID). TLS is just transport here — pinning at this layer is dead
/// weight because cert rotation would force an app rebuild.
#[derive(Debug)]
struct AcceptAnyVerifier;

impl ServerCertVerifier for AcceptAnyVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Err(TlsError::General("TLS1.2 not supported".into()))
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ED25519,
            SignatureScheme::RSA_PSS_SHA256,
        ]
    }
}

struct QuinnStream {
    send: SendStream,
    recv: RecvStream,
}

impl QuinnStream {
    fn new(send: SendStream, recv: RecvStream) -> Self {
        Self { send, recv }
    }
}

impl AsyncRead for QuinnStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.recv).poll_read(cx, buf)
    }
}

impl AsyncWrite for QuinnStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match Pin::new(&mut self.send).poll_write(cx, data) {
            Poll::Ready(Ok(size)) => Poll::Ready(Ok(size)),
            Poll::Ready(Err(err)) => Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, err))),
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match Pin::new(&mut self.send).poll_flush(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(err)) => Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, err))),
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match Pin::new(&mut self.send).poll_shutdown(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(err)) => Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, err))),
            Poll::Pending => Poll::Pending,
        }
    }
}

struct QuinnClient {
    _endpoint: Endpoint,
    connection: Connection,
}

unsafe fn vec_from_raw(ptr: *const u8, len: usize) -> Result<Vec<u8>> {
    if ptr.is_null() || len == 0 {
        return Ok(Vec::new());
    }
    Ok(std::slice::from_raw_parts(ptr, len).to_vec())
}

fn ensure_identity_id_field(identity_json: &str) -> Result<String> {
    let mut raw: JsonValue = serde_json::from_str(identity_json)
        .map_err(|e| anyhow::anyhow!("Failed to parse identity JSON: {e}"))?;

    if raw.get("id").is_none() {
        if let Some(did) = raw.get("did").and_then(|v| v.as_str()) {
            if let Some(hex_part) = did.strip_prefix("did:zhtp:") {
                let hash = Hash::from_hex(hex_part)
                    .map_err(|e| anyhow::anyhow!("Failed to derive id from DID: {e}"))?;
                let bytes = hash.as_bytes();
                let id_array = bytes
                    .iter()
                    .map(|b| JsonValue::Number((*b).into()))
                    .collect::<Vec<_>>();
                raw["id"] = JsonValue::Array(id_array);
                eprintln!("[quinn-ffi] identity_json: injected missing id from DID");
            }
        }
    }

    if raw.get("identity_type").is_none() {
        raw["identity_type"] = JsonValue::String("Human".to_string());
        eprintln!("[quinn-ffi] identity_json: injected missing identity_type=Human");
    }

    serde_json::to_string(&raw)
        .map_err(|e| anyhow::anyhow!("Failed to serialize identity JSON: {e}"))
}

fn extract_dilithium_pk_from_identity(identity_json: &str) -> Result<Vec<u8>> {
    let raw: serde_json::Value = serde_json::from_str(identity_json)
        .map_err(|e| anyhow::anyhow!("Failed to parse identity JSON: {}", e))?;

    // Handshake JSON format: { "public_key": { "dilithium_pk": [...] } }
    let pk_value = raw
        .get("public_key")
        .and_then(|v| v.get("dilithium_pk"))
        .ok_or_else(|| anyhow::anyhow!("Missing public_key.dilithium_pk in identity JSON"))?;

    match pk_value {
        JsonValue::Array(arr) => {
            let mut bytes = Vec::with_capacity(arr.len());
            for v in arr {
                let byte = v.as_u64().ok_or_else(|| {
                    anyhow::anyhow!("Invalid dilithium_pk byte value in identity JSON")
                })?;
                bytes.push(byte as u8);
            }
            Ok(bytes)
        }
        JsonValue::String(s) => {
            hex::decode(s)
                .map_err(|e| anyhow::anyhow!("Invalid hex dilithium_pk in identity JSON: {}", e))
        }
        _ => Err(anyhow::anyhow!("Unsupported dilithium_pk format in identity JSON")),
    }
}

fn load_identity(identity_json: &str, key_bytes: &UhpPrivateKeyBytes) -> Result<ZhtpIdentity> {
    let dilithium_sk = unsafe { vec_from_raw(key_bytes.dilithium_sk_ptr, key_bytes.dilithium_sk_len) }?;
    let kyber_sk = unsafe { vec_from_raw(key_bytes.kyber_sk_ptr, key_bytes.kyber_sk_len) }?;
    let master_seed = unsafe { vec_from_raw(key_bytes.master_seed_ptr, key_bytes.master_seed_len) }?;

    // Extract dilithium_pk from the identity JSON
    let dilithium_pk = extract_dilithium_pk_from_identity(identity_json)
        .unwrap_or_else(|_| {
            // If we can't extract from JSON, use empty vector (will fail in from_serialized)
            Vec::new()
        });

    let dilithium_sk: [u8; 4896] = match dilithium_sk.len() {
        4896 => dilithium_sk.try_into().unwrap(),
        4864 => {
            // crystals-dilithium native format → zero-pad to storage format
            let mut arr = [0u8; 4896];
            arr[..4864].copy_from_slice(&dilithium_sk);
            arr
        }
        n => return Err(anyhow::anyhow!("dilithium_sk: expected 4864 or 4896 bytes, got {n}")),
    };
    let dilithium_pk: [u8; 2592] = dilithium_pk
        .try_into()
        .map_err(|v: Vec<u8>| anyhow::anyhow!("dilithium_pk: expected 2592 bytes, got {}", v.len()))?;
    let kyber_sk: [u8; 3168] = kyber_sk
        .try_into()
        .map_err(|v: Vec<u8>| anyhow::anyhow!("kyber_sk: expected 3168 bytes, got {}", v.len()))?;
    let master_seed: [u8; 64] = match master_seed.len() {
        64 => master_seed.try_into().unwrap(),
        32 => {
            // Legacy 32-byte seed → zero-pad to 64 bytes
            let mut arr = [0u8; 64];
            arr[..32].copy_from_slice(&master_seed);
            arr
        }
        n => return Err(anyhow::anyhow!("master_seed: expected 32 or 64 bytes, got {n}")),
    };

    let private_key = PrivateKey {
        dilithium_sk,
        dilithium_pk,
        kyber_sk,
        master_seed,
    };

    let normalized_json = ensure_identity_id_field(identity_json)?;
    ZhtpIdentity::from_serialized(&normalized_json, &private_key)
}

fn build_capabilities() -> HandshakeCapabilities {
    let mut caps = HandshakeCapabilities::default();
    caps.protocols = vec!["quic".to_string()];
    caps.pqc_capability = PqcCapability::Kyber1024Dilithium5;
    caps
}

fn hex_prefix(bytes: &[u8], len: usize) -> String {
    bytes.iter().take(len).map(|b| format!("{:02x}", b)).collect()
}

fn log_identity_details(identity: &ZhtpIdentity) {
    let node_id_hex = hex_prefix(identity.node_id.as_bytes(), 8);
    let key_id_hex = hex_prefix(&identity.public_key.key_id, 8);
    eprintln!(
        "[quinn-ffi] identity node_id[0..8]={} key_id[0..8]={}",
        node_id_hex, key_id_hex
    );
    eprintln!(
        "[quinn-ffi] identity primary_device={}",
        identity.primary_device
    );
    if !identity.device_node_ids.is_empty() {
        let keys = identity
            .device_node_ids
            .keys()
            .cloned()
            .collect::<Vec<_>>()
            .join(",");
        eprintln!("[quinn-ffi] identity device_node_ids keys={}", keys);
    }
}

fn apply_deterministic_node_id(identity: &mut ZhtpIdentity) {
    let normalized_device = identity.primary_device.trim().to_lowercase();
    let preimage = format!(
        "ZHTP_NODE_V2:network={}:version={}:{}:{}",
        "mainnet",
        1,
        identity.did,
        normalized_device
    );
    let digest = lib_crypto::hash_blake3(preimage.as_bytes());
    identity.node_id = NodeId::from_bytes(digest);
    identity
        .device_node_ids
        .insert(identity.primary_device.clone(), identity.node_id);
    identity
        .device_node_ids
        .insert(normalized_device, identity.node_id);
    eprintln!(
        "[quinn-ffi] node_id override: device={} node_id[0..8]={}",
        identity.primary_device,
        hex_prefix(identity.node_id.as_bytes(), 8)
    );
}

fn make_client_config(spki_pin: Option<[u8; 32]>) -> ClientConfig {
    make_client_config_with_alpn(spki_pin, ALPN_AUTH)
}

fn make_client_config_with_alpn(spki_pin: Option<[u8; 32]>, alpn: &[u8]) -> ClientConfig {
    let verifier: Arc<dyn ServerCertVerifier> = match spki_pin {
        Some(pin) => Arc::new(SpkiPinVerifier::new(pin)),
        None => Arc::new(AcceptAnyVerifier),
    };
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let mut tls = rustls::ClientConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&rustls::version::TLS13])
        .expect("TLS versions")
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    tls.alpn_protocols = vec![alpn.to_vec()];

    let mut transport = TransportConfig::default();
    transport.max_idle_timeout(Some(Duration::from_secs(60).try_into().unwrap()));
    transport.keep_alive_interval(Some(Duration::from_secs(15)));

    let mut cfg = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(tls).unwrap(),
    ));
    cfg.transport_config(Arc::new(transport));
    cfg
}

async fn quic_connect(
    host: &str,
    port: u16,
    server_name: &str,
    cfg: ClientConfig,
) -> Result<Connection> {
    eprintln!("[quinn-ffi] connect: host={host} port={port} sni={server_name}");
    // Reuse the process-wide singleton — see `CLIENT_ENDPOINT` for why.
    let endpoint = shared_client_endpoint()?;

    let addr = (host, port)
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| anyhow::anyhow!("failed to resolve host"))?;
    // Per-connection config via `connect_with` — never mutate the shared
    // endpoint's default config (concurrent FFI calls with different ALPNs
    // would race on it).
    let connecting = endpoint
        .connect_with(cfg, addr, server_name)
        .map_err(|e| anyhow::anyhow!("connect_with failed: {e}"))?;
    let conn = timeout(Duration::from_secs(10), connecting)
        .await
        .map_err(|_| anyhow::anyhow!("connect timed out"))??;
    eprintln!("[quinn-ffi] connect: ok");
    Ok(conn)
}

async fn quic_connect_with_endpoint(
    host: &str,
    port: u16,
    server_name: &str,
    cfg: ClientConfig,
) -> Result<(Endpoint, Connection)> {
    eprintln!("[quinn-ffi] connect: host={host} port={port} sni={server_name}");
    let endpoint = shared_client_endpoint()?;

    let addr = (host, port)
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| anyhow::anyhow!("failed to resolve host"))?;
    let connecting = endpoint
        .connect_with(cfg, addr, server_name)
        .map_err(|e| anyhow::anyhow!("connect_with failed: {e}"))?;
    let conn = timeout(Duration::from_secs(10), connecting)
        .await
        .map_err(|_| anyhow::anyhow!("connect timed out"))??;
    eprintln!("[quinn-ffi] connect: ok");
    // The endpoint we return is the same Arc-backed singleton — clones are
    // cheap and the per-connection lifetime is now decoupled from any
    // per-call socket. `QuinnClient._endpoint` just holds an extra Arc ref.
    Ok((endpoint, conn))
}

fn export_channel_binding(conn: &Connection) -> [u8; 32] {
    let mut out = [0u8; 32];
    // Match server parameter order: output, context (empty), label.
    conn.export_keying_material(&mut out, &[], b"zhtp-uhp-channel-binding")
        .expect("TLS exporter failed");
    let prefix = out[..8].iter().map(|b| format!("{:02x}", b)).collect::<String>();
    eprintln!("[quinn-ffi] channel binding hex[0..8]={}", prefix);
    out
}

fn log_signature(label: &str, signature: &lib_crypto::types::Signature) {
    let sig_len = signature.signature.len();
    let pk_len = signature.public_key.dilithium_pk.len();
    let algo = match signature.algorithm {
        SignatureAlgorithm::Dilithium5 => "Dilithium5",
        SignatureAlgorithm::RingSignature => "RingSignature",
    };
    let sig_prefix = hex_prefix(&signature.signature, 8);
    let pk_prefix = hex_prefix(&signature.public_key.dilithium_pk, 8);
    eprintln!(
        "[quinn-ffi] {label}: sig_len={sig_len} sig_hex[0..8]={sig_prefix} pk_len={pk_len} pk_hex[0..8]={pk_prefix} algo={algo}"
    );
}

async fn handshake_with_transcript<S>(
    stream: &mut S,
    ctx: &HandshakeContext,
    local_identity: &ZhtpIdentity,
    capabilities: HandshakeCapabilities,
) -> Result<(handshake::HandshakeResult, [u8; 32])>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let ctx = ctx.with_roles(HandshakeRole::Client, HandshakeRole::Server);
    let client_hello = ClientHello::new(local_identity, capabilities, &ctx)?;
    if let Some(offer) = &client_hello.pqc_offer {
        let sig_prefix = hex_prefix(&offer.signature, 8);
        let pk_prefix = hex_prefix(&offer.dilithium_public_key, 8);
        eprintln!(
            "[quinn-ffi] pqc_offer: suite={} sig_len={} sig_hex[0..8]={} pk_len={} pk_hex[0..8]={}",
            offer.suite.as_str(),
            offer.signature.len(),
            sig_prefix,
            offer.dilithium_public_key.len(),
            pk_prefix
        );
    } else {
        eprintln!("[quinn-ffi] pqc_offer: none");
    }
    log_signature("client_hello.signature", &client_hello.signature);
    let hello_msg = HandshakeMessage::new(HandshakePayload::ClientHello(client_hello.clone()));
    let client_hello_bytes = hello_msg.to_bytes()?;
    eprintln!(
        "[quinn-ffi] client_hello: bytes_len={} hash[0..8]={}",
        client_hello_bytes.len(),
        hex_prefix(&hash_sha3_256(&client_hello_bytes), 8)
    );
    let client_hello_hash = hash_sha3_256(&client_hello_bytes);
    send_message(stream, &hello_msg).await?;

    let server_msg = recv_message(stream).await?;
    eprintln!("[quinn-ffi] server_hello: received");
    handshake::orchestrator::check_for_error(&server_msg)?;
    let server_hello = extract_payload(&server_msg, "ServerHello", |payload| {
        if let HandshakePayload::ServerHello(sh) = payload {
            Some(sh.clone())
        } else {
            None
        }
    })?;
    let server_hello_bytes = server_msg.to_bytes()?;
    eprintln!(
        "[quinn-ffi] nonces: client_challenge[0..8]={} server_response[0..8]={} server_ts={}",
        hex_prefix(&client_hello.challenge_nonce, 8),
        hex_prefix(&server_hello.response_nonce, 8),
        server_hello.timestamp
    );
    log_signature("server_hello.signature", &server_hello.signature);
    eprintln!(
        "[quinn-ffi] server_hello: bytes_len={} hash[0..8]={}",
        server_hello_bytes.len(),
        hex_prefix(&hash_sha3_256(&server_hello_bytes), 8)
    );

    eprintln!("[quinn-ffi] server_hello: verify_signature");
    let skip_server_verify = std::env::var("UHP_SKIP_SERVER_VERIFY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if skip_server_verify {
        eprintln!("[quinn-ffi] server_hello: verify skipped (UHP_SKIP_SERVER_VERIFY)");
    }

    let keypair = KeyPair {
        public_key: local_identity.public_key.clone(),
        private_key: local_identity
            .private_key
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Missing private key"))?,
    };

    let pre_finish_transcript = {
        let mut tx = Vec::new();
        tx.extend_from_slice(&client_hello_bytes);
        tx.extend_from_slice(&server_hello_bytes);
        hash_sha3_256(&tx)
    };

    eprintln!("[quinn-ffi] client_finish: building");
    let (client_finish, pqc_shared_secret) = ClientFinish::new_with_pqc(
        &server_hello,
        &client_hello,
        &client_hello_hash,
        &pre_finish_transcript,
        &keypair,
        &ctx,
    )?;
    log_signature("client_finish.signature", &client_finish.signature);

    let finish_msg = HandshakeMessage::new(HandshakePayload::ClientFinish(client_finish));
    let client_finish_bytes = finish_msg.to_bytes()?;
    eprintln!(
        "[quinn-ffi] client_finish: bytes_len={} hash[0..8]={}",
        client_finish_bytes.len(),
        hex_prefix(&hash_sha3_256(&client_finish_bytes), 8)
    );
    eprintln!("[quinn-ffi] client_finish: sending");
    send_message(stream, &finish_msg).await?;
    eprintln!("[quinn-ffi] client_finish: sent");

    let mut transcript = Vec::new();
    transcript.extend_from_slice(&client_hello_bytes);
    transcript.extend_from_slice(&server_hello_bytes);
    transcript.extend_from_slice(&client_finish_bytes);
    let handshake_hash = hash_sha3_256(&transcript);

    let session_info = handshake::HandshakeSessionInfo::from_messages(&client_hello, &server_hello)?;
    let result = handshake::HandshakeResult::new_with_pqc(
        server_hello.identity.clone(),
        server_hello.negotiated.clone(),
        &client_hello.challenge_nonce,
        &server_hello.response_nonce,
        &local_identity.did,
        &server_hello.identity.did,
        client_hello.timestamp,
        &session_info,
        pqc_shared_secret.as_ref(),
        handshake_hash,
    )?;

    Ok((result, handshake_hash))
}

#[no_mangle]
pub extern "C" fn uhp_handshake_quic(
    host: *const c_char,
    port: u16,
    server_name: *const c_char,
    spki_pin_32: *const u8,
    identity_json_ptr: *const u8,
    identity_json_len: usize,
    key_bytes: UhpPrivateKeyBytes,
    chain_id: u8,
    out_session: *mut UhpSession,
) -> c_int {
    ensure_crypto_provider();

    if out_session.is_null() {
        set_last_error("null output session pointer");
        return -1;
    }

    if host.is_null() || server_name.is_null() {
        set_last_error("missing host or server name");
        return -1;
    }


    if identity_json_ptr.is_null() || identity_json_len == 0 {
        set_last_error("missing identity JSON");
        return -1;
    }

    let host = unsafe { CStr::from_ptr(host) }.to_string_lossy().to_string();
    let server_name = unsafe { CStr::from_ptr(server_name) }.to_string_lossy().to_string();

    let identity_json = unsafe { std::slice::from_raw_parts(identity_json_ptr, identity_json_len) };
    let identity_json = match std::str::from_utf8(identity_json) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(format!("identity JSON is not valid UTF-8: {err}"));
            return -1;
        }
    };

    // NULL pin → accept-any TLS. UHP-v2 handshake then proves the
    // peer's on-chain DID; caller compares against expected.
    let spki_pin = match parse_spki_pin(spki_pin_32) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(err);
            return -1;
        }
    };

    let nonce_cache_path = match unique_nonce_cache_path() {
        Ok(path) => path,
        Err(err) => {
            set_last_error(format!("failed to build nonce cache path: {err}"));
            return -1;
        }
    };
    eprintln!("[quinn-ffi] nonce cache path: {nonce_cache_path}");

    let mut identity = match load_identity(identity_json, &key_bytes) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(format!("failed to load identity: {err}"));
            return -1;
        }
    };
    apply_deterministic_node_id(&mut identity);

    let result = block_on_with_runtime(async {
        let cfg = make_client_config(spki_pin);
        log_identity_details(&identity);
        let conn = quic_connect(&host, port, &server_name, cfg).await?;
        let binding = export_channel_binding(&conn);

        let (send, recv) = conn.open_bi().await?;
        let mut stream = QuinnStream::new(send, recv);

        let epoch = NetworkEpoch::from_chain_id(chain_id);
        let nonce_cache = NonceCache::open(&nonce_cache_path, NONCE_TTL_SECS, NONCE_MAX_ENTRIES, epoch)?;
        let ctx = HandshakeContext::new(nonce_cache)
            .for_client_with_transport(binding.to_vec(), "quic");
        let capabilities = build_capabilities();

        eprintln!("[quinn-ffi] handshake: start");
        let (result, handshake_hash) = timeout(
            Duration::from_secs(30),
            handshake_with_transcript(&mut stream, &ctx, &identity, capabilities),
        )
        .await
        .map_err(|_| anyhow::anyhow!("handshake timed out"))??;
        eprintln!("[quinn-ffi] handshake: ok");
        Ok::<(handshake::HandshakeResult, [u8; 32]), anyhow::Error>((result, handshake_hash))
    });

    match result {
        Ok((result, handshake_hash)) => {
            let peer_did = match CString::new(result.peer_identity.did) {
                Ok(val) => val,
                Err(_) => {
                    set_last_error("peer DID contains invalid null byte");
                    return -1;
                }
            };

            unsafe {
                (*out_session).session_key = result.session_key;
                let mut session_id = [0u8; 32];
                session_id[..result.session_id.len()].copy_from_slice(&result.session_id);
                (*out_session).session_id = session_id;
                (*out_session).session_id_len = result.session_id.len();
                (*out_session).handshake_hash = handshake_hash;
                (*out_session).pqc_hybrid_enabled = if result.pqc_hybrid_enabled { 1 } else { 0 };
                (*out_session).peer_did_len = peer_did.as_bytes().len();
                (*out_session).peer_did = peer_did.into_raw();
            }
            0
        }
        Err(err) => {
            set_last_error(format!("handshake failed: {err}"));
            -1
        }
    }
}

#[no_mangle]
pub extern "C" fn uhp_quic_connect_and_handshake(
    host: *const c_char,
    port: u16,
    server_name: *const c_char,
    spki_pin_32: *const u8,
    identity_json_ptr: *const u8,
    identity_json_len: usize,
    key_bytes: UhpPrivateKeyBytes,
    chain_id: u8,
    out_handle: *mut u64,
    out_session: *mut UhpSession,
) -> c_int {
    ensure_crypto_provider();

    if out_handle.is_null() || out_session.is_null() {
        set_last_error("null output handle/session pointer");
        return -1;
    }

    if host.is_null() || server_name.is_null() {
        set_last_error("missing host or server name");
        return -1;
    }


    if identity_json_ptr.is_null() || identity_json_len == 0 {
        set_last_error("missing identity JSON");
        return -1;
    }

    let host = unsafe { CStr::from_ptr(host) }.to_string_lossy().to_string();
    let server_name = unsafe { CStr::from_ptr(server_name) }.to_string_lossy().to_string();

    let identity_json = unsafe { std::slice::from_raw_parts(identity_json_ptr, identity_json_len) };
    let identity_json = match std::str::from_utf8(identity_json) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(format!("identity JSON is not valid UTF-8: {err}"));
            return -1;
        }
    };

    // NULL pin → accept-any TLS. UHP-v2 handshake then proves the
    // peer's on-chain DID; caller compares against expected.
    let spki_pin = match parse_spki_pin(spki_pin_32) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(err);
            return -1;
        }
    };

    let nonce_cache_path = match unique_nonce_cache_path() {
        Ok(path) => path,
        Err(err) => {
            set_last_error(format!("failed to build nonce cache path: {err}"));
            return -1;
        }
    };
    eprintln!("[quinn-ffi] nonce cache path: {nonce_cache_path}");

    let mut identity = match load_identity(identity_json, &key_bytes) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(format!("failed to load identity: {err}"));
            return -1;
        }
    };
    apply_deterministic_node_id(&mut identity);

    let result = block_on_with_runtime(async {
        let cfg = make_client_config(spki_pin);
        log_identity_details(&identity);
        let (endpoint, conn) = quic_connect_with_endpoint(&host, port, &server_name, cfg).await?;
        let binding = export_channel_binding(&conn);

        let (send, recv) = conn.open_bi().await?;
        let mut stream = QuinnStream::new(send, recv);

        let epoch = NetworkEpoch::from_chain_id(chain_id);
        let nonce_cache = NonceCache::open(&nonce_cache_path, NONCE_TTL_SECS, NONCE_MAX_ENTRIES, epoch)?;
        let ctx = HandshakeContext::new(nonce_cache)
            .for_client_with_transport(binding.to_vec(), "quic");
        let capabilities = build_capabilities();

        eprintln!("[quinn-ffi] handshake: start");
        let (result, handshake_hash) = timeout(
            Duration::from_secs(30),
            handshake_with_transcript(&mut stream, &ctx, &identity, capabilities),
        )
        .await
        .map_err(|_| anyhow::anyhow!("handshake timed out"))??;
        eprintln!("[quinn-ffi] handshake: ok");

        Ok::<(QuinnClient, handshake::HandshakeResult, [u8; 32]), anyhow::Error>((
            QuinnClient {
                _endpoint: endpoint,
                connection: conn,
            },
            result,
            handshake_hash,
        ))
    });

    match result {
        Ok((client, result, handshake_hash)) => {
            let peer_did = match CString::new(result.peer_identity.did) {
                Ok(val) => val,
                Err(_) => {
                    set_last_error("peer DID contains invalid null byte");
                    return -1;
                }
            };

            let handle = store_client(client);

            unsafe {
                *out_handle = handle;
                (*out_session).session_key = result.session_key;
                let mut session_id = [0u8; 32];
                session_id[..result.session_id.len()].copy_from_slice(&result.session_id);
                (*out_session).session_id = session_id;
                (*out_session).session_id_len = result.session_id.len();
                (*out_session).handshake_hash = handshake_hash;
                (*out_session).pqc_hybrid_enabled = if result.pqc_hybrid_enabled { 1 } else { 0 };
                (*out_session).peer_did_len = peer_did.as_bytes().len();
                (*out_session).peer_did = peer_did.into_raw();
            }
            0
        }
        Err(err) => {
            set_last_error(format!("handshake failed: {err}"));
            -1
        }
    }
}

fn store_client(client: QuinnClient) -> u64 {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let mut map = clients().lock().expect("quinn client map poisoned");
    map.insert(id, client);
    id
}

fn take_client(id: u64) -> Option<QuinnClient> {
    let mut map = clients().lock().expect("quinn client map poisoned");
    map.remove(&id)
}

#[no_mangle]
pub extern "C" fn uhp_quic_connect_public(
    host: *const c_char,
    port: u16,
    server_name: *const c_char,
    spki_pin_32: *const u8,
    out_handle: *mut u64,
) -> c_int {
    ensure_crypto_provider();

    if out_handle.is_null() {
        set_last_error("null output handle pointer");
        return -1;
    }

    if host.is_null() || server_name.is_null() {
        set_last_error("missing host or server name");
        return -1;
    }

    // Pin is optional. If supplied, SpkiPinVerifier is used (legacy
    // self-signed dev/testnet flow with hard-coded SHA-256(SPKI)). If
    // null, we use AcceptAnyVerifier — the cluster ships self-signed
    // certs everywhere (no public CA), so webpki-roots can never validate
    // and would universally fail with `UnknownIssuer`. Authenticity for
    // this path is checked one layer up: the caller (NetworkBootstrap +
    // NetworkDirectoryService) only trusts a connection once the UHP-v2
    // handshake's `peer_did` matches the expected DID from .env /
    // directory. Without that DID compare TLS gives the caller no
    // identity — see the spec at docs (Frontend Spec — Domain Auth via
    // UHP-v2 DID, 2026-06-09).
    let spki_pin = match parse_spki_pin(spki_pin_32) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(err);
            return -1;
        }
    };

    let host = unsafe { CStr::from_ptr(host) }.to_string_lossy().to_string();
    let server_name = unsafe { CStr::from_ptr(server_name) }.to_string_lossy().to_string();

    let result = block_on_with_runtime(async {
        let cfg = make_client_config_with_alpn(spki_pin, ALPN_PUBLIC);
        let (endpoint, conn) = quic_connect_with_endpoint(&host, port, &server_name, cfg).await?;
        Ok::<QuinnClient, anyhow::Error>(QuinnClient {
            _endpoint: endpoint,
            connection: conn,
        })
    });

    match result {
        Ok(client) => {
            let handle = store_client(client);
            unsafe {
                *out_handle = handle;
            }
            0
        }
        Err(err) => {
            set_last_error(format!("public connect failed: {err}"));
            -1
        }
    }
}

#[no_mangle]
pub extern "C" fn uhp_quic_request(
    handle: u64,
    request_ptr: *const u8,
    request_len: usize,
    out_response_ptr: *mut *mut u8,
    out_response_len: *mut usize,
) -> c_int {
    ensure_crypto_provider();

    if request_ptr.is_null() || request_len == 0 {
        set_last_error("missing request bytes");
        return -1;
    }

    if out_response_ptr.is_null() || out_response_len.is_null() {
        set_last_error("missing response output pointers");
        return -1;
    }

    let connection = {
        let map = clients().lock().expect("quinn client map poisoned");
        match map.get(&handle) {
            Some(client) => client.connection.clone(),
            None => {
                set_last_error("invalid quinn handle");
                return -1;
            }
        }
    };

    let request = unsafe { std::slice::from_raw_parts(request_ptr, request_len) }.to_vec();
    let req_prefix = hex_prefix(&request, 8);
    eprintln!(
        "[quinn-ffi] request: handle={} bytes={} hex[0..8]={}",
        handle, request_len, req_prefix
    );

    let result = block_on_with_runtime(async {
        let (mut send, mut recv) = connection.open_bi().await?;
        send.write_all(&request).await?;
        send.finish()?;
        let response = recv.read_to_end(usize::MAX).await?;
        Ok::<Vec<u8>, anyhow::Error>(response)
    });

    match result {
        Ok(response) => {
            eprintln!("[quinn-ffi] response: bytes={}", response.len());
            let mut boxed = response.into_boxed_slice();
            let ptr = boxed.as_mut_ptr();
            let len = boxed.len();
            std::mem::forget(boxed);
            unsafe {
                *out_response_ptr = ptr;
                *out_response_len = len;
            }
            0
        }
        Err(err) => {
            set_last_error(format!("request failed: {err}"));
            -1
        }
    }
}

#[no_mangle]
pub extern "C" fn uhp_quic_close(handle: u64) {
    if let Some(client) = take_client(handle) {
        client.connection.close(0u32.into(), b"");
    }
}

#[no_mangle]
pub extern "C" fn uhp_quic_free_buffer(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}
fn unique_nonce_cache_path() -> Result<String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| anyhow::anyhow!("system time error: {e}"))?
        .as_nanos();
    let path = std::env::temp_dir().join(format!("uhp-nonce-cache-{}", nanos));
    path.to_str()
        .map(|val| val.to_string())
        .ok_or_else(|| anyhow::anyhow!("failed to build nonce cache path"))
}
