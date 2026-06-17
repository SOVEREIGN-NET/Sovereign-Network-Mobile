# Repository Dependencies

## The-Sovereign-Network (sibling repository)

This project depends on Rust crates from The-Sovereign-Network, which must be cloned as a **sibling directory** to this project.

### Expected layout

```
parent-directory/
├── Sovereign-Network-Mobile/    # THIS repo
└── The-Sovereign-Network/       # Required sibling repo
```

### How to clone

```bash
# From the parent of Sovereign-Network-Mobile:
git clone https://github.com/The-Sovereign-Network/The-Sovereign-Network.git
```

### What depends on it

The following files reference paths to `../The-Sovereign-Network`:

| File | Path dependency |
|------|----------------|
| `ios/uhp-ffi/Cargo.toml` | `../../../The-Sovereign-Network/lib-*` |
| `android/.../quic-jni/Cargo.toml` | `../../../../../../../The-Sovereign-Network/lib-*` |
| `scripts/build-lib-client-ios.sh` | `../The-Sovereign-Network` |
| `patches/lib-client-ios-ffi.patch` | Applied to The-Sovereign-Network |

### Override path via `.env`

You can set `THE_SOVEREIGN_NETWORK_PATH` in your `.env` file to point to an alternative location of The-Sovereign-Network. This is respected by `scripts/generate-config.js`.