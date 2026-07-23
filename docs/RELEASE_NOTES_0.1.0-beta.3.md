# ESE 0.1.0-beta.3

ESE now bears its definitive name: **Electrical Schematics Enlightener**.

The new name describes the application more accurately: ESE reveals and highlights the meaning of an electrical schematic without altering its source document.

## What is new

- The complete product name is now Electrical Schematics Enlightener throughout the application, metadata, documentation and public website.
- The canonical GitHub repository is now `NibinNaug/ESE-Electrical-Schematics-Enlightener`.
- Windows, Linux and Android update checks now validate the new official release address.
- The release pipeline, public downloads and OTA manifest follow the renamed repository.

## Compatibility

- The short product name remains `ESE`, pronounced “easy”.
- The Windows installation identity remains `ESE` with the identifier `org.ese.editor`.
- Android keeps the same application ID and permanent signing certificate.
- Existing settings, private recovery data and `.ese` project files remain compatible.
- The `.ese`, HTML and JSON formats have not changed.

## One-time transition

Versions `0.1.0-beta.1` and `0.1.0-beta.2` still point to the former repository address. Install beta.3 manually once from the official website; later published versions can again be installed directly from ESE.

On Windows, run the beta.3 installer over the existing ESE installation and leave “Delete application data” unchecked if the uninstaller offers it. Android beta packages upgrade in place because they use the same permanent certificate.

## Downloads

- `ESE-Windows-x64-Setup.exe`: per-user Windows installer, French/English.
- `ESE-Windows-x64-Portable.exe`: portable Windows x64 application.
- `ESE-Linux-x64.AppImage`: experimental Linux x64 AppImage.
- `ESE-Android-Universal.apk`: Android 7.0+ APK for ARM64, ARMv7, x86 and x86-64.
- `SHA256SUMS.txt`: SHA-256 integrity hashes for the public packages.

## Known limitations

- Windows packages are updater-signed but not yet Authenticode-signed, so Microsoft SmartScreen may show an unknown-publisher warning.
- The Linux AppImage is experimental pending broader validation on physical Linux systems.
- The interface is currently primarily in French; full internationalisation is planned.
- Apple packages require Apple hardware and signing infrastructure and are not part of this release.

No third-party schematic or manual is bundled in the application or source release.
