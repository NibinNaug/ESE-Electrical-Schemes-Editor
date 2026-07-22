# Privacy and local processing / Confidentialité et traitement local

ESE does not require an account, telemetry service or cloud backend.

- Imported images, camera captures and PDF page renditions remain on the device.
- OCR runs locally through Tesseract.js.
- Original PDFs are not stored in `.ese` archives; only selected page images are kept.
- Session recovery is a private local copy and is never part of the public application package.
- HTML sharing starts a temporary local HTTP server only after an explicit user action. The shared file is sent over the local network; ESE does not relay it through an online service.
- Closing a single-recipient share after transfer, or explicitly stopping a multi-recipient share, stops the temporary server.

ESE ne nécessite ni compte, ni télémétrie, ni service cloud.

- Les images importées, photos et pages PDF converties restent sur l’appareil.
- L’OCR est exécuté localement par Tesseract.js.
- Les PDF d’origine ne sont pas conservés dans les archives `.ese` ; seules les images des pages choisies le sont.
- La récupération de session est une copie locale privée, jamais intégrée aux paquets publics.
- Le partage HTML ne démarre un serveur HTTP local temporaire qu’après une action explicite. Aucun service en ligne ne relaie le fichier.
- Le serveur est arrêté après un transfert simple ou lorsque l’émetteur termine un partage multiple.
