/**
 * TypeScript type definitions for liboqs React Native module
 * Provides type-safe access to quantum-resistant cryptography from JavaScript
 */

// MARK: - Algorithm Types

export type KEMAlgorithm =
  | "ML-KEM-768"
  | "ML-KEM-1024"
  | "Kyber768"
  | "Kyber1024"
  | "FrodoKEM-640-AES"
  | "FrodoKEM-640-SHAKE"
  | "FrodoKEM-976-AES"
  | "FrodoKEM-976-SHAKE";

export type SIGAlgorithm =
  | "ML-DSA-65"
  | "ML-DSA-87"
  | "Dilithium3"
  | "Dilithium5"
  | "Falcon-512"
  | "Falcon-1024"
  | "SPHINCS+-SHA2-128f"
  | "SPHINCS+-SHA2-256f";

// MARK: - KEM Operations

export interface KEMKeypair {
  publicKey: string; // Base64 encoded
  secretKey: string; // Base64 encoded
  algorithm: string;
  publicKeyLength: number;
  secretKeyLength: number;
}

export interface KEMEncapsulation {
  ciphertext: string; // Base64 encoded
  sharedSecret: string; // Base64 encoded
  ciphertextLength: number;
  sharedSecretLength: number;
}

export interface KEMDecapsulation {
  sharedSecret: string; // Base64 encoded
  sharedSecretLength: number;
}

// MARK: - Signature Operations

export interface SIGKeypair {
  publicKey: string; // Base64 encoded
  secretKey: string; // Base64 encoded
  algorithm: string;
  publicKeyLength: number;
  secretKeyLength: number;
}

export interface SIGSignatureResult {
  signature: string; // Base64 encoded
  signatureLength: number;
}

export interface SIGVerificationResult {
  valid: boolean;
}

// MARK: - React Native Module Interface

export interface LibOQSModule {
  // KEM Operations
  kemGenerateKeypair(algorithm: KEMAlgorithm): Promise<KEMKeypair>;

  kemEncapsulate(
    algorithm: KEMAlgorithm,
    publicKeyBase64: string
  ): Promise<KEMEncapsulation>;

  kemDecapsulate(
    algorithm: KEMAlgorithm,
    ciphertextBase64: string,
    secretKeyBase64: string
  ): Promise<KEMDecapsulation>;

  // Signature Operations
  sigGenerateKeypair(algorithm: SIGAlgorithm): Promise<SIGKeypair>;

  sigSign(
    algorithm: SIGAlgorithm,
    messageBase64: string,
    secretKeyBase64: string
  ): Promise<SIGSignatureResult>;

  sigVerify(
    algorithm: SIGAlgorithm,
    messageBase64: string,
    signatureBase64: string,
    publicKeyBase64: string
  ): Promise<SIGVerificationResult>;

  // Utility Methods
  getSupportedKEMAlgorithms(): Promise<KEMAlgorithm[]>;

  getSupportedSIGAlgorithms(): Promise<SIGAlgorithm[]>;

  getVersion(): Promise<string>;
}

// MARK: - Recommended Defaults

export const RECOMMENDED_KEM: KEMAlgorithm = "ML-KEM-768";
export const RECOMMENDED_SIG: SIGAlgorithm = "ML-DSA-65";

/**
 * Utility: Get module from React Native
 */
export function getLibOQSModule(): LibOQSModule {
  const { NativeModules } = require("react-native");
  const { LibOQS } = NativeModules;
  if (!LibOQS) {
    throw new Error(
      "LibOQS native module not found. Ensure it is linked properly."
    );
  }
  return LibOQS as LibOQSModule;
}

// MARK: - Helper Functions

/**
 * Utility: Convert string to base64
 */
export function stringToBase64(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

/**
 * Utility: Convert base64 to string
 */
export function base64ToString(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}

/**
 * Utility: Convert Uint8Array to base64
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Utility: Convert base64 to Uint8Array
 */
export function base64ToUint8Array(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
