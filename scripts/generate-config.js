#!/usr/bin/env node

/**
 * Generate config from .env file for all platforms
 * This script reads .env and generates:
 * - .env.generated.json for React Native (src/config.ts)
 * - ios/GeneratedConfig.swift for iOS native modules
 * - android/app/src/main/java/com/sovereignnetworkmobile/config/GeneratedConfig.kt for Android
 *
 * This ensures .env is the SINGLE SOURCE OF TRUTH for all platforms.
 *
 * UHP-v2 / DID-based identity:
 *   - There is no per-host TLS SPKI pin anymore.
 *   - Each bootstrap gateway carries an on-chain Dilithium DID. The native
 *     QUIC layer accepts any peer cert (TLS is just transport) and the
 *     UHP-v2 handshake's `peer_did` is matched against the configured
 *     `BOOTSTRAP_GATEWAY[_2]_DID`. Mismatch = reject (likely MITM).
 *   - Cert rotation is therefore a no-op for the app.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const generatedJsonPath = path.join(rootDir, '.env.generated.json');
const androidGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
const iosPbxprojPath = path.join(rootDir, 'ios', 'SovereignNetworkMobile.xcodeproj', 'project.pbxproj');
const iosConfigPath = path.join(rootDir, 'ios', 'GeneratedConfig.swift');
const androidConfigPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'sovereignnetworkmobile', 'config', 'GeneratedConfig.kt');

// Parse .env file
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found, using defaults`);
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const config = {};

  content.split('\n').forEach(line => {
    line = line.trim();
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      return;
    }

    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      config[key.trim()] = valueParts.join('=').trim();
    }
  });

  return config;
}

// Extract host and port from URL
function parseNodeUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port || 9334;
    return { host, port };
  } catch {
    // Fallback to manual parsing for simple URLs
    const match = url.match(/^https?:\/\/([^:]+):?(\d+)?/);
    if (match) {
      return { host: match[1], port: Number.parseInt(match[2], 10) || 9334 };
    }
    return { host: 'zhtp-gateway.thesovereignnetwork.org', port: 9334 };
  }
}

// Bootstrap gateway entry — host, IP, on-chain DID. SPKI pin is intentionally
// absent: identity is verified by the UHP-v2 handshake, not by TLS pinning.
function readBootstrapGateway(envConfig, suffix) {
  const host = envConfig[`BOOTSTRAP_GATEWAY${suffix}_HOST`];
  const ip = envConfig[`BOOTSTRAP_GATEWAY${suffix}_IP`];
  const did = envConfig[`BOOTSTRAP_GATEWAY${suffix}_DID`];
  if (!host || !did) return null;
  return { host, ip: ip || '', did };
}

// Extract Android version info from build.gradle
function readAndroidBuildInfo() {
  try {
    const gradle = fs.readFileSync(androidGradlePath, 'utf8');
    const codeMatch = gradle.match(/versionCode\s+(\d+)/);
    const nameMatch = gradle.match(/versionName\s+"([^"]+)"/);
    return {
      version: nameMatch ? nameMatch[1] : 'unknown',
      build: codeMatch ? codeMatch[1] : 'unknown',
    };
  } catch {
    return { version: 'unknown', build: 'unknown' };
  }
}

// Extract iOS version info from project.pbxproj (first occurrence — all targets paired)
function readIosBuildInfo() {
  try {
    const pbx = fs.readFileSync(iosPbxprojPath, 'utf8');
    const versionMatch = pbx.match(/MARKETING_VERSION\s*=\s*([^;]+);/);
    const buildMatch = pbx.match(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/);
    return {
      version: versionMatch ? versionMatch[1].trim() : 'unknown',
      build: buildMatch ? buildMatch[1].trim() : 'unknown',
    };
  } catch {
    return { version: 'unknown', build: 'unknown' };
  }
}

// Git info (short commit + branch). Safe fallback if git missing or not a repo.
function readGitInfo() {
  const safe = args => {
    try {
      return execFileSync('git', args, {
        cwd: rootDir,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      return '';
    }
  };
  return {
    commit: safe(['rev-parse', '--short', 'HEAD']) || 'unknown',
    branch: safe(['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown',
    dirty: safe(['status', '--porcelain']) !== '',
  };
}

const androidBuild = readAndroidBuildInfo();
const iosBuild = readIosBuildInfo();
const gitInfo = readGitInfo();
const buildInfo = {
  ios: iosBuild,
  android: androidBuild,
  gitCommit: gitInfo.commit,
  gitBranch: gitInfo.branch,
  gitDirty: gitInfo.dirty,
  generatedAt: new Date().toISOString(),
};

// Generate config
const envConfig = parseEnv(envPath);
const nodeUrl = envConfig.ZHTP_NODE_URL || 'http://zhtp-gateway.thesovereignnetwork.org:9334';
const { host: nodeHost, port: nodePort } = parseNodeUrl(nodeUrl);
const sovTokenId = envConfig.SOV_TOKEN_ID || null;
const chainId = envConfig.CHAIN_ID || '3';

const bootstrapPrimary = readBootstrapGateway(envConfig, '');
const bootstrapFallback = readBootstrapGateway(envConfig, '_2');
if (!bootstrapPrimary) {
  throw new Error(
    'CRITICAL: BOOTSTRAP_GATEWAY_HOST / BOOTSTRAP_GATEWAY_DID missing in .env — ' +
      'the app cannot bootstrap without a known gateway DID to verify against.',
  );
}
const bootstrapGateways = [bootstrapPrimary, bootstrapFallback].filter(Boolean);

// ZDNS bootstrap config — A-record of `directory.sov` on the ZDNS server
// seeds the validator list. Overridable via .env for staging/custom topologies.
const zdnsHost = envConfig.ZDNS_HOST || '91.98.113.188';
const zdnsPort = Number.parseInt(envConfig.ZDNS_PORT || '53', 10);
const zdnsDirectoryName = envConfig.ZDNS_DIRECTORY_NAME || 'directory.sov';
const quicPort = Number.parseInt(envConfig.QUIC_PORT || '9334', 10);

// 1. Generate JSON config for React Native
const generatedConfig = {
  ZHTP_NODE_URL: nodeUrl,
  ZHTP_NODE_HOST: nodeHost,
  ZHTP_NODE_PORT: nodePort,
  SOV_TOKEN_ID: sovTokenId,
  CHAIN_ID: chainId,
  BOOTSTRAP_GATEWAYS: bootstrapGateways,
  ZDNS_HOST: zdnsHost,
  ZDNS_PORT: zdnsPort,
  ZDNS_DIRECTORY_NAME: zdnsDirectoryName,
  QUIC_PORT: quicPort,
  BUILD_INFO: buildInfo,
};

fs.writeFileSync(
  generatedJsonPath,
  JSON.stringify(generatedConfig, null, 2),
  'utf8'
);

console.log(`✓ Generated React Native config at ${generatedJsonPath}`);
console.log(`  ZHTP_NODE_URL: ${generatedConfig.ZHTP_NODE_URL}`);
console.log(`  ZHTP_NODE_HOST: ${generatedConfig.ZHTP_NODE_HOST}`);
console.log(`  ZHTP_NODE_PORT: ${generatedConfig.ZHTP_NODE_PORT}`);
console.log(`  SOV_TOKEN_ID: ${sovTokenId || '(not set)'}`);
console.log(`  CHAIN_ID: ${chainId}`);
bootstrapGateways.forEach((g, i) => {
  console.log(
    `  BOOTSTRAP_GATEWAY${i === 0 ? '' : '_' + (i + 1)}: ${g.host} (${g.ip}) → ${g.did.substring(0, 24)}…`,
  );
});
console.log(
  `  BUILD_INFO: ios=${iosBuild.version} (${iosBuild.build}), android=${androidBuild.version} (${androidBuild.build}), git=${gitInfo.commit}${gitInfo.dirty ? '-dirty' : ''} @ ${gitInfo.branch}`,
);

// 2. Generate iOS Swift config
const iosBootstrapEntries = bootstrapGateways
  .map(
    g =>
      `        BootstrapGateway(host: "${g.host}", ip: "${g.ip}", did: "${g.did}"),`,
  )
  .join('\n');
const iosConfig = `import Foundation

/**
 * AUTO-GENERATED FILE - Do not edit manually
 * Generated by scripts/generate-config.js from .env file
 * Single source of truth: .env file
 *
 * Identity is verified by UHP-v2 DID, not by TLS SPKI pinning.
 */

