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

  # Use an XCFramework so Xcode links the correct slice for device vs simulator.
  s.vendored_frameworks = "UhpFFI.xcframework"
end
