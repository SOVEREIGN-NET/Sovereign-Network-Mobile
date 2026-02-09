use anyhow::Result;
use zhtp_client::identity::{
    deserialize_identity, get_seed_phrase, restore_identity_from_phrase, serialize_identity,
    sign_message, sign_registration_proof, Identity,
};
use zhtp_client::{generate_identity, get_public_identity};
use serde_json::json;

pub struct GeneratedIdentity {
    pub did: String,
    pub device_id: String,
    pub public_key: Vec<u8>,
    pub kyber_public_key: Vec<u8>,
    pub node_id: Vec<u8>,
    pub created_at: u64,
    pub identity_json: String,
    pub handshake_json: String,
    pub dilithium_sk: Vec<u8>,
    pub kyber_sk: Vec<u8>,
    pub master_seed: Vec<u8>,
}

pub fn generate_identity_bundle(device_id: &str) -> Result<GeneratedIdentity> {
    let identity = generate_identity(device_id.to_string())?;
    let public = get_public_identity(&identity);
    let identity_json = serialize_identity(&identity)?;
    let handshake_json = identity_to_handshake_json(&identity)?;

    Ok(GeneratedIdentity {
        did: public.did,
        device_id: public.device_id,
        public_key: public.public_key,
        kyber_public_key: public.kyber_public_key,
        node_id: public.node_id,
        created_at: public.created_at,
        identity_json,
        handshake_json,
        dilithium_sk: identity.private_key,
        kyber_sk: identity.kyber_secret_key,
        master_seed: identity.recovery_entropy,
    })
}

pub fn sign_registration_proof_from_identity(identity_json: &str, timestamp: u64) -> Result<Vec<u8>> {
    let identity = deserialize_identity(identity_json)?;
    Ok(sign_registration_proof(&identity, timestamp)?)
}

pub fn sign_message_from_identity(identity_json: &str, message: &[u8]) -> Result<Vec<u8>> {
    let identity = deserialize_identity(identity_json)?;
    Ok(sign_message(&identity, message)?)
}

pub fn validate_identity_json(identity_json: &str) -> Result<()> {
    let _identity = deserialize_identity(identity_json)?;
    Ok(())
}

pub fn get_seed_phrase_from_identity(identity_json: &str) -> Result<String> {
    let identity = deserialize_identity(identity_json)?;
    Ok(get_seed_phrase(&identity)?)
}

pub fn restore_identity_bundle_from_phrase(phrase: &str, device_id: &str) -> Result<GeneratedIdentity> {
    let identity = restore_identity_from_phrase(phrase, device_id.to_string())?;
    let public = get_public_identity(&identity);
    let identity_json = serialize_identity(&identity)?;
    let handshake_json = identity_to_handshake_json(&identity)?;

    Ok(GeneratedIdentity {
        did: public.did,
        device_id: public.device_id,
        public_key: public.public_key,
        kyber_public_key: public.kyber_public_key,
        node_id: public.node_id,
        created_at: public.created_at,
        identity_json,
        handshake_json,
        dilithium_sk: identity.private_key,
        kyber_sk: identity.kyber_secret_key,
        master_seed: identity.recovery_entropy,
    })
}

pub fn identity_to_handshake_json(identity: &Identity) -> Result<String> {
    let key_id = zhtp_client::crypto::Blake3::hash(&identity.public_key);
    let id_hex = identity.did.strip_prefix("did:zhtp:").unwrap_or(&identity.did);
    let id_bytes: Vec<u8> = hex::decode(id_hex).unwrap_or_else(|_| key_id.to_vec());
    let dao_member_id = format!("dao:{}", id_hex);

    let node_id_bytes: [u8; 32] = if identity.node_id.len() >= 32 {
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&identity.node_id[..32]);
        arr
    } else {
        let mut arr = [0u8; 32];
        arr[..identity.node_id.len()].copy_from_slice(&identity.node_id);
        arr
    };

    let zero_bytes: [u8; 32] = [0u8; 32];
    let node_id_struct = json!({
        "bytes": node_id_bytes,
        "creation_nonce": zero_bytes,
        "network_genesis": zero_bytes
    });

    let key_id_arr: [u8; 32] = {
        let mut arr = [0u8; 32];
        let src = key_id.as_slice();
        let len = std::cmp::min(src.len(), 32);
        arr[..len].copy_from_slice(&src[..len]);
        arr
    };

    let zhtp_identity = json!({
        "id": id_bytes,
        "did": identity.did,
        "identity_type": "Device",
        "public_key": {
            "dilithium_pk": identity.public_key,
            "kyber_pk": identity.kyber_public_key,
            "key_id": key_id_arr
        },
        "node_id": node_id_struct,
        "device_node_ids": {
            identity.device_id.clone(): node_id_struct
        },
        "primary_device": identity.device_id,
        "dao_member_id": dao_member_id,
        "ownership_proof": {
            "proof_system": "dilithium-pop-placeholder-v0",
            "proof_data": [],
            "public_inputs": id_bytes.clone(),
            "verification_key": identity.public_key.clone(),
            "plonky2_proof": null,
            "proof": []
        },
        "credentials": {},
        "metadata": {},
        "attestations": [],
        "reputation": 100,
        "access_level": "Standard",
        "age": null,
        "jurisdiction": null,
        "citizenship_verified": false,
        "dao_voting_power": 0,
        "private_data_id": null,
        "created_at": identity.created_at,
        "last_active": identity.created_at,
        "recovery_keys": [],
        "did_document_hash": null,
        "owner_identity_id": null,
        "reward_wallet_id": null
    });

    Ok(serde_json::to_string(&zhtp_identity)?)
}

