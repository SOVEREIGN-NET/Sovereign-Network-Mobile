#ifndef UHP_FFI_H
#define UHP_FFI_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const uint8_t *dilithium_sk_ptr;
    size_t dilithium_sk_len;
    const uint8_t *kyber_sk_ptr;
    size_t kyber_sk_len;
    const uint8_t *master_seed_ptr;
    size_t master_seed_len;
} UhpPrivateKeyBytes;

typedef struct {
    void *ctx;
    ssize_t (*read)(void *ctx, uint8_t *buf, size_t len);
    ssize_t (*write)(void *ctx, const uint8_t *buf, size_t len);
} UhpIoCallbacks;

typedef struct {
    uint8_t session_key[32];
    uint8_t session_id[32];
    size_t session_id_len;
    uint8_t handshake_hash[32];
    char *peer_did;
    size_t peer_did_len;
    uint8_t pqc_hybrid_enabled;
} UhpSession;

int uhp_handshake(
    UhpIoCallbacks io,
    const uint8_t *identity_json_ptr,
    size_t identity_json_len,
    UhpPrivateKeyBytes key_bytes,
    const uint8_t *channel_binding_ptr,
    size_t channel_binding_len,
    const char *nonce_cache_path,
    uint8_t chain_id,
    UhpSession *out_session
);

const char *uhp_last_error_message(void);
void uhp_free_string(char *ptr);

int uhp_hkdf_sha3_256(
    const uint8_t *ikm_ptr,
    size_t ikm_len,
    const uint8_t *salt_ptr,
    size_t salt_len,
    const uint8_t *info_ptr,
    size_t info_len,
    uint8_t *out_ptr,
    size_t out_len
);

int uhp_hmac_sha3_256(
    const uint8_t *key_ptr,
    size_t key_len,
    const uint8_t *msg_ptr,
    size_t msg_len,
    uint8_t *out_ptr,
    size_t out_len
);

#ifdef __cplusplus
}
#endif

#endif
