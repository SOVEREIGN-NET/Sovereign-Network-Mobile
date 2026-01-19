use anyhow::Result;
use hmac::{Hmac, Mac};
use hkdf::Hkdf;
use sha3::Sha3_256;
use libc::{c_char, c_int, c_void};
use std::cell::RefCell;
use std::ffi::{CStr, CString};
use std::io::{Read, Write};
use std::ptr;
use tokio::runtime::Runtime;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use std::pin::Pin;
use std::task::{Context, Poll};

use lib_crypto::{KeyPair, PrivateKey, hash_sha3_256};
use lib_identity::ZhtpIdentity;
use lib_network::handshake::{
    self, ClientHello, ClientFinish, HandshakeCapabilities, HandshakeContext, HandshakeMessage,
    HandshakePayload, HandshakeRole, NetworkEpoch, NonceCache, PqcCapability,
};
use lib_network::handshake::core::{NonceTracker, recv_message, send_message};
use lib_network::handshake::orchestrator::{check_for_error, extract_payload};

const NONCE_TTL_SECS: u64 = 300;
const NONCE_MAX_ENTRIES: usize = 10_000;

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
pub extern "C" fn uhp_last_error_message() -> *const c_char {
    LAST_ERROR.with(|err| match &*err.borrow() {
        Some(msg) => msg.as_ptr(),
        None => ptr::null(),
    })
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
pub struct UhpIoCallbacks {
    pub ctx: *mut c_void,
    pub read: Option<extern "C" fn(ctx: *mut c_void, buf: *mut u8, len: usize) -> isize>,
    pub write: Option<extern "C" fn(ctx: *mut c_void, buf: *const u8, len: usize) -> isize>,
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

struct CallbackStream {
    io: UhpIoCallbacks,
}

impl CallbackStream {
    fn new(io: UhpIoCallbacks) -> Self {
        Self { io }
    }
}

impl Read for CallbackStream {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let cb = self
            .io
            .read
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "missing read callback"))?;
        let bytes = cb(self.io.ctx, buf.as_mut_ptr(), buf.len());
        if bytes < 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "read callback failed",
            ));
        }
        Ok(bytes as usize)
    }
}

impl Write for CallbackStream {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let cb = self
            .io
            .write
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "missing write callback"))?;
        let bytes = cb(self.io.ctx, buf.as_ptr(), buf.len());
        if bytes < 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "write callback failed",
            ));
        }
        Ok(bytes as usize)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl AsyncRead for CallbackStream {
    fn poll_read(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        let unfilled = buf.initialize_unfilled();
        let bytes_read = Read::read(this, unfilled)?;
        buf.advance(bytes_read);
        Poll::Ready(Ok(()))
    }
}

impl AsyncWrite for CallbackStream {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let this = self.get_mut();
        Poll::Ready(Write::write(this, buf))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        Poll::Ready(Write::flush(this))
    }

    fn poll_shutdown(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }
}

unsafe fn vec_from_raw(ptr: *const u8, len: usize) -> Result<Vec<u8>> {
    if ptr.is_null() || len == 0 {
        return Ok(Vec::new());
    }
    Ok(std::slice::from_raw_parts(ptr, len).to_vec())
}

fn load_identity(identity_json: &str, key_bytes: &UhpPrivateKeyBytes) -> Result<ZhtpIdentity> {
    let dilithium_sk = unsafe { vec_from_raw(key_bytes.dilithium_sk_ptr, key_bytes.dilithium_sk_len) }?;
    let kyber_sk = unsafe { vec_from_raw(key_bytes.kyber_sk_ptr, key_bytes.kyber_sk_len) }?;
    let master_seed = unsafe { vec_from_raw(key_bytes.master_seed_ptr, key_bytes.master_seed_len) }?;

    let private_key = PrivateKey {
        dilithium_sk,
        kyber_sk,
        master_seed,
    };

    ZhtpIdentity::from_serialized(identity_json, &private_key)
}

fn build_capabilities() -> HandshakeCapabilities {
    let mut caps = HandshakeCapabilities::default();
    caps.protocols = vec!["quic".to_string()];
    caps.pqc_capability = PqcCapability::Kyber1024Dilithium5;
    caps
}

fn run_handshake(
    io: UhpIoCallbacks,
    identity_json: &str,
    key_bytes: &UhpPrivateKeyBytes,
    channel_binding: &[u8],
    nonce_cache_path: &str,
    chain_id: u8,
) -> Result<(handshake::HandshakeResult, [u8; 32])> {
    let identity = load_identity(identity_json, key_bytes)?;

    let epoch = NetworkEpoch::from_chain_id(chain_id);
    let nonce_cache = NonceCache::open(nonce_cache_path, NONCE_TTL_SECS, NONCE_MAX_ENTRIES, epoch)?;
    let ctx = HandshakeContext::new(nonce_cache).for_client_with_transport(channel_binding.to_vec(), "quic");
    let capabilities = build_capabilities();

    let mut stream = CallbackStream::new(io);
    let runtime = Runtime::new()?;
    runtime.block_on(handshake_with_transcript(
        &mut stream,
        &ctx,
        &identity,
        capabilities,
    ))
}

