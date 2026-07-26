# DeepTrans Studio desktop packages

The desktop application is a Tauri 2 shell for the production service at
`https://www.deeptrans.studio`. PostgreSQL, Valkey, workers, object storage,
authentication and translation services remain on the existing cloud backend.

The remote page receives no Tauri IPC capability and cannot invoke native file,
shell or opener commands. Top-level navigation is restricted to the production
origin. External HTTP(S), email and telephone links are handed to the operating
system; unsupported schemes are rejected. Native drag interception is disabled
so the existing HTML5 upload drop zone works on Windows WebView2.

## Local checks

```bash
yarn desktop:check
yarn desktop:build
```

On macOS, the package is written below
`src-tauri/target/release/bundle/dmg/`. Windows NSIS packages are built on the
GitHub Windows runner and written below
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.

Run the `Desktop packages` workflow manually to create both distributables:

- `DeepTrans-Studio-macOS-universal-dmg` contains the universal `.dmg` and its
  SHA-256 checksum.
- `DeepTrans-Studio-Windows-x64-NSIS` contains the x64 `Setup.exe` and its
  SHA-256 checksum.

The workflow verifies the DMG and both CPU architectures. It also silently
installs and launches the Windows package before uploading it.

## Signing status

The current macOS package uses ad-hoc signing and is not notarized. The Windows
installer is unsigned. Users can install both packages, but macOS Gatekeeper or
Windows SmartScreen can show a first-run warning. Public warning-free distribution
requires an Apple Developer ID certificate plus notarization credentials and a
Windows Authenticode certificate.
