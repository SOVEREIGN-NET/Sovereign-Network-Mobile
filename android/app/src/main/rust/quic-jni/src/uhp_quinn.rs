use anyhow::Result;
use lib_crypto::{hash_sha3_256, Hash, KeyPair, PrivateKey};
use lib_crypto::types::SignatureAlgorithm;
use lib_identity::{NodeId, ZhtpIdentity};
use lib_network::handshake::{
    self, ClientHello, ClientFinish, HandshakeCapabilities, HandshakeContext, HandshakeMessage,
    HandshakePayload, HandshakeRole, NetworkEpoch, NonceCache, PqcCapability,
};
use lib_network::handshake::core::{recv_message, send_message};
use lib_network::handshake::orchestrator::extract_payload;
use quinn::{ClientConfig, Connection, Endpoint, RecvStream, SendStream, TransportConfig};
use rustls::{
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    pki_types::{CertificateDer, ServerName, UnixTime},
    CertificateError, Error as TlsError, SignatureScheme,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::ToSocketAddrs;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Once};
use std::task::{Context, Poll};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};
use tokio::runtime::Runtime;
use tokio::time::timeout;

use crate::zhtp_auth::{derive_mac_key, AuthSession};
use crate::zhtp_auth_request::send_authenticated_zhtp_request;

const NONCE_TTL_SECS: u64 = 300;
const NONCE_MAX_ENTRIES: usize = 10_000;

static CLIENTS: once_cell::sync::Lazy<Mutex<HashMap<u64, QuinnClient>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));
static SESSIONS: once_cell::sync::Lazy<Mutex<HashMap<u64, AuthSession>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static RUNTIME: once_cell::sync::Lazy<Runtime> = once_cell::sync::Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_io()
        .enable_time()
        .build()
        .expect("failed to create tokio runtime")
});
static CRYPTO_PROVIDER: Once = Once::new();

pub const QUINN_FFI_VERSION: &str = "quinn-ffi-v1.0.0-android";

pub fn uhp_quinn_init() {
    CRYPTO_PROVIDER.call_once(|| {
        let _ = rustls::crypto::CryptoProvider::install_default(
            rustls::crypto::ring::default_provider(),
        );
    });
}

fn runtime() -> &'static Runtime {
    &RUNTIME
}

fn block_on_with_runtime<F, T>(future: F) -> T
where
    F: std::future::Future<Output = T>,
{
    let rt = runtime();
    let _guard = rt.enter();
    rt.block_on(future)
}

#[derive(Clone, Debug)]
pub struct UhpPrivateKeyBytes {
    pub dilithium_sk: Vec<u8>,
    pub kyber_sk: Vec<u8>,
    pub master_seed: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct UhpSessionInfo {
    pub session_key: [u8; 32],
    pub session_id: [u8; 32],
    pub session_id_len: usize,
    pub handshake_hash: [u8; 32],
    pub peer_did: String,
    pub pqc_hybrid_enabled: bool,
    pub client_did: String,
}

#[derive(Debug, Clone)]
pub struct QuinnHandshakeResult {
    pub handle: u64,
    pub session: UhpSessionInfo,
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
        match Pin::new(&mut self.recv).poll_read(cx, buf) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(err)) => Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, err))),
            Poll::Pending => Poll::Pending,
        }
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

fn ensure_identity_id_field(identity_json: &str) -> Result<String> {
    let mut raw: serde_json::Value = serde_json::from_str(identity_json)
        .map_err(|e| anyhow::anyhow!("Failed to parse identity JSON: {e}"))?;

    if raw.get("id").is_none() {
        if let Some(did) = raw.get("did").and_then(|v| v.as_str()) {
            if let Some(hex_part) = did.strip_prefix("did:zhtp:") {
                let hash = Hash::from_hex(hex_part)
                    .map_err(|e| anyhow::anyhow!("Failed to derive id from DID: {e}"))?;
                let bytes = hash.as_bytes();
                let id_array = bytes
                    .iter()
                    .map(|b| serde_json::Value::Number((*b).into()))
                    .collect::<Vec<_>>();
                raw["id"] = serde_json::Value::Array(id_array);
            }
        }
    }

    if raw.get("identity_type").is_none() {
        raw["identity_type"] = serde_json::Value::String("Human".to_string());
    }

    serde_json::to_string(&raw)
        .map_err(|e| anyhow::anyhow!("Failed to serialize identity JSON: {e}"))
}

