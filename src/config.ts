/**
 * Application Configuration
 * Centralized config loaded from environment
 */

// Load from .env or use defaults
const ZHTP_NODE_URL = process.env.ZHTP_NODE_URL || 'http://77.42.37.161:9334';

export const config = {
  ZHTP_NODE_URL,
};

export default config;
