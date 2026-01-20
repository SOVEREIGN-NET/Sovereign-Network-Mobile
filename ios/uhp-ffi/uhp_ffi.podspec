Pod::Spec.new do |s|
  s.name = "uhp_ffi"
  s.version = "0.1.0"
  s.summary = "UHP FFI Rust Library"
  s.homepage = "https://github.com/sovereign-network/mobile"
  s.license = "MIT"
  s.author = "Sovereign Network"
  s.platform = :ios, "14.0"
  s.source = { :path => "." }

  s.source_files = "include/**/*.h"
  s.public_header_files = "include/**/*.h"

  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '$(PODS_TARGET_SRCROOT)/include'
  }

  # Add the compiled Rust library directly to linker flags
  # Try build/ first (preferred), then fall back to target/ for direct cargo builds
  lib_path = File.expand_path("build/libuhp_ffi.a", __dir__)
  unless File.exist?(lib_path)
    lib_path = File.expand_path("target/aarch64-apple-ios/release/libuhp_ffi.a", __dir__)
  end

  s.user_target_xcconfig = {
    'OTHER_LDFLAGS' => "$(inherited) #{lib_path}"
  }
end
