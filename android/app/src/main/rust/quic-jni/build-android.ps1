# Build Android native libraries (quic-jni wrapper + lib-client)
# PowerShell version for Windows
# Requires: Rust nightly with Android targets, Android NDK
#
# lib-client (pulled in via path dep) pins its workspace to nightly in
# ../../../../../../../The-Sovereign-Network/rust-toolchain.toml because
# transitive deps (e.g. plonky2_field via neural-mesh-compression) use
# nightly-only features. When cargo compiles quic-jni from this directory
# it would otherwise default to stable and fail with E0554 - so we force
# the toolchain here.

# Do NOT use Stop - cargo writes build progress to stderr, which PowerShell
# would treat as terminating errors, killing the build prematurely.
$ErrorActionPreference = "Continue"

# Force nightly to match lib-client's workspace toolchain.
if (-not $env:RUSTUP_TOOLCHAIN) {
    $env:RUSTUP_TOOLCHAIN = "nightly"
}

# Ensure cargo is on PATH (works regardless of how Gradle was started)
if (Test-Path "$env:USERPROFILE\.cargo\bin") {
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $ScriptDir

# Android NDK path detection
if ($env:ANDROID_NDK_HOME) {
    $NDK_HOME = $env:ANDROID_NDK_HOME
} elseif ($env:ANDROID_HOME) {
    $NDK_HOME = "$env:ANDROID_HOME\ndk\27.1.12297006"
} else {
    $NDK_HOME = "$env:LOCALAPPDATA\Android\Sdk\ndk\27.1.12297006"
}

$HostTag = "windows-x86_64"
$Toolchain = "$NDK_HOME\toolchains\llvm\prebuilt\$HostTag"

if (-not (Test-Path $Toolchain)) {
    Write-Host "Error: NDK toolchain not found at $Toolchain"
    Write-Host "Set ANDROID_NDK_HOME or ANDROID_HOME environment variable"
    exit 1
}

# Output directory for .so files
$OutputDir = "..\..\jniLibs"

# Android targets: rust_target, android_abi, clang_prefix, api_level
$Targets = @(
    @{RustTarget="aarch64-linux-android"; Abi="arm64-v8a"; ClangPrefix="aarch64-linux-android"; ApiLevel="24"},
    @{RustTarget="armv7-linux-androideabi"; Abi="armeabi-v7a"; ClangPrefix="armv7a-linux-androideabi"; ApiLevel="24"},
    @{RustTarget="x86_64-linux-android"; Abi="x86_64"; ClangPrefix="x86_64-linux-android"; ApiLevel="24"}
)

Write-Host "Building quic-jni for Android"
Write-Host "   NDK: $NDK_HOME"
Write-Host "   Output: $OutputDir"
Write-Host ""

# Filter by ANDROID_ABIS if set
if ($env:ANDROID_ABIS) {
    $AbiList = $env:ANDROID_ABIS -split ','
    $Targets = $Targets | Where-Object { $_.Abi -in $AbiList }
}

foreach ($target in $Targets) {
    $RustTarget = $target.RustTarget
    $Abi = $target.Abi
    $ClangPrefix = $target.ClangPrefix
    $ApiLevel = $target.ApiLevel

    Write-Host "Building for $RustTarget ($Abi)..."

    # Set environment for cross-compilation
    # Note: NDK on Windows uses .cmd wrappers for clang
    $env:CC = "$Toolchain\bin\$ClangPrefix$ApiLevel-clang.cmd"
    $env:CXX = "$Toolchain\bin\$ClangPrefix$ApiLevel-clang++.cmd"
    $env:AR = "$Toolchain\bin\llvm-ar.exe"
    $env:RANLIB = "$Toolchain\bin\llvm-ranlib.exe"
    $env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$Toolchain\bin\$ClangPrefix$ApiLevel-clang.cmd"
    $env:CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER = "$Toolchain\bin\$ClangPrefix$ApiLevel-clang.cmd"
    $env:CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER = "$Toolchain\bin\$ClangPrefix$ApiLevel-clang.cmd"

    # Build quic-jni (which depends on lib-client from node code).
    # Keep the console quiet on success (last 5 lines), but on failure dump
    # the whole log - a bare "| tail -5" once hid a cc-rs toolchain error
    # behind an opaque Gradle "exit value 101" with nothing to act on.
    #
    # We use `cmd /c` to run cargo so that stderr->stdout redirection works
    # reliably; PowerShell's 2>&1 can surface NativeCommandError records
    # that interfere with exit code checking.
    $TempLog = [System.IO.Path]::GetTempFileName()
    try {
        $cargoCmd = "cargo build --release --target $RustTarget > `"$TempLog`" 2>&1"
        cmd /c $cargoCmd
        if ($LASTEXITCODE -eq 0) {
            Get-Content $TempLog | Select-Object -Last 5
        } else {
            Write-Host "cargo build failed for $RustTarget - full output:"
            Get-Content $TempLog | Write-Host
            exit 1
        }
    } finally {
        Remove-Item $TempLog -Force -ErrorAction SilentlyContinue
    }

    # Copy .so to jniLibs
    New-Item -ItemType Directory -Force -Path "$OutputDir\$Abi" | Out-Null
    Copy-Item "target\$RustTarget\release\libquic_jni.so" "$OutputDir\$Abi\" -Force

    Write-Host "$Abi/libquic_jni.so"
}

Write-Host ""
Write-Host "Build complete"

# Show output sizes
Get-ChildItem "$OutputDir\*\libquic_jni.so" | ForEach-Object {
    $sizeInMB = [math]::Round($_.Length / 1MB, 2)
    Write-Host ("{0}/libquic_jni.so: {1}MB" -f $_.Directory.Name, $sizeInMB)
}

Pop-Location
