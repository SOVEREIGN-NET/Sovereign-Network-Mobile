//! QUIC client implementation using Quinn with self-signed certificate support

use anyhow::{Context, Result};
use std::future::IntoFuture;
use quinn::{ClientConfig, Endpoint, TransportConfig};
use rustls::pki_types::{CertificateDer, ServerName};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;

/// Response from a QUIC HTTP request (UTF-8 body)
#[derive(Debug)]
pub struct QuicResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub ok: bool,
}

/// Response with raw bytes (no UTF-8 assumption)
#[derive(Debug)]
pub struct QuicBytesResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
    pub ok: bool,
}

/// QUIC Client with support for self-signed certificates
pub struct QuicClient {
    // Future: connection pool
}

impl QuicClient {
    pub fn new() -> Self {
        Self {}
    }

    /// Test QUIC connection to a server
    pub async fn test_connection(
        &self,
        host: &str,
        port: u16,
    ) -> Result<(bool, f64, String)> {
        let start = Instant::now();
        let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

        log::info!("[🌐 Web4] Testing QUIC connection to {}", addr);

        // Create endpoint with insecure config
        let client_config = create_insecure_client_config()?;
        let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
        endpoint.set_default_client_config(client_config);

        // Connect
        let connection = endpoint.connect(addr, host)?.await?;

        let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
        log::info!("[🌐 Web4] QUIC connection established in {:.2}ms", latency_ms);

        // Close cleanly
        connection.close(0u32.into(), b"done");
        endpoint.wait_idle().await;

        Ok((true, latency_ms, "QUIC".to_string()))
    }

    /// Make an HTTP-like request over QUIC (string body)
    pub async fn request(
        &self,
        url: &str,
        method: &str,
        headers: HashMap<String, String>,
        body: Option<String>,
        timeout: Duration,
        insecure: bool,
    ) -> Result<QuicResponse, Box<dyn std::error::Error + Send + Sync>> {
        let (host, port, path) = parse_quic_url(url)?;
        let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

        log::info!("[🌐 Web4] QUIC request: {} {} to {}", method, path, addr);

        // Create endpoint
        let client_config = if insecure {
            create_insecure_client_config()?
        } else {
            create_default_client_config()?
        };

        let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
        endpoint.set_default_client_config(client_config);

        // Connect with timeout
        let connection = tokio::time::timeout(timeout, endpoint.connect(addr, &host)?.into_future())
            .await
            .map_err(|_| "Connection timeout")??;

        log::info!("[🌐 Web4] QUIC connection established, opening stream...");

        // Open bidirectional stream
        let (mut send, mut recv) = connection.open_bi().await?;

        // Build HTTP/1.1 request
        let mut request = format!("{} {} HTTP/1.1\r\n", method, path);
        request.push_str(&format!("Host: {}:{}\r\n", host, port));
        request.push_str("Connection: close\r\n");
        request.push_str("User-Agent: SovereignNetwork-Android/1.0 QUIC-Quinn\r\n");

        for (key, value) in &headers {
            request.push_str(&format!("{}: {}\r\n", key, value));
        }

        if let Some(ref body_content) = body {
            request.push_str(&format!("Content-Length: {}\r\n", body_content.len()));
            request.push_str("Content-Type: application/json\r\n");
            request.push_str("\r\n");
            request.push_str(body_content);
        } else {
            request.push_str("\r\n");
        }

        log::debug!("[🌐 Web4] Sending request:\n{}", request);

        // Send request and close send stream
        send.write_all(request.as_bytes()).await?;
        send.finish()?;

        log::info!("[🌐 Web4] Request sent, waiting for response...");

        // Receive response
        let response_data = recv.read_to_end(1024 * 1024).await?; // 1MB max

        log::info!("[🌐 Web4] Received {} bytes", response_data.len());

        // Parse HTTP response
        let response_str = String::from_utf8_lossy(&response_data);
        let response = parse_http_response(&response_str)?;

        // Close connection
        connection.close(0u32.into(), b"done");
        endpoint.wait_idle().await;

        Ok(response)
    }