fn load_identity(identity_json: &str, key_bytes: &UhpPrivateKeyBytes) -> Result<ZhtpIdentity> {
    let dilithium_pk = extract_dilithium_pk(identity_json)?;
    let private_key = PrivateKey {
        dilithium_sk: key_bytes.dilithium_sk.clone(),
        dilithium_pk,
        kyber_sk: key_bytes.kyber_sk.clone(),
        master_seed: key_bytes.master_seed.clone(),
    };

    let normalized_json = ensure_identity_id_field(identity_json)?;
    ZhtpIdentity::from_serialized(&normalized_json, &private_key)
}

fn extract_dilithium_pk(identity_json: &str) -> Result<Vec<u8>> {
    let raw: serde_json::Value = serde_json::from_str(identity_json)
        .map_err(|e| anyhow::anyhow!("Failed to parse identity JSON for dilithium_pk: {e}"))?;
    let pk_value = raw
        .get("public_key")
        .and_then(|v| v.get("dilithium_pk"))
        .ok_or_else(|| anyhow::anyhow!("Missing public_key.dilithium_pk in identity JSON"))?;

    match pk_value {
        serde_json::Value::Array(arr) => {
            let mut bytes = Vec::with_capacity(arr.len());
            for v in arr {
                let byte = v.as_u64().ok_or_else(|| {
                    anyhow::anyhow!("Invalid dilithium_pk byte value in identity JSON")
                })?;
                bytes.push(byte as u8);
            }
            Ok(bytes)
        }
        serde_json::Value::String(s) => {
            let decoded = hex::decode(s)
                .map_err(|e| anyhow::anyhow!("Invalid hex dilithium_pk in identity JSON: {e}"))?;
            Ok(decoded)
        }
        _ => Err(anyhow::anyhow!(
            "Unsupported dilithium_pk format in identity JSON"
        )),
    }
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
    log::info!(
        "[🌐 Web4] [quinn-ffi] identity node_id[0..8]={} key_id[0..8]={}",
        node_id_hex,
        key_id_hex
    );
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
    log::info!(
        "[🌐 Web4] [quinn-ffi] node_id override: device={} node_id[0..8]={}",
        identity.primary_device,
        hex_prefix(identity.node_id.as_bytes(), 8)
    );
}

fn make_client_config(spki_pin: [u8; 32]) -> ClientConfig {
    let verifier = Arc::new(SpkiPinVerifier::new(spki_pin));
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let mut tls = rustls::ClientConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&rustls::version::TLS13])
        .expect("TLS versions")
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    tls.alpn_protocols = vec![b"zhtp-uhp/2".to_vec()];

    let mut transport = TransportConfig::default();
    transport.max_idle_timeout(Some(Duration::from_secs(60).try_into().unwrap()));
    transport.keep_alive_interval(Some(Duration::from_secs(15)));

    let mut cfg = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(tls).unwrap(),
    ));
    cfg.transport_config(Arc::new(transport));
    cfg
}

async fn quic_connect_with_endpoint(
    host: &str,
    port: u16,
    server_name: &str,
    cfg: ClientConfig,
) -> Result<(Endpoint, Connection)> {
    let bind_addr = "[::]:0".parse()?;
    let mut endpoint = Endpoint::client(bind_addr)?;
    endpoint.set_default_client_config(cfg);

    let addr = (host, port)
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| anyhow::anyhow!("failed to resolve host"))?;
    log::info!(
        "[🌐 Web4] [quinn-ffi] connect: host={} port={} sni={}",
        host,
        port,
        server_name
    );
    let connecting = endpoint.connect(addr, server_name)?;
    let conn = timeout(Duration::from_secs(10), connecting)
        .await
        .map_err(|_| anyhow::anyhow!("connect timed out"))??;
    Ok((endpoint, conn))
}

fn export_channel_binding(conn: &Connection) -> [u8; 32] {
    let mut out = [0u8; 32];
    conn.export_keying_material(&mut out, &[], b"zhtp-uhp-channel-binding")
        .expect("TLS exporter failed");
    let prefix = hex_prefix(&out, 8);
    log::info!("[🌐 Web4] [quinn-ffi] channel binding hex[0..8]={}", prefix);
    out
}

