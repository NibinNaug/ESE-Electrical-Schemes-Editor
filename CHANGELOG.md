# Changelog

All notable public changes to ESE are documented here.

## Unreleased

## [0.1.0-beta.3] — 2026-07-23

Definitive product name and repository address.

- ESE now expands to **Electrical Schematics Enlightener** throughout the application, documentation, website and release metadata;
- the canonical repository moves to `NibinNaug/ESE-Electrical-Schematics-Enlightener`;
- desktop and Android update validation now trusts the new canonical release path;
- the `ESE` product name, `org.ese.editor` installation identity and `.ese` project format remain unchanged.

## [0.1.0-beta.2] — 2026-07-23

First OTA-capable public beta.

- secure in-app update checks for published GitHub releases;
- signed Tauri updates for Windows and Linux with automatic restart;
- Android APK download, SHA-256 verification and handoff to the system installer;
- repeatable GitHub Actions release pipeline for desktop and Android artefacts.

## [0.1.0-beta.1] — 2026-07-22

First public beta.

- unified viewer and editor with persistent hover/click highlighting;
- logical circuits made of multiple editable trace portions;
- colours, striped colour pairs, textual and numeric references;
- multipage image, camera and PDF import with local PNG rendering;
- transparent cross-platform `.ese` ZIP project format;
- standalone viewer or editable HTML export and JSON interchange;
- local OCR-assisted reference proposals with explicit user review;
- fullscreen viewing and independent page viewport persistence;
- local-network HTML sharing through QR Codes;
- private crash/session recovery and automatic reopening of the last project;
- portable Windows x64 executable, Windows NSIS installer and universal Android APK;
- no bundled schematic, manual or mandatory online service.

[0.1.0-beta.1]: https://github.com/NibinNaug/ESE-Electrical-Schematics-Enlightener/releases/tag/v0.1.0-beta.1
[0.1.0-beta.2]: https://github.com/NibinNaug/ESE-Electrical-Schematics-Enlightener/releases/tag/v0.1.0-beta.2
[0.1.0-beta.3]: https://github.com/NibinNaug/ESE-Electrical-Schematics-Enlightener/releases/tag/v0.1.0-beta.3
