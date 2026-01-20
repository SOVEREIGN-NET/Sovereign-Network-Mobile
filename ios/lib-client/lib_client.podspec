Pod::Spec.new do |s|
  s.name = "lib_client"
  s.version = "0.1.0"
  s.summary = "ZHTP Client Library - Rust lib-client for iOS"
  s.homepage = "https://github.com/sovereign-network/lib-client"
  s.license = "MIT"
  s.author = "Sovereign Network"
  s.platform = :ios, "14.0"
  s.source = { :path => "." }

  # C compatibility layer only (ZhtpClient.swift is in main app)
  s.source_files = "ios_compat.c"

  # Vendored static library
  s.vendored_libraries = "libzhtp_client.a"

  # Add library search path
  lib_dir = File.expand_path(".", __dir__)
  s.pod_target_xcconfig = {
    'LIBRARY_SEARCH_PATHS' => lib_dir
  }

  s.user_target_xcconfig = {
    'LIBRARY_SEARCH_PATHS' => lib_dir
  }
end