struct BootstrapGateway {
    let host: String
    let ip: String
    let did: String
}

struct GeneratedConfig {
    // Node/Server Configuration
    static let nodeUrl = "${nodeUrl}"
    static let nodeHost = "${nodeHost}"
    static let nodePort: UInt16 = ${nodePort}

    // Bootstrap gateways — first entry is primary, second is fallback.
    // The app dials these, then verifies the UHP-v2 handshake's peer_did
    // matches the configured did field. Mismatch is treated as MITM.
    static let bootstrapGateways: [BootstrapGateway] = [
${iosBootstrapEntries}
    ]
}
`;

// Ensure directory exists
const iosDir = path.dirname(iosConfigPath);
if (!fs.existsSync(iosDir)) {
  fs.mkdirSync(iosDir, { recursive: true });
}

fs.writeFileSync(iosConfigPath, iosConfig, 'utf8');
console.log(`✓ Generated iOS config at ${iosConfigPath}`);

// 3. Generate Android Kotlin config
const androidBootstrapEntries = bootstrapGateways
  .map(
    g =>
      `        BootstrapGateway(host = "${g.host}", ip = "${g.ip}", did = "${g.did}"),`,
  )
  .join('\n');
const androidConfig = `package com.sovereignnetworkmobile.config

/**
 * AUTO-GENERATED FILE - Do not edit manually
 * Generated by scripts/generate-config.js from .env file
 * Single source of truth: .env file
 *
 * Identity is verified by UHP-v2 DID, not by TLS SPKI pinning.
 */

data class BootstrapGateway(
    val host: String,
    val ip: String,
    val did: String,
)

object GeneratedConfig {
    // Node/Server Configuration
    const val NODE_URL = "${nodeUrl}"
    const val NODE_HOST = "${nodeHost}"
    const val NODE_PORT = ${nodePort}

    // Bootstrap gateways — first entry is primary, second is fallback.
    // The app dials these, then verifies the UHP-v2 handshake's peer_did
    // matches the configured did field. Mismatch is treated as MITM.
    val BOOTSTRAP_GATEWAYS: List<BootstrapGateway> = listOf(
${androidBootstrapEntries}
    )
}
`;

// Ensure directory exists
const androidDir = path.dirname(androidConfigPath);
if (!fs.existsSync(androidDir)) {
  fs.mkdirSync(androidDir, { recursive: true });
}

fs.writeFileSync(androidConfigPath, androidConfig, 'utf8');
console.log(`✓ Generated Android config at ${androidConfigPath}`);

console.log(`\n✅ All platform configs generated from .env - single source of truth established!`);