fn log_signature(label: &str, signature: &lib_crypto::types::Signature) {
    let sig_len = signature.signature.len();
    let pk_len = signature.public_key.dilithium_pk.len();
    let algo = match signature.algorithm {
        SignatureAlgorithm::Dilithium2 => "Dilithium2",
        SignatureAlgorithm::Dilithium5 => "Dilithium5",
        SignatureAlgorithm::RingSignature => "RingSignature",
    };
    let sig_prefix = hex_prefix(&signature.signature, 8);
    let pk_prefix = hex_prefix(&signature.public_key.dilithium_pk, 8);
    log::info!(
        "[🌐 Web4] [quinn-ffi] {label}: sig_len={sig_len} sig_hex[0..8]={sig_prefix} pk_len={pk_len} pk_hex[0..8]={pk_prefix} algo={algo}"
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
        log::info!(
            "[🌐 Web4] [quinn-ffi] pqc_offer: suite={} sig_len={} sig_hex[0..8]={} pk_len={} pk_hex[0..8]={}",
            offer.suite.as_str(),
            offer.signature.len(),
            sig_prefix,
            offer.dilithium_public_key.len(),
            pk_prefix
        );
    }
    log_signature("client_hello.signature", &client_hello.signature);
    let hello_msg = HandshakeMessage::new(HandshakePayload::ClientHello(client_hello.clone()));
    let client_hello_bytes = hello_msg.to_bytes()?;
    let client_hello_hash = hash_sha3_256(&client_hello_bytes);
    log::info!(
        "[🌐 Web4] [quinn-ffi] client_hello: bytes_len={} hash[0..8]={}",
        client_hello_bytes.len(),
        hex_prefix(&client_hello_hash, 8)
    );
    send_message(stream, &hello_msg).await?;

    let server_msg = recv_message(stream).await?;
    handshake::orchestrator::check_for_error(&server_msg)?;
    let server_hello = extract_payload(&server_msg, "ServerHello", |payload| {
        if let HandshakePayload::ServerHello(sh) = payload {
            Some(sh.clone())
        } else {
            None
        }
    })?;
    let server_hello_bytes = server_msg.to_bytes()?;
    log_signature("server_hello.signature", &server_hello.signature);
    log::info!(
        "[🌐 Web4] [quinn-ffi] server_hello: bytes_len={} hash[0..8]={}",
        server_hello_bytes.len(),
        hex_prefix(&hash_sha3_256(&server_hello_bytes), 8)
    );

    let skip_server_verify = std::env::var("UHP_SKIP_SERVER_VERIFY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if skip_server_verify {
        log::warn!("[🌐 Web4] [quinn-ffi] server_hello: verify skipped (UHP_SKIP_SERVER_VERIFY)");
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
    log::info!(
        "[🌐 Web4] [quinn-ffi] client_finish: bytes_len={} hash[0..8]={}",
        client_finish_bytes.len(),
        hex_prefix(&hash_sha3_256(&client_finish_bytes), 8)
    );
    send_message(stream, &finish_msg).await?;

    let mut transcript = Vec::new();
    transcript.extend_from_slice(&client_hello_bytes);
    transcript.extend_from_slice(&server_hello_bytes);
    transcript.extend_from_slice(&client_finish_bytes);
    let handshake_hash = hash_sha3_256(&transcript);
    log::info!(
        "[🌐 Web4] [quinn-ffi] handshake_hash[0..8]={}",
        hex_prefix(&handshake_hash, 8)
    );

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

fn take_client(handle: u64) -> Option<QuinnClient> {
    CLIENTS.lock().ok().and_then(|mut map| map.remove(&handle))
}

pub fn quic_connect_and_handshake(
    host: &str,
    port: u16,
    server_name: &str,
    spki_pin: [u8; 32],
    identity_json: &str,
    key_bytes: UhpPrivateKeyBytes,
    chain_id: u8,
) -> Result<QuinnHandshakeResult> {
    uhp_quinn_init();

    let nonce_cache_path = unique_nonce_cache_path()?;
    log::info!("[🌐 Web4] [quinn-ffi] nonce cache path: {}", nonce_cache_path);
    let mut identity = load_identity(identity_json, &key_bytes)?;
    apply_deterministic_node_id(&mut identity);

    let (handle, session_info) = block_on_with_runtime(async {
        let cfg = make_client_config(spki_pin);
        log_identity_details(&identity);
        let (endpoint, conn) = quic_connect_with_endpoint(host, port, server_name, cfg).await?;
        let binding = export_channel_binding(&conn);

        let (send, recv) = conn.open_bi().await?;
        let mut stream = QuinnStream::new(send, recv);

        let epoch = NetworkEpoch::from_chain_id(chain_id);
        let nonce_cache = NonceCache::open(&nonce_cache_path, NONCE_TTL_SECS, NONCE_MAX_ENTRIES, epoch)?;
        let ctx = HandshakeContext::new(nonce_cache)
            .for_client_with_transport(binding.to_vec(), "quic");
        let capabilities = build_capabilities();

        let (result, handshake_hash) = timeout(
            Duration::from_secs(30),
            handshake_with_transcript(&mut stream, &ctx, &identity, capabilities),
        )
        .await
        .map_err(|_| anyhow::anyhow!("handshake timed out"))??;

        let peer_did = result.peer_identity.did.clone();
        let client_did = identity.did.clone();

        let mut session_id = [0u8; 32];
        session_id[..result.session_id.len()].copy_from_slice(&result.session_id);

        let session = UhpSessionInfo {
            session_key: result.session_key,
            session_id,
            session_id_len: result.session_id.len(),
            handshake_hash,
            peer_did,
            pqc_hybrid_enabled: result.pqc_hybrid_enabled,
            client_did,
        };
        log::info!(
            "[🌐 Web4] [quinn-ffi] session: id_len={} key[0..8]={} id[0..8]={} pqc={}",
            session.session_id_len,
            hex_prefix(&session.session_key, 8),
            hex_prefix(&session.session_id, 8),
            session.pqc_hybrid_enabled
        );

        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        CLIENTS
            .lock()
            .map_err(|_| anyhow::anyhow!("client map poisoned"))?
            .insert(id, QuinnClient { _endpoint: endpoint, connection: conn });

        let mac_key = derive_mac_key(&session.session_key, &session.handshake_hash)?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let auth_session = AuthSession {
            session_id: session.session_id.to_vec(),
            mac_key,
            sequence: 1,
            client_did: session.client_did.clone(),
            server_did: session.peer_did.clone(),
            created_at: now,
            last_activity: now,
        };
        SESSIONS
            .lock()
            .map_err(|_| anyhow::anyhow!("session map poisoned"))?
            .insert(id, auth_session);

        Ok::<(u64, UhpSessionInfo), anyhow::Error>((id, session))
    })?;

    Ok(QuinnHandshakeResult { handle, session: session_info })
}

pub fn quic_request(handle: u64, request: &[u8]) -> Result<Vec<u8>> {
    let connection = {
        let map = CLIENTS
            .lock()
            .map_err(|_| anyhow::anyhow!("client map poisoned"))?;
        map.get(&handle)
            .map(|client| client.connection.clone())
            .ok_or_else(|| anyhow::anyhow!("invalid QUIC handle"))?
    };

    block_on_with_runtime(async move {
        let (mut send, mut recv) = connection.open_bi().await?;
        send.write_all(request).await?;
        send.finish()?;

        let response = recv.read_to_end(16 * 1024 * 1024).await?;
        Ok::<Vec<u8>, anyhow::Error>(response)
    })
}

pub fn quic_authenticated_request(
    handle: u64,
    method: &str,
    path: &str,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
) -> Result<(u16, Vec<u8>)> {
    let connection = {
        let map = CLIENTS
            .lock()
            .map_err(|_| anyhow::anyhow!("client map poisoned"))?;
        map.get(&handle)
            .map(|client| client.connection.clone())
            .ok_or_else(|| anyhow::anyhow!("invalid QUIC handle"))?
    };

    let mut session = {
        let map = SESSIONS
            .lock()
            .map_err(|_| anyhow::anyhow!("session map poisoned"))?;
        map.get(&handle)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing auth session"))?
    };

    let requester = session.client_did.clone();
    let result = block_on_with_runtime(async {
        send_authenticated_zhtp_request(
            &connection,
            &mut session,
            method,
            path,
            headers,
            body,
            requester,
        )
        .await
    })?;

    SESSIONS
        .lock()
        .map_err(|_| anyhow::anyhow!("session map poisoned"))?
        .insert(handle, session);

    Ok(result)
}

pub fn quic_close(handle: u64) {
    if let Some(client) = take_client(handle) {
        client.connection.close(0u32.into(), b"");
    }
    let _ = SESSIONS.lock().map(|mut map| map.remove(&handle));
}