/// Build a signed token create transaction (hex-encoded)
pub fn build_token_create_transaction(
    identity_json: &str,
    name: &str,
    symbol: &str,
    initial_supply: u64,
    decimals: u8,
    chain_id: u8,
) -> Result<String> {
    let identity = deserialize_identity(identity_json)?;
    zhtp_client::build_create_token_tx(&identity, name, symbol, initial_supply, decimals, chain_id)
        .map_err(|e| anyhow::anyhow!("Failed to build token create transaction: {}", e))
}

/// Build a signed token mint transaction (hex-encoded)
pub fn build_token_mint_transaction(
    identity_json: &str,
    token_id: &[u8],
    to_pubkey: &[u8],
    amount: u64,
    chain_id: u8,
) -> Result<String> {
    let identity = deserialize_identity(identity_json)?;

    let mut token_id_arr = [0u8; 32];
    if token_id.len() >= 32 {
        token_id_arr.copy_from_slice(&token_id[..32]);
    } else {
        token_id_arr[..token_id.len()].copy_from_slice(token_id);
    }

    let mut to_arr = [0u8; 32];
    if to_pubkey.len() >= 32 {
        to_arr.copy_from_slice(&to_pubkey[..32]);
    } else {
        to_arr[..to_pubkey.len()].copy_from_slice(to_pubkey);
    }

    zhtp_client::build_mint_tx(&identity, &token_id_arr, &to_arr, amount, chain_id)
        .map_err(|e| anyhow::anyhow!("Failed to build token mint transaction: {}", e))
}

/// Build a signed token transfer transaction (hex-encoded)
pub fn build_token_transfer_transaction(
    identity_json: &str,
    token_id: &[u8],
    to_pubkey: &[u8],
    amount: u64,
    chain_id: u8,
) -> Result<String> {
    let identity = deserialize_identity(identity_json)?;

    let mut token_id_arr = [0u8; 32];
    if token_id.len() >= 32 {
        token_id_arr.copy_from_slice(&token_id[..32]);
    } else {
        token_id_arr[..token_id.len()].copy_from_slice(token_id);
    }

    let mut to_arr = [0u8; 32];
    if to_pubkey.len() >= 32 {
        to_arr.copy_from_slice(&to_pubkey[..32]);
    } else {
        to_arr[..to_pubkey.len()].copy_from_slice(to_pubkey);
    }

    zhtp_client::build_transfer_tx(&identity, &token_id_arr, &to_arr, amount, chain_id)
        .map_err(|e| anyhow::anyhow!("Failed to build token transfer transaction: {}", e))
}

/// Build a signed token burn transaction (hex-encoded)
pub fn build_token_burn_transaction(
    identity_json: &str,
    token_id: &[u8],
    amount: u64,
    chain_id: u8,
) -> Result<String> {
    let identity = deserialize_identity(identity_json)?;

    let mut token_id_arr = [0u8; 32];
    if token_id.len() >= 32 {
        token_id_arr.copy_from_slice(&token_id[..32]);
    } else {
        token_id_arr[..token_id.len()].copy_from_slice(token_id);
    }

    zhtp_client::build_burn_tx(&identity, &token_id_arr, amount, chain_id)
        .map_err(|e| anyhow::anyhow!("Failed to build token burn transaction: {}", e))
}
