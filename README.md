# ESE — Electrical Schemes Editor

<p align="center">
  <img src="assets/branding/ese-icon.svg" alt="ESE application icon" width="160">
</p>

**ESE** is pronounced **“easy”**.

An open, portable and cross-platform-oriented editor for turning static electrical schematics into interactive documents. ESE overlays editable circuits on source images without altering them, then saves the complete project in a transparent `.ese` archive or exports it as a standalone HTML file.

[Site officiel et téléchargements](https://nibin-naug.pages-perso.free.fr/prog/ese/) · [Official website and downloads](https://nibin-naug.pages-perso.free.fr/prog/ese/)

[Français](#français) · [English](#english)

---

## Français

### Présentation

ESE — **Electrical Schemes Editor** — permet de transformer l’image d’un schéma électrique en document interactif. Les circuits restent invisibles au repos, apparaissent temporairement au survol et restent surlignés après un clic. Un second clic sur le même circuit le désélectionne.

Le lecteur et l’éditeur partagent volontairement la même interface : la case **Mode édition** affiche ou masque les outils sans changer de document ni perdre la sélection en cours.

La première version publique est `0.1.0-beta.1`, disponible pour Windows x64 et Android. Un AppImage Linux x64 expérimental a également été validé sous WSLg ; sa validation sur un poste Linux réel reste à faire avant publication. Les fichiers `.ese` restent identiques et portables d’une plateforme à l’autre.

### Téléchargements

- [Windows x64 — programme d’installation](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/ESE-Windows-x64-Setup.exe)
- [Windows x64 — exécutable portable](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/ESE-Windows-x64-Portable.exe)
- [Android 7.0+ — APK universel](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/ESE-Android-Universal.apk)
- [Sommes de contrôle SHA-256](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/SHA256SUMS.txt)

Les détails d’installation et limitations connues figurent dans les [notes de version](docs/RELEASE_NOTES_0.1.0-beta.1.md).

### Fonctionnalités actuelles

- consultation et édition dans une interface unique ;
- survol temporaire, sélection persistante et désélection au second clic ;
- un circuit logique unique pour toutes les portions partageant le même repère ;
- repères par couleur, couleur composée, numéro ou texte ;
- liste compacte et filtrable des repères et circuits ;
- tracés orthogonaux créés point par point ;
- double-clic pour terminer une portion et commencer immédiatement la suivante ;
- sélection et modification de n’importe quelle portion existante ;
- poignées déplaçables pour modifier chaque point ;
- déplacement d’un segment avec ses deux extrémités ;
- suppression de la portion sélectionnée avec le bouton dédié ou la touche `Suppr` ;
- annulation et rétablissement des créations, modifications et suppressions ;
- zoom et déplacement à la souris, au pavé tactile ou avec deux doigts ;
- plein écran de consultation natif, avec le schéma et son unique bouton de sortie visibles, automatiquement indisponible en mode édition ;
- mémorisation indépendante du zoom et de la position de chaque page dans le projet `.ese` et les exports HTML ;
- import d’images, prise de vue directe avec l’appareil photo ou la webcam, et import de pages physiques de PDF multipages ;
- sélection des pages PDF par miniatures, numéros et plages (`111`, `2-5, 9`) ;
- conversion locale des pages PDF en PNG sans perte à 200 ppp, sans conserver le PDF original dans le projet ;
- import de sources disponible uniquement en mode édition, sans page PDF présélectionnée ;
- reconnaissance OCR locale et hors ligne d’une page entière ou d’une zone de légende ;
- propositions modifiables de repères couleur, numériques ou textuels, accompagnées d’un indice de confiance et soumises à validation explicite ;
- suppression d’une page en mode édition, avec confirmation, conservation des circuits logiques et prise en charge par l’annulation/rétablissement ;
- ajout d’une source au projet actuel ou création explicite d’un nouveau projet ;
- création d’un projet réellement vierge, avec proposition d’enregistrer, d’ignorer ou d’annuler lorsque le projet actuel a été modifié ;
- navigation entre plusieurs sources et pages sans perdre les circuits existants ;
- réouverture automatique de la dernière session au démarrage, avec copie privée locale du projet, de la page active, de sa vue et des modifications non enregistrées pour la récupération après incident ;
- ouverture et sauvegarde atomique des projets `.ese` dans l’application native ;
- ouverture indifférente d’un projet `.ese` ou d’un export HTML produit par ESE ;
- sauvegarde et **Enregistrer sous** toujours au format `.ese`, y compris après ouverture d’un HTML ;
- import d’un HTML ESE complet dans le projet courant, avec remappage des pages, ressources et identifiants ;
- export et réimport JSON autonomes des circuits, tracés, repères et descriptions de pages, sans image ;
- compatibilité d’import avec les anciens JSON constitués du seul tableau de circuits ;
- export HTML autonome multipage, en mode consultation ou modifiable ;
- partage direct de l’export HTML courant par QR Code sur le réseau local, sans service en ligne ;
- réception complète en mémoire avant affichage, avec téléchargement local toujours disponible après l’arrêt du serveur ;
- partage simple avec arrêt automatique après confirmation, ou partage multiple arrêté explicitement par l’émetteur ;

### Utilisation rapide

#### Créer un nouveau projet

1. Cliquez sur **Nouveau projet**.
2. Si le projet actuel a été modifié, choisissez **Enregistrer et continuer**, **Continuer sans enregistrer** ou **Annuler**. Une sauvegarde annulée ou impossible conserve le projet actuel.
3. Le nouveau projet ne contient aucune source, aucune page, aucun repère et aucun circuit. Utilisez l’appel central **Importer une source…** pour commencer ; le mode édition est activé automatiquement.

#### Reprendre la dernière session

ESE rouvre automatiquement la dernière session au démarrage. Une archive de récupération est conservée dans le stockage privé de l’application et mise à jour après chaque modification : elle contient les images importées, les circuits, la page active, son zoom et sa position, même si le fichier `.ese` n’a pas encore été enregistré. Cette copie locale sert uniquement à la reprise et à la récupération après un crash ; elle ne remplace pas les sauvegardes choisies par l’utilisateur.

#### Consulter un schéma

1. Survolez une ligne pour afficher temporairement tout le circuit portant le même repère.
2. Cliquez pour conserver le circuit surligné.
3. Cliquez de nouveau sur ce circuit, sur un autre circuit ou dans le vide pour modifier la sélection.

#### Ajouter une portion

1. Cochez **Mode édition**.
2. Sélectionnez le circuit concerné.
3. Cliquez sur **Ajouter un tracé**.
4. Cliquez pour poser les points et les angles.
5. Appuyez sur `Entrée` pour terminer, ou double-cliquez pour terminer et enchaîner immédiatement une nouvelle portion.

`Retour arrière` retire le dernier point en cours de création et `Échap` annule la création.

#### Modifier ou supprimer une portion

1. Cochez **Mode édition** et sélectionnez le circuit. Il reste entièrement surligné.
2. Activez **Éditer une portion**.
3. Survolez puis cliquez sur la portion voulue : elle est accentuée et ses poignées apparaissent.
4. Faites glisser une poignée pour déplacer un point, ou faites glisser le segment pour déplacer ses deux extrémités.
5. Utilisez `Suppr` ou **Supprimer la portion** pour effacer uniquement cette portion.

Un clic dans le vide ou `Échap` désélectionne la portion sans désélectionner le circuit.

#### Importer une ou plusieurs pages PDF

1. Cochez **Mode édition**, puis cliquez sur **Importer une source…** et choisissez un PDF.
2. Choisissez **Ajouter au projet actuel** pour conserver toutes les pages et tous les tracés existants, ou créez explicitement un nouveau projet.
3. Saisissez les numéros physiques voulus (`111`, `2-5, 9`) ou cliquez sur les miniatures. Aucune page n’est sélectionnée par défaut.
4. Cliquez sur **Importer**. Les pages sont converties séquentiellement en PNG et ajoutées à la colonne **Documents**.

La numérotation utilisée est l’ordre physique du PDF, indépendamment du numéro imprimé dans la page. Le PDF original sert uniquement pendant la conversion et n’est pas conservé dans le fichier `.ese`.

#### Photographier directement un schéma

1. Cochez **Mode édition**, puis cliquez sur **Prendre une photo**.
2. Sur Android, ESE ouvre l’application photo native avec la caméra arrière privilégiée. Photographiez le document puis validez ou recommencez depuis l’interface du téléphone.
3. Sur ordinateur, choisissez la webcam, cadrez le document et cliquez sur **Photographier**. Vérifiez l’aperçu, puis utilisez **Reprendre** ou **Importer la photo**.
4. Ajoutez la photo au projet courant ou créez explicitement un nouveau projet, comme pour toute autre image.

La caméra n’est sollicitée qu’après cette action explicite. La photo reste locale, devient une page image ordinaire du projet et suit ensuite exactement les mêmes règles de sauvegarde et d’export que les images importées.

#### Ouvrir ou importer un HTML ESE et un JSON

- **Ouvrir** accepte indifféremment un `.ese` ou un `.html` exporté par ESE. Un HTML ouvert redevient un projet complet ; **Enregistrer** et **Enregistrer sous** produisent toujours un `.ese` et n’écrasent jamais le HTML source.
- En **Mode édition**, **Importer une source…** accepte aussi un HTML ESE. Il peut remplacer le projet ou lui ajouter toutes ses pages, images de travail, repères et circuits. Les identifiants sont remappés pour ne pas écraser les éléments existants, tandis que les repères portant la même référence restent un circuit logique commun.
- Le même bouton importe un JSON d’annotations dans le projet courant. ESE associe les pages par identifiant ou caractéristiques, puis par ordre lorsque les deux documents possèdent le même nombre de pages. Un JSON monopage peut être appliqué à la page active et ses coordonnées sont adaptées si la résolution diffère.

Un HTML quelconque qui ne contient pas les données embarquées d’un export ESE est refusé proprement. Les anciens JSON « tableau brut des circuits » restent acceptés ; ils utilisent leurs identifiants d’origine ou, pour un document monopage, la page active.

#### Reconnaître les repères d’une légende

1. Cochez **Mode édition**, affichez la page concernée, puis ouvrez **Repères…** et **Reconnaître…**.
2. Choisissez la page source et tracez un rectangle autour de la légende. **Page entière** reste disponible comme choix explicite.
3. Cliquez sur **Reconnaître la zone**, puis vérifiez le repère, la désignation, la couleur et l’indice de confiance de chaque proposition.
4. Corrigez les champs si nécessaire, décochez les propositions indésirables et cliquez sur **Ajouter les repères cochés**.

L’OCR et son modèle anglais sont chargés uniquement à la demande et travaillent entièrement sur l’appareil. ESE reconstitue les rangées de tableaux à partir de leur géométrie, conserve les abréviations propres au constructeur (`BK`, `YE`, `BK/YE`, etc.) et lance automatiquement une seconde lecture agrandie lorsqu’il détecte une liste numérotée. Les repères déjà présents sont signalés et ne sont pas dupliqués. Une zone cadrée autour de la légende reste préférable sur une page contenant plusieurs tableaux parallèles. Cette assistance peuple la liste des repères ; elle ne détecte ni ne crée automatiquement les fils ou circuits, et chaque proposition reste soumise à validation.

#### Supprimer une page

1. Cochez **Mode édition** et affichez la page à retirer.
2. Cliquez sur **Supprimer la page**, puis confirmez l’opération.

Seuls la page et ses portions de tracé sont supprimés. Les circuits logiques et leurs repères sont conservés, même s’ils ne possèdent plus de portion. Une source devenue vide est retirée. La dernière page du projet est protégée, et l’opération peut être annulée ou rétablie.

#### Partager un schéma par QR Code

1. Choisissez **HTML consultation** ou **HTML modifiable** dans la barre principale, puis cliquez sur **Partager par QR**.
2. Laissez **Partage multiple** désactivé pour un seul destinataire, ou activez-le pour plusieurs appareils.
3. Sur Android, accordez à ESE l’autorisation **Appareils Wi-Fi à proximité** : ESE crée alors son propre point d’accès local temporaire et affiche un premier QR de connexion. Un Wi-Fi ou point d’accès déjà actif reste intact. Sous Windows, connectez encore manuellement les appareils au même réseau.
4. Scannez le QR du réseau sur le récepteur. Si le QR du fichier n’apparaît pas automatiquement, cliquez sur **Connexion établie — Continuer** : Android ne permet pas toujours à une application ordinaire de détecter les clients du point d’accès. Scannez ensuite le QR du fichier.
5. Le navigateur récepteur copie intégralement le HTML, l’affiche depuis sa mémoire locale et garde un bouton **Télécharger**. Le partage simple s’arrête après confirmation de cette réception ; le partage multiple reste ouvert jusqu’au bouton **Arrêter le partage**.

Le serveur n’accepte ni téléversement ni exploration de fichiers : il expose uniquement la page de réception, l’export HTML protégé par un jeton aléatoire et l’accusé de réception. Un partage simple sans réception terminée expire après cinq minutes. À la fin du partage, ESE arrête seulement le point d’accès local qu’il a lui-même créé ; il ne coupe jamais un Wi-Fi, un partage de connexion ou un point d’accès préexistant.

### Règles de tracé électrique

ESE distingue la géométrie affichée de la continuité électrique :

- deux fils qui se croisent ne sont reliés **que si un point de jonction est explicitement dessiné** ;
- sans point, un croisement représente toujours deux circuits distincts ;
- un repère imprimé peut interrompre visuellement la ligne, mais les portions situées de part et d’autre appartiennent au même circuit si elles portent le même repère ;
- les connecteurs, interrupteurs, fusibles, lampes et autres composants ne doivent pas être confondus avec des portions de câble ;
- plusieurs portions géométriquement séparées peuvent appartenir au même circuit logique.

### Format de projet `.ese`

Un fichier `.ese` est une archive ZIP non chiffrée et indépendante de la plateforme. Elle contient notamment :

```text
mimetype
manifest.json
annotations/circuits.json
renditions/<source-id>/page-<numéro>.png
```

Le format n’est ni chiffré ni volontairement opaque. Il conserve les images de travail et les métadonnées nécessaires, mais pas les PDF ou documents originaux ayant servi à les produire. Une image importée directement n’est stockée qu’une fois. Les coordonnées des tracés sont exprimées dans le repère logique de chaque page et restent indépendantes de la résolution d’affichage.

La spécification actuelle est décrite dans [docs/ESE_PROJECT_FORMAT.md](docs/ESE_PROJECT_FORMAT.md). L’état validé de l’alpha 18 et la feuille de route multiplateforme sont consignés dans [docs/ALPHA18_BASELINE.md](docs/ALPHA18_BASELINE.md) et [docs/RELEASE_ROADMAP.md](docs/RELEASE_ROADMAP.md).

### Exports

- **HTML consultation** : fichier autonome consultable dans un navigateur, sans ESE et sans outils d’édition.
- **HTML modifiable** : fichier autonome conservant les outils de tracé nécessaires aux corrections à la volée.
- **JSON** : échange léger et réimportable contenant circuits, tracés, repères/couleurs et descriptions de pages, mais aucune image.

Le bouton **Partager par QR** produit en mémoire le même export HTML que le bouton d’export local. Le choix consultation/modifiable reste donc unique et cohérent.

Le format JSON d’annotations est documenté dans [docs/ESE_JSON_INTERCHANGE.md](docs/ESE_JSON_INTERCHANGE.md).

### Développement

Prérequis généraux : une version LTS récente de Node.js, Rust stable et les dépendances natives demandées par Tauri pour la plateforme ciblée. Sous Windows, la compilation native nécessite MSVC et le SDK Windows des Visual Studio Build Tools.

```powershell
npm install
npm run dev          # version navigateur
npm run tauri dev    # application native en développement
```

Vérification et compilation :

```powershell
npm test
npm run build
npm run check:rust
npm run tauri build
```

Sous Windows, l’exécutable portable est produit dans `src-tauri/target/release/ese.exe`.

### Feuille de route

- import de documents bureautiques par un moteur embarqué minimal ;
- réorganisation et gestion avancée des sources et pages ;
- pyramides de tuiles PNG/WebP pour les documents très volumineux ;
- gestion approfondie de plusieurs sources et pages ;
- ergonomie tactile et stylet avancée ;
- paquets natifs Windows, Linux, macOS, Android et iOS ;
- adaptateurs réseau natifs équivalents pour iOS et les plateformes de bureau, avec repli manuel sûr ;
- internationalisation complète de l’interface.

### Licence et philosophie

ESE est un logiciel libre distribué sous licence **GNU GPL v3 ou ultérieure**. Le code source, les spécifications et les outils de construction sont publiés dans ce dépôt ; le texte complet figure dans [LICENSE](LICENSE).

Le projet privilégie un format documenté, inspectable et portable, sans chiffrement propriétaire ni dépendance obligatoire à un service en ligne. L’import PDF utilise PDF.js et l’OCR local utilise Tesseract.js, tous deux sous licence Apache-2.0 ; les QR Codes sont générés localement par `node-qrcode`, sous licence MIT. Les mentions tierces figurent dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## English

### Overview

ESE — **Electrical Schemes Editor** — turns an electrical schematic image into an interactive document. Circuits remain hidden while idle, appear temporarily on hover and stay highlighted after a click. Clicking the same circuit again clears the selection.

The first public version is `0.1.0-beta.1`, available for Windows x64 and Android. An experimental Linux x64 AppImage has also been smoke-tested under WSLg; validation on a real Linux desktop is still required before publication. `.ese` files remain identical and portable across platforms.

### Downloads

- [Windows x64 — installer](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/ESE-Windows-x64-Setup.exe)
- [Windows x64 — portable executable](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/ESE-Windows-x64-Portable.exe)
- [Android 7.0+ — universal APK](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/ESE-Android-Universal.apk)
- [SHA-256 checksums](https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.1.0-beta.1/SHA256SUMS.txt)

See the [release notes](docs/RELEASE_NOTES_0.1.0-beta.1.md) for installation details and known limitations.

### Current features

- viewing and editing in a single interface;
- temporary hover, persistent selection and second-click deselection;
- one logical circuit for every portion sharing the same reference;
- colour, compound-colour, numeric and textual references;
- compact, searchable reference and circuit list;
- point-by-point orthogonal trace creation;
- double-click to finish one portion and immediately start the next one;
- selection and modification of any existing portion;
- draggable handles for every point;
- segment dragging that moves both of its endpoints;
- deletion of the selected portion with the dedicated button or `Delete` key;
- undo and redo for creation, modification and deletion;
- mouse, trackpad and two-finger zooming and panning;
- native viewer fullscreen showing only the schematic and its exit button, automatically unavailable in edit mode;
- independent per-page zoom and position persisted in `.ese` projects and HTML exports;
- image import, direct camera or webcam capture, and physical-page import from multi-page PDFs;
- PDF page selection through thumbnails, numbers and ranges (`111`, `2-5, 9`);
- local lossless PNG conversion at 200 dpi without retaining the original PDF in the project;
- source import available only in edit mode, with no PDF page preselected;
- local, offline OCR of either a complete page or a selected legend region;
- editable colour, numeric and textual reference proposals with confidence scores and explicit user approval;
- page deletion in edit mode, with confirmation, logical-circuit preservation, undo and redo;
- adding a source to the current project or explicitly creating a new project;
- creation of a genuinely blank project, with save, discard and cancel choices whenever the current project has been modified;
- navigation across multiple sources and pages without losing existing circuits;
- automatic reopening of the latest session at startup, backed by a private local copy of the project, active page, view and unsaved changes for crash recovery;
- native opening and atomic saving of `.ese` projects;
- interchangeable opening of an `.ese` project or an HTML export produced by ESE;
- **Save** and **Save as** always writing `.ese`, including after an HTML file was opened;
- complete ESE HTML import into the current project with safe page, asset and identifier remapping;
- self-contained JSON export and re-import of circuits, traces, references and page descriptors, without images;
- import compatibility with older JSON files containing only the raw circuit array;
- standalone multi-page HTML export in viewer-only or editable mode;
- direct QR sharing of the current HTML export over the local network, without an online service;
- complete in-memory reception before display, with a local download that remains available after the server stops;
- single-recipient sharing with automatic shutdown after confirmation, or explicitly stopped multi-recipient sharing;

### Quick usage

#### Create a new project

1. Click **New project**.
2. If the current project has been modified, choose **Save and continue**, **Continue without saving** or **Cancel**. Cancelling or failing to save keeps the current project intact.
3. The new project contains no source, page, reference or circuit. Use the central **Import source…** action to begin; edit mode is enabled automatically.

#### Resume the latest session

ESE automatically reopens the latest session at startup. A recovery archive is kept in the application’s private storage and refreshed after each change: it contains imported images, circuits, the active page, its zoom and position even when the `.ese` file has not yet been saved. This local copy is used only for session resumption and crash recovery; it does not replace user-chosen saves.

#### View a schematic

1. Hover over a line to temporarily reveal the complete circuit sharing its reference.
2. Click to keep the circuit highlighted.
3. Click that circuit again, click another circuit or click empty space to change the selection.

#### Add a portion

1. Enable **Edit mode**.
2. Select the relevant circuit.
3. Click **Add trace**.
4. Click to place points and corners.
5. Press `Enter` to finish, or double-click to finish and immediately start another portion.

`Backspace` removes the latest point being drawn and `Escape` cancels the current drawing.

#### Modify or delete a portion

1. Enable **Edit mode** and select the circuit. The complete circuit remains highlighted.
2. Enable **Edit portion**.
3. Hover over and click the required portion: it is emphasised and its handles appear.
4. Drag a handle to move one point, or drag the segment to move both endpoints.
5. Press `Delete` or use **Delete portion** to remove only that portion.

Clicking empty space or pressing `Escape` clears the portion selection while keeping the circuit active.

#### Import one or more PDF pages

1. Enable **Edit mode**, then click **Import source…** and choose a PDF.
2. Choose **Add to current project** to preserve every existing page and trace, or explicitly create a new project.
3. Enter the required physical page numbers (`111`, `2-5, 9`) or click their thumbnails. No page is selected by default.
4. Click **Import**. The pages are converted sequentially to PNG and added to the **Documents** panel.

Page numbering always follows the PDF’s physical order, independently of the number printed on the page. The original PDF is used only during conversion and is not retained in the `.ese` file.

#### Photograph a schematic directly

1. Enable **Edit mode**, then click **Take a photo**.
2. On Android, ESE opens the native camera application with the rear camera preferred. Photograph the document, then confirm or retake it in the phone interface.
3. On a computer, select the webcam, frame the document and click **Photograph**. Check the preview, then choose **Retake** or **Import photo**.
4. Add the photo to the current project or explicitly create a new project, just like any other image.

The camera is requested only after this explicit action. The photo remains local, becomes an ordinary image page in the project and then follows the same save and export rules as imported images.

#### Open or import ESE HTML and JSON

- **Open** accepts either an `.ese` file or an HTML file exported by ESE. An opened HTML becomes a complete project again; **Save** and **Save as** always produce an `.ese` file and never overwrite the source HTML.
- In **Edit mode**, **Import source…** also accepts ESE HTML. It can replace the project or append all its pages, working images, references and circuits. Identifiers are remapped so existing items cannot be overwritten, while identical references remain one common logical circuit.
- The same button imports an annotations JSON file into the current project. ESE matches pages by identifier or characteristics, then by order when both documents contain the same number of pages. A single-page JSON can target the active page, and coordinates are scaled when its resolution differs.

An arbitrary HTML file without ESE’s embedded export data is rejected cleanly. Older raw-circuit-array JSON files remain supported; they use their original identifiers or, for a single-page document, the active page.

#### Recognise references from a legend

1. Enable **Edit mode**, display the required page, then open **References…** and **Recognise…**.
2. Choose the source page and drag a rectangle around the legend. **Full page** remains available as an explicit choice.
3. Click **Recognise region**, then review every proposed reference, description, colour and confidence score.
4. Correct any field if required, clear unwanted proposals and click **Add checked references**.

The OCR engine and its English model are loaded only on demand and run entirely on the device. ESE reconstructs table rows from their geometry, preserves manufacturer-specific abbreviations (`BK`, `YE`, `BK/YE`, and others), and automatically performs a magnified second pass when it detects a numbered list. Existing references are identified and never duplicated. A tightly selected legend region remains preferable on pages containing several parallel tables. This assistant populates the reference list; it does not automatically detect or create wires and circuits, and every proposal still requires review.

#### Delete a page

1. Enable **Edit mode** and display the page to remove.
2. Click **Delete page**, then confirm the operation.

Only the page and its trace portions are deleted. Logical circuits and their references remain available even when they no longer contain a portion. A source with no remaining page is removed. The project’s last page is protected, and the operation supports undo and redo.

#### Share a schematic with a QR Code

1. Select **Viewer HTML** or **Editable HTML** in the main toolbar, then click **Share by QR**.
2. Leave **Multiple recipients** off for one receiver, or enable it for several devices.
3. On Android, grant ESE the **Nearby Wi-Fi devices** permission: ESE creates its own temporary local-only hotspot and displays a first connection QR Code. Any existing Wi-Fi or tethering hotspot is left untouched. On Windows, connect the devices to the same network manually for now.
4. Scan the network QR Code on the receiver. If the file QR Code does not appear automatically, press **Connected — Continue**: Android does not always let an ordinary application detect hotspot clients. Then scan the file QR Code.
5. The receiver browser copies the whole HTML file, displays it from local memory and keeps a **Download** button. A single-recipient share stops after that reception is confirmed; a multi-recipient share stays open until the sender presses **Stop sharing**.

The server accepts neither uploads nor file browsing: it exposes only the receiver shell, the random-token-protected HTML export and its acknowledgement endpoint. A single-recipient session with no completed reception expires after five minutes. When sharing ends, ESE stops only the local hotspot it created itself; it never stops pre-existing Wi-Fi, tethering or hotspot connections.

### Electrical tracing rules

ESE keeps displayed geometry distinct from electrical continuity:

- crossing wires are connected **only when an explicit junction dot is present**;
- without a dot, a crossing always represents separate circuits;
- a printed reference may visually interrupt a line, but the portions on both sides belong to the same circuit when they carry the same reference;
- connectors, switches, fuses, lamps and other components must not be mistaken for cable portions;
- geometrically separate portions may belong to the same logical circuit.

### The `.ese` project format

An `.ese` file is an unencrypted, platform-independent ZIP archive. It includes entries such as:

```text
mimetype
manifest.json
annotations/circuits.json
renditions/<source-id>/page-<number>.png
```

The format is neither encrypted nor deliberately opaque. It retains the working images and required metadata, but not the original PDFs or documents used to produce them. A directly imported image is stored only once. Trace coordinates use the logical coordinate system of each page and remain independent from display resolution.

The current specification is documented in [docs/ESE_PROJECT_FORMAT.md](docs/ESE_PROJECT_FORMAT.md). The validated alpha18 baseline and cross-platform release roadmap are recorded in [docs/ALPHA18_BASELINE.md](docs/ALPHA18_BASELINE.md) and [docs/RELEASE_ROADMAP.md](docs/RELEASE_ROADMAP.md).

### Exports

- **Viewer HTML**: a standalone browser document with no ESE installation and no editing tools.
- **Editable HTML**: a standalone document that keeps the tracing tools needed for on-the-spot corrections.
- **JSON**: a lightweight, re-importable interchange containing circuits, traces, references/colours and page descriptors, but no image.

**Share by QR** builds the very same HTML export in memory as the local export button. Viewer/editable mode therefore remains a single, consistent choice.

The annotations JSON format is documented in [docs/ESE_JSON_INTERCHANGE.md](docs/ESE_JSON_INTERCHANGE.md).

### Development

General requirements are a recent Node.js LTS release, stable Rust and the native dependencies required by Tauri for the target platform. On Windows, native compilation requires MSVC and the Windows SDK from Visual Studio Build Tools.

```powershell
npm install
npm run dev          # browser version
npm run tauri dev    # native application in development
```

Validation and production build:

```powershell
npm test
npm run build
npm run check:rust
npm run tauri build
```

On Windows, the portable executable is produced at `src-tauri/target/release/ese.exe`.

### Roadmap

- office document import through a minimal embedded engine;
- reordering and advanced management of sources and pages;
- PNG/WebP tile pyramids for very large documents;
- comprehensive multi-source and multi-page support;
- advanced touch and stylus ergonomics;
- native Windows, Linux, macOS, Android and iOS packages;
- equivalent native network adapters for iOS and desktop platforms, with a safe manual fallback;
- complete user-interface internationalisation.

### Licence and philosophy

ESE is free software distributed under the **GNU GPL v3 or later**. Its source code, specifications and build tooling are published in this repository; see [LICENSE](LICENSE) for the complete terms.

The project favours a documented, inspectable and portable format with no proprietary encryption and no mandatory online service. PDF import uses PDF.js and local OCR uses Tesseract.js, both under the Apache-2.0 licence; QR Codes are generated locally with MIT-licensed `node-qrcode`. Third-party notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
