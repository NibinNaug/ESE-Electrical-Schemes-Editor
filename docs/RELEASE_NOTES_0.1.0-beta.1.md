# ESE 0.1.0-beta.1

This is the first public beta of ESE — Electrical Schemes Editor.

## Downloads

- `ESE-Windows-x64-Setup.exe`: per-user Windows installer, French/English.
- `ESE-Windows-x64-Portable.exe`: portable Windows x64 application.
- `ESE-Android-Universal.apk`: Android 7.0+ APK for ARM64, ARMv7, x86 and x86-64.
- `SHA256SUMS.txt`: SHA-256 integrity hashes.

## Installation notes

The Windows files are not yet Authenticode-signed, so Microsoft SmartScreen may show an unknown-publisher warning. The Android APK is permanently signed by the ESE release key and must be installed from a browser or file manager after allowing installation from that source.

Development alpha APKs used a different signing key. An existing alpha must therefore be uninstalled once before installing this public beta. Save important work as `.ese` first; uninstalling an Android app removes its private recovery data.

## Known limitations

- The interface is currently primarily in French; full internationalisation is planned.
- Linux has an experimental AppImage candidate but is not part of this release until real-host validation is complete.
- Automatic wire detection remains assisted/manual; OCR proposes references but never silently decides electrical continuity.
- Apple packages require Apple hardware and signing infrastructure and are not part of this release.

No third-party schematic or manual is bundled in the application or source release.