async fn handshake_with_transcript<S>(
    stream: &mut S,
    ctx: &HandshakeContext,
    local_identity: &ZhtpIdentity,
    capabilities: HandshakeCapabilities,
) -> Result<(handshake::HandshakeResult, [u8; 32])>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let ctx = ctx.with_roles(HandshakeRole::Client, HandshakeRole::Server);
    let nonce_tracker = NonceTracker::new(&ctx.nonce_cache);

    let client_hello = ClientHello::new(local_identity, capabilities, &ctx)?;
    let hello_msg = HandshakeMessage::new(HandshakePayload::ClientHello(client_hello.clone()));
    let client_hello_bytes = hello_msg.to_bytes()?;
    let client_hello_hash = hash_sha3_256(&client_hello_bytes);
    send_message(stream, &hello_msg).await?;

    let server_msg = recv_message(stream).await?;
    check_for_error(&server_msg)?;
    let server_hello = extract_payload(&server_msg, "ServerHello", |payload| {
        if let HandshakePayload::ServerHello(sh) = payload {
            Some(sh.clone())
        } else {
            None
        }
    })?;
    let server_hello_bytes = server_msg.to_bytes()?;

    // UHP v2: Verify server signature with client_hello_hash
    server_hello.verify_signature(&client_hello.challenge_nonce, &client_hello_hash, &ctx)?;
    nonce_tracker.register(&server_hello.response_nonce, server_hello.timestamp)?;

    let keypair = KeyPair {
        public_key: local_identity.public_key.clone(),
        private_key: local_identity
            .private_key
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Missing private key"))?,
    };

    // UHP v2: Compute pre-finish transcript hash (ClientHello || ServerHello)
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

    let finish_msg = HandshakeMessage::new(HandshakePayload::ClientFinish(client_finish));
    let client_finish_bytes = finish_msg.to_bytes()?;
    send_message(stream, &finish_msg).await?;

    // UHP v2: Build full transcript hash for session derivation
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
pub extern "C" fn uhp_handshake(
    io: UhpIoCallbacks,
    identity_json_ptr: *const u8,
    identity_json_len: usize,
    key_bytes: UhpPrivateKeyBytes,
    channel_binding_ptr: *const u8,
    channel_binding_len: usize,
    nonce_cache_path: *const c_char,
    chain_id: u8,
    out_session: *mut UhpSession,
) -> c_int {
    if out_session.is_null() {
        set_last_error("null output session pointer");
        return -1;
    }

    if identity_json_ptr.is_null() || identity_json_len == 0 {
        set_last_error("missing identity JSON");
        return -1;
    }

    if channel_binding_ptr.is_null() || channel_binding_len == 0 {
        set_last_error("missing channel binding");
        return -1;
    }

    if nonce_cache_path.is_null() {
        set_last_error("missing nonce cache path");
        return -1;
    }

    let identity_json = unsafe { std::slice::from_raw_parts(identity_json_ptr, identity_json_len) };
    let identity_json = match std::str::from_utf8(identity_json) {
        Ok(val) => val,
        Err(err) => {
            set_last_error(format!("identity JSON is not valid UTF-8: {err}"));
            return -1;
        }
    };

    let channel_binding = unsafe { std::slice::from_raw_parts(channel_binding_ptr, channel_binding_len) };

    let nonce_cache_path = unsafe { CStr::from_ptr(nonce_cache_path) };
    let nonce_cache_path = match nonce_cache_path.to_str() {
        Ok(val) => val,
        Err(err) => {
            set_last_error(format!("nonce cache path is not valid UTF-8: {err}"));
            return -1;
        }
    };

    match run_handshake(
        io,
        identity_json,
        &key_bytes,
        channel_binding,
        nonce_cache_path,
        chain_id,
    ) {
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
pub extern "C" fn uhp_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        let _ = CString::from_raw(ptr);
    }
}

#[no_mangle]
pub extern "C" fn uhp_hkdf_sha3_256(
    ikm_ptr: *const u8,
    ikm_len: usize,
    salt_ptr: *const u8,
    salt_len: usize,
    info_ptr: *const u8,
    info_len: usize,
    out_ptr: *mut u8,
    out_len: usize,
) -> c_int {
    if ikm_ptr.is_null() || ikm_len == 0 || out_ptr.is_null() || out_len == 0 {
        set_last_error("invalid hkdf parameters");
        return -1;
    }

    let ikm = unsafe { std::slice::from_raw_parts(ikm_ptr, ikm_len) };
    let salt = if salt_ptr.is_null() || salt_len == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(salt_ptr, salt_len) }
    };
    let info = if info_ptr.is_null() || info_len == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(info_ptr, info_len) }
    };

    let hk = Hkdf::<Sha3_256>::new(Some(salt), ikm);
    let mut output = vec![0u8; out_len];
    if hk.expand(info, &mut output).is_err() {
        set_last_error("hkdf expansion failed");
        return -1;
    }

    unsafe {
        std::ptr::copy_nonoverlapping(output.as_ptr(), out_ptr, out_len);
    }
    0
}

#[no_mangle]
pub extern "C" fn uhp_hmac_sha3_256(
    key_ptr: *const u8,
    key_len: usize,
    msg_ptr: *const u8,
    msg_len: usize,
    out_ptr: *mut u8,
    out_len: usize,
) -> c_int {
    if key_ptr.is_null() || key_len == 0 || msg_ptr.is_null() || out_ptr.is_null() {
        set_last_error("invalid hmac parameters");
        return -1;
    }
    if out_len < 32 {
        set_last_error("hmac output buffer too small");
        return -1;
    }

    let key = unsafe { std::slice::from_raw_parts(key_ptr, key_len) };
    let msg = unsafe { std::slice::from_raw_parts(msg_ptr, msg_len) };

    let mac = Hmac::<Sha3_256>::new_from_slice(key).map_err(|_| {
        set_last_error("hmac key error");
        -1
    });
    if mac.is_err() {
        return -1;
    }
    let mut mac = mac.unwrap();
    mac.update(msg);
    let result = mac.finalize().into_bytes();

    unsafe {
        std::ptr::copy_nonoverlapping(result.as_ptr(), out_ptr, 32);
    }
    0
}
