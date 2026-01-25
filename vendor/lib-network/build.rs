// Build script to link macOS Core Bluetooth framework.
// Note: build.rs runs on the host; use target triple env to avoid linking
// frameworks when cross-compiling to non-Apple targets.

fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "macos" {
        println!("cargo:rustc-link-lib=framework=CoreBluetooth");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }
}