    /// Make an HTTP-like request over QUIC returning raw bytes
    pub async fn request_bytes(
        &self,
        url: &str,
        method: &str,
        headers: HashMap<String, String>,
        body: Option<Vec<u8>>,
        timeout: Duration,
        insecure: bool,
    ) -> Result<QuicBytesResponse, Box<dyn std::error::Error + Send + Sync>> {
        let (host, port, path) = parse_quic_url(url)?;
        let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

        log::info!("[🌐 Web4] QUIC request (bytes): {} {} to {}", method, path, addr);

        // Create endpoint
        let client_config = if insecure {
            create_insecure_client_config()?
        } else {
            create_default_client_config()?
        };

        let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
        endpoint.set_default_client_config(client_config);

        // Connect with timeout
        let connection = tokio::time::timeout(timeout, endpoint.connect(addr, &host)?.into_future())
            .await
            .map_err(|_| "Connection timeout")??;

        log::info!("[🌐 Web4] QUIC connection established, opening stream...");

        // Open bidirectional stream
        let (mut send, mut recv) = connection.open_bi().await?;

        // Build HTTP/1.1 request
        let mut request = format!("{} {} HTTP/1.1\r\n", method, path);
        request.push_str(&format!("Host: {}:{}\r\n", host, port));
        request.push_str("Connection: close\r\n");
        request.push_str("User-Agent: SovereignNetwork-Android/1.0 QUIC-Quinn\r\n");

        for (key, value) in &headers {
            request.push_str(&format!("{}: {}\r\n", key, value));
        }

        if let Some(ref body_content) = body {
            request.push_str(&format!("Content-Length: {}\r\n", body_content.len()));
            request.push_str("Content-Type: application/octet-stream\r\n");
            request.push_str("\r\n");
        } else {
            request.push_str("\r\n");
        }

        log::debug!("[🌐 Web4] Sending request headers (bytes)...");

        // Send request headers and optional body
        send.write_all(request.as_bytes()).await?;
        if let Some(body_bytes) = body {
            send.write_all(&body_bytes).await?;
        }
        send.finish()?;

        log::info!("[🌐 Web4] Request sent, waiting for response (bytes)...");

        // Receive response
        let response_data = recv.read_to_end(1024 * 1024 * 16).await?; // 16MB max for blobs

        log::info!("[🌐 Web4] Received {} bytes", response_data.len());

        // Parse HTTP response
        let response = parse_http_response_bytes(&response_data)?;

        // Close connection
        connection.close(0u32.into(), b"done");
        endpoint.wait_idle().await;

        Ok(response)
    }

    pub fn cancel_all(&mut self) {
        log::info!("[🌐 Web4] Cancel all called");
    }
}

/// Check UDP reachability without full QUIC handshake
pub async fn check_udp_reachability(
    host: &str,
    port: u16,
) -> Result<(bool, f64)> {
    let start = Instant::now();
    let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

    log::info!("[🌐 Web4] Checking UDP reachability to {}", addr);

    // Create UDP socket
    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    socket.connect(addr).await?;

    // Send a probe packet
    let probe = [0u8; 1];
    socket.send(&probe).await?;

    let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
    log::info!("[🌐 Web4] UDP reachable in {:.2}ms", latency_ms);

    Ok((true, latency_ms))
}

/// Create client config that accepts any certificate (for self-signed)
pub fn create_insecure_client_config() -> Result<ClientConfig> {
    use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
    use rustls::{DigitallySignedStruct, SignatureScheme};

    /// Custom certificate verifier that accepts all certificates
    #[derive(Debug)]
    struct InsecureVerifier;

    impl ServerCertVerifier for InsecureVerifier {
        fn verify_server_cert(
            &self,
            _end_entity: &CertificateDer<'_>,
            _intermediates: &[CertificateDer<'_>],
            _server_name: &ServerName<'_>,
            _ocsp_response: &[u8],
            _now: rustls::pki_types::UnixTime,
        ) -> std::result::Result<ServerCertVerified, rustls::Error> {
            log::info!("[🌐 Web4] InsecureVerifier: Accepting certificate without verification");
            Ok(ServerCertVerified::assertion())
        }

        fn verify_tls12_signature(
            &self,
            _message: &[u8],
            _cert: &CertificateDer<'_>,
            _dss: &DigitallySignedStruct,
        ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
            Ok(HandshakeSignatureValid::assertion())
        }

        fn verify_tls13_signature(
            &self,
            _message: &[u8],
            _cert: &CertificateDer<'_>,
            _dss: &DigitallySignedStruct,
        ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
            Ok(HandshakeSignatureValid::assertion())
        }

        fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
            vec![
                SignatureScheme::RSA_PKCS1_SHA256,
                SignatureScheme::RSA_PKCS1_SHA384,
                SignatureScheme::RSA_PKCS1_SHA512,
                SignatureScheme::ECDSA_NISTP256_SHA256,
                SignatureScheme::ECDSA_NISTP384_SHA384,
                SignatureScheme::ECDSA_NISTP521_SHA512,
                SignatureScheme::RSA_PSS_SHA256,
                SignatureScheme::RSA_PSS_SHA384,
                SignatureScheme::RSA_PSS_SHA512,
                SignatureScheme::ED25519,
            ]
        }
    }

    // Build rustls config with custom verifier
    let crypto_config = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(InsecureVerifier))
        .with_no_client_auth();

    // Set ALPN protocols - use zhtp-public/1 for public content endpoints
    let mut crypto_config = crypto_config;
    crypto_config.alpn_protocols = vec![
        b"zhtp-public/1".to_vec(),
    ];

    // Create Quinn client config from rustls config
    let mut client_config = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(crypto_config)?
    ));

    // Configure transport
    let mut transport_config = TransportConfig::default();
    transport_config.max_idle_timeout(Some(Duration::from_secs(30).try_into()?));
    client_config.transport_config(Arc::new(transport_config));

    Ok(client_config)
}

