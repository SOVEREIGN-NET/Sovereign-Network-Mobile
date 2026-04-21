#!/usr/bin/env node

/**
 * Generate config from .env file for all platforms
 * This script reads .env and generates:
 * - .env.generated.json for React Native (src/config.ts)
 * - ios/GeneratedConfig.swift for iOS native modules
 * - android/app/src/main/java/com/sovereignnetworkmobile/config/GeneratedConfig.kt for Android
 *
 * This ensures .env is the SINGLE SOURCE OF TRUTH for all platforms
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
      return { host: match[1], port: parseInt(match[2], 10) || 9334 };
    }
    return { host: 'g1.thesovereignnetwork.org', port: 9334 };
  }
}

// Parse node registry: "host:port:pin_hex,host:port:pin_hex,..."
// Returns array of { host, port, pin } objects
function parseNodeRegistry(registryStr) {
  if (!registryStr) return [];
  return registryStr.split(',').map(entry => {
    const parts = entry.trim().split(':');
    if (parts.length < 2) return null;
    // parts: [host, port, pin_hex (optional)]
    return { host: parts[0], port: parseInt(parts[1], 10), pin: parts[2] || '' };
  }).filter(Boolean);
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
const nodeUrl = envConfig.ZHTP_NODE_URL || 'http://g1.thesovereignnetwork.org:9334';
const { host: nodeHost, port: nodePort } = parseNodeUrl(nodeUrl);
const sovTokenId = envConfig.SOV_TOKEN_ID || null;
const chainId = envConfig.CHAIN_ID || '2';
const nodeRegistry = parseNodeRegistry(envConfig.ZHTP_NODE_REGISTRY);
// Control plane pin = pin for the primary node host
const controlNodeEntry = nodeRegistry.find(n => n.host === nodeHost) || nodeRegistry[0];
const certificatePin = controlNodeEntry?.pin || '';

// ZDNS bootstrap config — A-record of `directory.sov` on the ZDNS server
// seeds the validator list. Overridable via .env for staging/custom topologies.
const zdnsHost = envConfig.ZDNS_HOST || '91.98.113.188';
const zdnsPort = parseInt(envConfig.ZDNS_PORT || '53', 10);
const zdnsDirectoryName = envConfig.ZDNS_DIRECTORY_NAME || 'directory.sov';
const quicPort = parseInt(envConfig.QUIC_PORT || '9334', 10);

// 1. Generate JSON config for React Native
const generatedConfig = {
  ZHTP_NODE_URL: nodeUrl,
  ZHTP_NODE_HOST: nodeHost,
  ZHTP_NODE_PORT: nodePort,
  CERTIFICATE_PIN: certificatePin, // empty = system CA trust
  SOV_TOKEN_ID: sovTokenId,
  CHAIN_ID: chainId,
  NODE_REGISTRY: nodeRegistry,
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
console.log(`  CERTIFICATE_PIN: ${certificatePin || '(none — system CA trust)'}`);
console.log(`  SOV_TOKEN_ID: ${sovTokenId || '(not set)'}`);
console.log(`  CHAIN_ID: ${chainId}`);
console.log(
  `  BUILD_INFO: ios=${iosBuild.version} (${iosBuild.build}), android=${androidBuild.version} (${androidBuild.build}), git=${gitInfo.commit}${gitInfo.dirty ? '-dirty' : ''} @ ${gitInfo.branch}`,
);

// 2. Generate iOS Swift config
const iosSpkiEntries = nodeRegistry.map(n => `        "${n.host}": "${n.pin}",`).join('\n');
const iosConfig = `import Foundation

/**
 * AUTO-GENERATED FILE - Do not edit manually
 * Generated by scripts/generate-config.js from .env file
 * Single source of truth: .env file
 */

struct GeneratedConfig {
    // Node/Server Configuration
    static let nodeUrl = "${nodeUrl}"
    static let nodeHost = "${nodeHost}"
    static let nodePort: UInt16 = ${nodePort}

    // QUIC Control Plane (used by NativeQuicModule for authenticated requests)
    static let quinnControlPlaneHost = "${nodeHost}"
    static let quinnControlPlanePort: UInt16 = ${nodePort}
    // Empty = use hostname as SNI
    static let quinnControlPlaneServerName = ""

    // SPKI pin for the control plane node (SHA-256 of SubjectPublicKeyInfo, hex-encoded)
    static let quinnSpkiPinHex = "${certificatePin}"

    // Per-host SPKI pins — generated from ZHTP_NODE_REGISTRY in .env
    private static let spkiPins: [String: String] = [
${iosSpkiEntries}
    ]

    static func spkiPin(for host: String) -> String {
        return spkiPins[host] ?? quinnSpkiPinHex
    }
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
const androidSpkiEntries = nodeRegistry.map(n => `        "${n.host}" to "${n.pin}",`).join('\n');
const androidConfig = `package com.sovereignnetworkmobile.config

/**
 * AUTO-GENERATED FILE - Do not edit manually
 * Generated by scripts/generate-config.js from .env file
 * Single source of truth: .env file
 */

object GeneratedConfig {
    // Node/Server Configuration
    const val NODE_URL = "${nodeUrl}"
    const val NODE_HOST = "${nodeHost}"
    const val NODE_PORT = ${nodePort}

    // QUIC Control Plane (used by NativeQuicModule for authenticated requests)
    const val QUINN_CONTROL_PLANE_HOST = "${nodeHost}"
    const val QUINN_CONTROL_PLANE_PORT = ${nodePort}
    // Empty = use hostname as SNI
    const val QUINN_CONTROL_PLANE_SERVER_NAME = ""

    // SPKI pin for the control plane node (SHA-256 of SubjectPublicKeyInfo, hex-encoded)
    const val QUINN_SPKI_PIN_HEX = "${certificatePin}"

    // Per-host SPKI pins — generated from ZHTP_NODE_REGISTRY in .env
    private val SPKI_PINS: Map<String, String> = mapOf(
${androidSpkiEntries}
    )

    fun spkiPinFor(host: String): String = SPKI_PINS[host] ?: QUINN_SPKI_PIN_HEX
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
