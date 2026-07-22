# ESE — cross-platform release roadmap

This roadmap keeps alpha18 as the behavioural reference and favours portable,
self-contained packages. Only components required by a target platform are to be
added; the `.ese` format and the shared application core remain platform-neutral.

## Target order

| Order | Target | Preferred deliverable | Current state | Exit criterion |
| ---: | --- | --- | --- | --- |
| 1 | Windows x64 | portable `ESE.exe` | alpha18 functional | repeatable release build, version metadata, icon and public licence files |
| 2 | Android arm64 | standalone APK | alpha18 functional | release signing, clean install/upgrade test and permission review |
| 3 | Linux x64 | portable AppImage | alpha18 candidate built and WSLg-smoke-tested | alpha18 contract validated on a real Linux desktop |
| 4 | macOS | universal application bundle | requires a Mac and Xcode | Intel/Apple Silicon validation, camera and file-dialog tests |
| 5 | iOS/iPadOS | signed application | requires a Mac, Xcode and Apple signing | touch, camera, file exchange and safe sharing fallback validated |

Additional architectures such as Windows arm64, Linux arm64 and Android x86_64
come after the five principal deliverables unless a concrete testing device makes
one of them useful sooner.

## Phase A — freeze the first public scope

Alpha18 already contains the essential product. The first public version should
therefore concentrate on stability and distribution rather than adding another
large feature family.

Required before publication:

- keep the alpha18 behavioural contract unchanged;
- choose and add the formal application and format-specification licence files;
- define the public version number and release naming convention;
- add final icons and package metadata;
- build from a documented, repeatable command per platform;
- create SHA-256 checksums for every published artefact;
- test `.ese`, HTML and JSON round trips across at least two platforms;
- document permissions, local processing and the absence of mandatory online
  services;
- keep a compact manual test checklist for camera, touch, fullscreen and sharing.

Not required for the first public version:

- office document import;
- automatic wire detection;
- tile pyramids for extremely large documents;
- advanced source reordering;
- a complete rewrite of the interface or project format.

These remain later improvements and must not delay a stable useful release.

## Phase B — Linux x64 AppImage

Linux is the next engineering target because it can reuse the complete Tauri/Web
core while producing a genuinely portable desktop file.

Minimum build environment:

- a supported x86-64 Linux distribution;
- Node.js and npm for the shared front end;
- the Rust stable toolchain;
- the GTK/WebKit development libraries required by Tauri;
- the minimal AppImage packaging tools selected by Tauri.

Work sequence:

1. restore and inspect the existing Ubuntu WSL environment — completed;
2. install only the missing Tauri build packages — completed;
3. compile and run the shared automated suites — completed;
4. produce and smoke-test the AppImage under WSLg — completed;
5. rebuild on an older release baseline such as Ubuntu 22.04 or Debian 12;
6. test it on a real Linux graphical session, not solely inside WSL;
7. validate the alpha18 compatibility round trip;
8. publish the verified artefact and checksum.

The current AppImage candidate is stored in `releases/` with its checksum in the
alpha18 baseline. It was built on Ubuntu 24.04, so the remaining blocker is
release compatibility and real-host validation, not the local toolchain.

## Phase C — release-quality Windows and Android packages

Windows:

- retain the portable executable as the primary package;
- embed final version information and icons;
- verify on a clean Windows user profile;
- optionally add an installer only as a convenience, never as a requirement.

Android:

- replace the development signing certificate with a securely retained release
  key before public distribution;
- preserve application data across upgrades;
- test a clean install and an upgrade from the previous public build;
- review the camera and nearby-Wi-Fi permission explanations;
- keep temporary hotspot ownership tracking and private camera-file cleanup.

## Phase D — Apple platforms

macOS and iOS builds require Apple hardware and Xcode for compilation, signing and
real-device validation. Their preparation can share metadata, icons, localisation
resources and test documents with the other ports, but release artefacts cannot be
honestly validated from Windows alone.

The iOS sharing path must retain the same safety model. Where automatic hotspot
creation is unavailable, ESE should explain the manual common-network fallback and
then provide the temporary HTTP/QR transfer without pretending that the operating
system granted capabilities it did not grant.

## Later product work

After the first public cross-platform release:

- office document import through a deliberately minimal embedded conversion path;
- reordering and richer management of sources and pages;
- tiled PNG/WebP rendering for exceptionally large pages;
- advanced pen, stylus and touch ergonomics;
- improved OCR-assisted reference extraction;
- optional circuit-detection assistance, always reviewed by the user;
- complete interface internationalisation.