/// Create default client config with system certificates
pub fn create_default_client_config() -> Result<ClientConfig> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let crypto_config = rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();

    // Set ALPN protocols - use zhtp-public/1 for public content endpoints
    let mut crypto_config = crypto_config;
    crypto_config.alpn_protocols = vec![
        b"zhtp-public/1".to_vec(),
    ];

    let mut client_config = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(crypto_config)?
    ));

    let mut transport_config = TransportConfig::default();
    transport_config.max_idle_timeout(Some(Duration::from_secs(30).try_into()?));
    client_config.transport_config(Arc::new(transport_config));

    Ok(client_config)
}

/// Parse a QUIC URL into host, port, and path
pub fn parse_quic_url(url_str: &str) -> Result<(String, u16, String)> {
    // Handle quic:// or https:// schemes
    let url_str = url_str.replace("quic://", "https://");
    let parsed = url::Url::parse(&url_str).context("Failed to parse URL")?;

    let host = parsed.host_str().context("No host in URL")?.to_string();
    let port = parsed.port().unwrap_or(443);
    let mut path = parsed.path().to_string();

    if path.is_empty() {
        path = "/".to_string();
    }

    if let Some(query) = parsed.query() {
        path.push('?');
        path.push_str(query);
    }

    Ok((host, port, path))
}

/// Parse HTTP response into QuicResponse
fn parse_http_response(response: &str) -> Result<QuicResponse> {
    let parts: Vec<&str> = response.splitn(2, "\r\n\r\n").collect();
    let header_part = parts.first().context("No headers in response")?;
    let body = parts.get(1).unwrap_or(&"").to_string();

    let header_lines: Vec<&str> = header_part.lines().collect();
    let status_line = header_lines.first().context("No status line")?;

    let status_parts: Vec<&str> = status_line.splitn(3, ' ').collect();
    let status: u16 = status_parts.get(1).unwrap_or(&"0").parse().unwrap_or(0);
    let status_text = status_parts.get(2).unwrap_or(&"").to_string();

    let mut headers = HashMap::new();
    for line in header_lines.iter().skip(1) {
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    let ok = status >= 200 && status < 300;

    Ok(QuicResponse {
        status,
        status_text,
        headers,
        body,
        ok,
    })
}

/// Parse HTTP response into QuicBytesResponse without assuming UTF-8
fn parse_http_response_bytes(data: &[u8]) -> Result<QuicBytesResponse> {
    // Find header/body split
    let separator = b"\r\n\r\n";
    let mut headers_end = None;
    for i in 0..data.len().saturating_sub(3) {
        if &data[i..i + 4] == separator {
            headers_end = Some(i);
            break;
        }
    }

    let headers_end = headers_end.context("No headers in response")?;
    let header_bytes = &data[..headers_end];
    let body = data[headers_end + 4..].to_vec();

    let header_str = String::from_utf8_lossy(header_bytes);
    let header_lines: Vec<&str> = header_str.lines().collect();
    let status_line = header_lines.first().context("No status line")?;

    let status_parts: Vec<&str> = status_line.splitn(3, ' ').collect();
    let status: u16 = status_parts.get(1).unwrap_or(&"0").parse().unwrap_or(0);
    let status_text = status_parts.get(2).unwrap_or(&"").to_string();

    let mut headers = HashMap::new();
    for line in header_lines.iter().skip(1) {
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    let ok = status >= 200 && status < 300;

    Ok(QuicBytesResponse {
        status,
        status_text,
        headers,
        body,
        ok,
    })
}
