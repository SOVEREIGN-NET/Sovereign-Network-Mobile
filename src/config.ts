/**
 * Application Configuration
 * Centralized config loaded from environment
 */

// Load from .env or use defaults
const ZHTP_NODE_URL = process.env.ZHTP_NODE_URL || 'http://192.168.1.31:9333';

export const config = {
  ZHTP_NODE_URL,
};

export default config;
