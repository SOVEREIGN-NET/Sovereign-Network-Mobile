#!/usr/bin/env node

/**
 * Generate config from .env file
 * This script reads .env and generates .env.generated.json which is used by src/config.ts
 * This ensures .env is the single source of truth for configuration
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const generatedPath = path.join(__dirname, '..', '.env.generated.json');

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

// Generate config
const envConfig = parseEnv(envPath);

const generatedConfig = {
  ZHTP_NODE_URL: envConfig.ZHTP_NODE_URL || 'http://77.42.37.161:9334',
};

// Write generated config
fs.writeFileSync(
  generatedPath,
  JSON.stringify(generatedConfig, null, 2),
  'utf8'
);

console.log(`✓ Generated config at ${generatedPath}`);
console.log(`  ZHTP_NODE_URL: ${generatedConfig.ZHTP_NODE_URL}`);
