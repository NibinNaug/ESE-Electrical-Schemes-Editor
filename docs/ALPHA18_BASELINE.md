# ESE 0.1.0-alpha18 — validated baseline

This document freezes the known-good state used as the reference for subsequent
platform ports. A port is not considered successful merely because it builds: it
must preserve the behaviours listed below and remain compatible with the same
`.ese`, HTML and JSON files.

## Reference artefacts

| Platform | Artefact | Size | SHA-256 |
| --- | --- | ---: | --- |
| Windows x64 | `ESE-0.1.0-alpha18-windows-x64/ESE.exe` | 9,418,240 bytes | `676ABE96174A48CE05CF8468E372BA6379860A3E6C2114D8CED47B67C1ED09BB` |
| Android arm64 | `ESE-0.1.0-alpha18-android-arm64/ESE-0.1.0-alpha18-android-arm64.apk` | 14,307,604 bytes | `5791F2771E34642A6D3439E4A64149335442C56F8752609E41469AA043FFE612` |
| Linux x64 | `ESE-0.1.0-alpha18-linux-x64/ESE-0.1.0-alpha18-linux-x64.AppImage` | 93,157,880 bytes | `6299FFAF1BB34A68DB25B1494EA16453B98F760DF2732EDBDFF2F35A0B73B6D2` |

These are development alpha artefacts. The Android APK is signed for testing,
not with the future public release key. The Linux AppImage is a WSLg-smoke-tested
port candidate built on Ubuntu 24.04, not yet the broadly compatible public
Linux package.

## Automated validation

Validated on 21 July 2026:

- TypeScript and Vite production build: successful;
- functional test suite: 32/32 tests passed;
- Rust native test suite: 6/6 tests passed;
- Android APK signature verification: APK Signature Scheme v2/v3 valid;
- full Android camera capture, confirmation, import choice and private temporary
  file cleanup: validated on the Redmi Note 15;
- Android-to-Android QR sharing, complete HTML reception and automatic local
  hotspot cleanup: validated between the Redmi Note 15 and Oppo A5;
- Linux AppImage launch and bundled multimedia runtime: smoke-tested under WSLg;
- the pre-existing `Androbin WiFi` hotspot remained active throughout the tests.

## Behavioural contract for every port

Every supported platform must preserve at least:

1. the single viewer/editor interface controlled by **Edit mode**;
2. temporary hover highlighting, persistent click selection and second-click
   deselection;
3. one logical circuit for all portions sharing the same reference;
4. correct handling of crossings, explicit junctions, reference gaps and
   components;
5. trace creation, arbitrary portion editing/deletion, undo and redo;
6. per-page zoom and position persisted in `.ese` and HTML;
7. platform-independent `.ese` read/write and ESE HTML/JSON import/export;
8. viewer-only and editable standalone HTML exports;
9. source import restricted to Edit mode;
10. direct camera/webcam capture when the platform exposes a camera;
11. local OCR and PDF conversion without retaining the source PDF;
12. fullscreen viewing with only the correctly positioned black fullscreen
    control visible;
13. safe QR sharing that never stops a network or hotspot ESE did not create.

## Compatibility rule

Before a new platform artefact is published, perform a round trip with a project
created by alpha18 on another platform:

1. open the `.ese` file;
2. edit and save it under a new name;
3. reopen both files and compare pages, references, circuits, traces and views;
4. export viewer HTML, editable HTML and JSON;
5. open the HTML files in an ordinary browser and re-import the JSON in ESE.

No platform-specific field may be required in the `.ese` archive.
