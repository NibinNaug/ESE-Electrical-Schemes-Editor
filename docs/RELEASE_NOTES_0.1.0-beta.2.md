# ESE 0.1.0-beta.2

This is the first OTA-capable public beta of ESE — Electrical Schematics Enlightener.

## What is new

- ESE now checks the official GitHub Releases feed automatically at startup and on demand.
- Windows and Linux updates are signed with the permanent ESE updater key, verified before installation and followed by an automatic restart.
- Android downloads only the universal APK from the official release, verifies its GitHub SHA-256 digest and then opens the system installer for user confirmation.
- Modified projects are copied to ESE's private recovery storage before an update starts.
- The release pipeline now builds and publishes reproducible Windows, experimental Linux and signed universal Android packages.

## Downloads

- `ESE-Windows-x64-Setup.exe`: per-user Windows installer, French/English.
- `ESE-Windows-x64-Portable.exe`: portable Windows x64 application.
- `ESE-Linux-x64.AppImage`: experimental Linux x64 AppImage.
- `ESE-Android-Universal.apk`: Android 7.0+ APK for ARM64, ARMv7, x86 and x86-64.
- `SHA256SUMS.txt`: SHA-256 integrity hashes for the public packages.

## One-time transition

ESE 0.1.0-beta.1 does not contain the updater yet. Install beta.2 normally once; later published versions can then be installed from ESE itself.

The Android package uses the same permanent release certificate as beta.1, so it upgrades in place. Development alpha APKs used another certificate and must still be uninstalled first.

## Known limitations

- Windows packages are updater-signed but not yet Authenticode-signed, so Microsoft SmartScreen may show an unknown-publisher warning.
- The Linux AppImage is experimental pending broader validation on physical Linux systems.
- The interface is currently primarily in French; full internationalisation is planned.
- Apple packages require Apple hardware and signing infrastructure and are not part of this release.

No third-party schematic or manual is bundled in the application or source release.
