import { invoke, isTauri } from "@tauri-apps/api/core";
import { createEseArchive, downloadBytes, downloadText, openEseArchive } from "./archive";
import { createStandaloneHtml } from "./export-html";
import { openEseHtmlBytes } from "./html-project";
import { createAnnotationsJson, importAnnotationsJson } from "./json-interchange";
import { formatPageSelection, parsePageSelection } from "./page-selection";
import { fitPageView, normalizePageView, pageViewsEqual } from "./page-view";
import { mergeOcrProposalPasses, numericLegendRegion, ocrStatusLabel, proposalsFromOcrLines, type OcrProposal } from "./ocr";
import { countPageTraces, removeProjectPage } from "./project-pages";
import { createBlankProject } from "./project-factory";
import {
  openPdfDocument,
  renderPdfPageToPng,
  renderPdfThumbnail,
  type PdfDocument
} from "./pdf-import";
import { mergeCircuitsByReference } from "./project-normalization";
import { mergeImportedProject } from "./project-import";
import { clearRecoverySession, loadRecoverySession, saveRecoverySession } from "./session-recovery";
import { moveTracePoint, moveTraceSegment, nearestTraceSegmentIndex, removeTraceById } from "./trace-edit";
import {
  appUpdatesSupported,
  checkForAppUpdate,
  getInstalledAppVersion,
  installAppUpdate,
  type AppUpdateInfo,
  type AppUpdateProgress
} from "./app-update";
import {
  getCircuitReference,
  getLegendEntry,
  makeId,
  type Circuit,
  type EseProject,
  type LegendEntry,
  type PageView,
  type Point,
  type ProjectAssets,
  type ProjectPage,
  type Trace
} from "./types";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Racine d’application absente.");

root.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><strong>ESE</strong><span>Electrical Schematics Enlightener</span></div>
      <div class="project-title" id="project-title"></div>
      <div class="toolbar-actions">
        <button id="open-project" type="button">Ouvrir</button>
        <button id="new-project" type="button">Nouveau projet</button>
        <button id="import-source" type="button" disabled title="Active le mode édition pour importer une source.">Importer une source...</button>
        <button id="capture-source" type="button" disabled title="Active le mode édition pour photographier un schéma.">Prendre une photo</button>
        <button id="save-project" class="primary" type="button">Enregistrer</button>
        <button id="save-project-as" type="button">Enregistrer sous</button>
        <select id="export-mode" aria-label="Type d’export HTML">
          <option value="viewer">HTML consultation</option>
          <option value="editable">HTML modifiable</option>
        </select>
        <button id="export-html" type="button">Exporter HTML</button>
        <button id="share-html" type="button">Partager par QR</button>
        <button id="export-json" type="button">Exporter JSON</button>
        <button id="app-update" class="update-button" type="button" hidden>Mises à jour<span id="update-badge" class="update-badge" aria-label="Mise à jour disponible" hidden></span></button>
        <label class="mode-switch"><input id="edit-mode" type="checkbox"> Mode édition</label>
      </div>
    </header>

    <div class="workspace">
      <aside class="sidebar sources-panel">
        <div class="panel-header">
          <h2>Documents</h2>
          <p>Sources et pages du projet</p>
        </div>
        <div class="source-list" id="source-list"></div>
      </aside>

      <main class="canvas-area">
        <div class="canvas-toolbar">
          <div class="view-controls">
            <button id="previous-page" type="button" aria-label="Page précédente">&lsaquo;</button>
            <select id="page-select" aria-label="Page active"></select>
            <button id="next-page" type="button" aria-label="Page suivante">&rsaquo;</button>
            <span class="toolbar-separator" aria-hidden="true"></span>
            <button id="zoom-out" type="button">−</button>
            <button id="zoom-in" type="button">+</button>
            <button id="fit-view" type="button">Vue entière</button>
            <span id="zoom-label">100 %</span>
          </div>
          <div class="edit-tools" id="edit-tools" hidden>
            <select id="active-legend" aria-label="Repère actif"></select>
            <button id="add-trace" type="button">Ajouter un tracé</button>
            <button id="edit-portion" type="button" aria-pressed="false">Éditer une portion</button>
            <button id="new-circuit" class="primary" type="button">Nouveau circuit</button>
            <button id="finish-trace" type="button" disabled>Terminer</button>
            <button id="cancel-trace" type="button" disabled>Annuler</button>
            <button id="undo" type="button" disabled>↶</button>
            <button id="redo" type="button" disabled>↷</button>
            <button id="remove-trace" class="danger" type="button">Supprimer la portion</button>
            <button id="delete-circuit" class="danger" type="button">Supprimer le circuit</button>
            <button id="delete-page" class="danger" type="button">Supprimer la page</button>
          </div>
        </div>
        <div class="viewport" id="viewport">
          <button id="viewer-fullscreen" class="fullscreen-toggle" type="button" aria-label="Afficher le schéma en plein écran" title="Plein écran" aria-pressed="false">
            <svg class="fullscreen-enter-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path>
            </svg>
            <svg class="fullscreen-exit-icon" viewBox="0 0 24 24" aria-hidden="true" hidden>
              <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"></path>
            </svg>
          </button>
          <div id="empty-project" class="empty-project" hidden>
            <h2>Projet vierge</h2>
            <p>Importe une image ou une ou plusieurs pages PDF pour commencer.</p>
            <div class="empty-project-actions">
              <button id="empty-import-source" class="primary" type="button">Importer une source…</button>
              <button id="empty-capture-source" type="button">Prendre une photo</button>
            </div>
          </div>
          <svg id="diagram" viewBox="0 0 1 1" role="img" aria-label="Schéma électrique interactif">
            <image class="source-diagram" id="source-image" href="" x="0" y="0"></image>
            <rect class="canvas-hit" id="canvas-hit" x="0" y="0" width="1" height="1"></rect>
            <g id="wire-layer"></g>
            <g id="trace-edit-layer"></g>
            <g id="preview-layer" aria-hidden="true">
              <path class="preview-outline"></path>
              <path class="preview-main"></path>
              <path class="preview-stripe"></path>
              <circle class="preview-node" r="9" visibility="hidden"></circle>
            </g>
          </svg>
        </div>
      </main>

      <aside class="sidebar circuits-panel">
        <div class="panel-header">
          <div class="panel-header-row"><h2>Circuits</h2><button id="edit-legend" type="button">Repères…</button></div>
          <p id="circuit-summary"></p>
          <input class="circuit-search" id="circuit-search" type="search" placeholder="Rechercher un repère…">
        </div>
        <div class="circuit-list" id="circuit-list"></div>
      </aside>
    </div>

    <footer class="statusbar">
      <span class="message" id="status-message"></span>
      <span id="coordinates">x 0 · y 0</span>
      <span id="save-state"></span>
    </footer>
  </div>

  <dialog id="legend-dialog">
    <div class="dialog-header"><h2>Liste des repères</h2><button id="close-legend" type="button">Fermer</button></div>
    <div class="dialog-body">
      <table class="legend-table">
        <thead><tr><th>Repère</th><th>Désignation</th><th>Couleur</th><th>Composée</th><th></th></tr></thead>
        <tbody id="legend-table-body"></tbody>
      </table>
    </div>
    <div class="dialog-footer"><span>Les modifications sont appliquées immédiatement.</span><div class="dialog-actions"><button id="open-ocr" type="button">Reconnaître…</button><button id="add-legend-entry" class="primary" type="button">Ajouter un repère</button></div></div>
  </dialog>

  <dialog id="ocr-dialog" class="ocr-dialog">
    <div class="dialog-header">
      <div><h2>Reconnaître des repères</h2><p>OCR local — aucune image ne quitte l’appareil</p></div>
      <button id="close-ocr" type="button">Fermer</button>
    </div>
    <div class="ocr-dialog-body">
      <div class="ocr-toolbar">
        <label for="ocr-page">Page source</label>
        <select id="ocr-page"></select>
        <button id="ocr-full-page" type="button">Page entière</button>
        <button id="run-ocr" class="primary" type="button">Reconnaître la zone</button>
      </div>
      <div class="ocr-workspace">
        <section class="ocr-preview-panel">
          <p class="dialog-note">Trace un rectangle autour de la légende, ou utilise la page entière.</p>
          <div id="ocr-preview" class="ocr-preview">
            <canvas id="ocr-canvas" aria-label="Aperçu de la page à reconnaître"></canvas>
            <div id="ocr-selection" class="ocr-selection" aria-hidden="true"></div>
          </div>
        </section>
        <section class="ocr-results-panel">
          <output id="ocr-status">Sélectionne une zone à reconnaître.</output>
          <table class="ocr-table">
            <thead><tr><th>Ajouter</th><th>Repère</th><th>Désignation</th><th>Couleur</th><th>Confiance</th></tr></thead>
            <tbody id="ocr-results"></tbody>
          </table>
          <p id="ocr-empty" class="empty-state">Aucune proposition pour le moment.</p>
          <details class="ocr-raw"><summary>Texte reconnu</summary><pre id="ocr-raw-text"></pre></details>
        </section>
      </div>
    </div>
    <div class="dialog-footer">
      <span>Les propositions restent modifiables avant insertion.</span>
      <div class="dialog-actions"><button id="cancel-ocr" type="button">Annuler</button><button id="apply-ocr" class="primary" type="button" disabled>Ajouter les repères cochés</button></div>
    </div>
  </dialog>

  <dialog id="source-destination-dialog" class="compact-dialog">
    <div class="dialog-header"><h2>Importer une source</h2></div>
    <div class="dialog-body">
      <p class="dialog-lead" id="source-destination-name"></p>
      <p id="source-destination-copy"></p>
      <p class="dialog-note" id="source-destination-warning"></p>
    </div>
    <form method="dialog" class="dialog-footer import-destination-actions">
      <button value="cancel" type="submit">Annuler</button>
      <button value="new" type="submit">Créer un nouveau projet</button>
      <button value="add" class="primary" type="submit">Ajouter au projet actuel</button>
    </form>
  </dialog>

  <dialog id="camera-dialog" class="camera-dialog">
    <div class="dialog-header">
      <div><h2>Photographier un schéma</h2><p>La photo reste sur cet appareil</p></div>
      <button id="close-camera" type="button">Fermer</button>
    </div>
    <div class="camera-dialog-body">
      <div class="camera-toolbar">
        <label for="camera-device">Caméra</label>
        <select id="camera-device" aria-label="Caméra utilisée"></select>
        <button id="switch-camera" type="button">Changer de caméra</button>
      </div>
      <div id="camera-stage" class="camera-stage">
        <video id="camera-video" autoplay playsinline muted aria-label="Aperçu de la caméra"></video>
        <img id="camera-preview" alt="Photo du schéma prête à importer" hidden>
        <div id="camera-placeholder" class="camera-placeholder">Ouverture de la caméra…</div>
      </div>
      <output id="camera-status">Autorise l’accès à la caméra si le système le demande.</output>
    </div>
    <div class="dialog-footer camera-actions">
      <button id="cancel-camera" type="button">Annuler</button>
      <div class="dialog-actions">
        <button id="retake-photo" type="button" hidden>Reprendre</button>
        <button id="take-photo" class="primary" type="button" disabled>Photographier</button>
        <button id="import-photo" class="primary" type="button" hidden>Importer la photo</button>
      </div>
    </div>
  </dialog>

  <dialog id="new-project-dialog" class="compact-dialog">
    <div class="dialog-header"><h2>Nouveau projet</h2></div>
    <div class="dialog-body">
      <p class="dialog-lead" id="new-project-copy"></p>
      <p class="dialog-note">Que veux-tu faire avant de créer le nouveau projet&nbsp;?</p>
    </div>
    <form method="dialog" class="dialog-footer import-destination-actions">
      <button value="cancel" type="submit">Annuler</button>
      <button value="discard" class="danger" type="submit">Continuer sans enregistrer</button>
      <button value="save" class="primary" type="submit">Enregistrer et continuer</button>
    </form>
  </dialog>

  <dialog id="pdf-import-dialog" class="pdf-import-dialog">
    <div class="dialog-header">
      <div><h2>Importer les pages d'un PDF</h2><p id="pdf-document-summary"></p></div>
      <button id="close-pdf-import" type="button">Fermer</button>
    </div>
    <div class="pdf-dialog-body" id="pdf-dialog-body">
      <div class="pdf-selection-bar">
        <label for="pdf-page-selection">Pages physiques</label>
        <input id="pdf-page-selection" type="text" inputmode="numeric" placeholder="Ex. 111 ou 2-5, 9">
        <button id="pdf-select-all" type="button">Tout sélectionner</button>
        <button id="pdf-clear-selection" type="button">Tout désélectionner</button>
      </div>
      <p class="dialog-note">Les numéros correspondent à l'ordre physique du PDF. Les pages choisies seront converties en PNG sans perte à 200 ppp.</p>
      <div class="pdf-thumbnail-grid" id="pdf-thumbnail-grid"></div>
    </div>
    <div class="dialog-footer">
      <output id="pdf-import-status">Sélectionne au moins une page.</output>
      <div class="dialog-actions">
        <button id="cancel-pdf-import" type="button">Annuler</button>
        <button id="confirm-pdf-import" class="primary" type="button" disabled>Importer</button>
      </div>
    </div>
  </dialog>

  <dialog id="share-dialog" class="share-dialog">
    <div class="dialog-header">
      <div><h2>Partager le schéma</h2><p>Transfert direct sur le réseau local — aucun service en ligne</p></div>
      <button id="close-share" type="button">Fermer</button>
    </div>
    <div class="share-dialog-body">
      <section id="share-setup" class="share-setup">
        <div class="share-mode-summary">
          <span>Fichier envoyé</span>
          <strong id="share-export-mode"></strong>
          <small>Ce choix vient de la liste d’export de la barre principale.</small>
        </div>
        <label class="share-multiple-switch">
          <span><strong>Partage multiple</strong><small>Le serveur restera ouvert jusqu’à ce que tu l’arrêtes.</small></span>
          <input id="share-multiple" type="checkbox" role="switch">
        </label>
        <div class="share-network-card">
          <strong>1. Relier les appareils</strong>
          <p id="share-network-summary">Vérification des possibilités de connexion…</p>
          <div id="share-network-qr" class="share-qr share-network-qr" hidden></div>
          <div id="share-network-credentials" class="share-network-credentials" hidden>
            <span>Réseau <code id="share-network-ssid"></code></span>
            <span>Mot de passe <code id="share-network-password"></code></span>
          </div>
          <details>
            <summary>Aide à la connexion manuelle</summary>
            <ol>
              <li>Connecte l’appareil qui exécute ESE et les appareils récepteurs au même Wi-Fi.</li>
              <li>Tu peux aussi activer manuellement le point d’accès d’un téléphone, puis y connecter les autres appareils.</li>
              <li>Si le pare-feu Windows le demande, autorise ESE sur les réseaux privés.</li>
            </ol>
            <p>ESE ne modifiera jamais un réseau ou un point d’accès qu’il n’a pas lui-même créé.</p>
          </details>
        </div>
        <button id="continue-share" class="primary share-continue" type="button">Les appareils sont connectés — Continuer</button>
      </section>
      <section id="share-active" class="share-active" hidden>
        <div class="share-transfer-copy">
          <strong>2. Scanner pour recevoir le schéma</strong>
          <p>Le navigateur copie d’abord tout le fichier, l’affiche ensuite et confirme la réception à ESE.</p>
        </div>
        <div id="share-file-qr" class="share-qr" aria-label="QR Code du fichier partagé"></div>
        <div class="share-url-row">
          <input id="share-url" type="text" readonly aria-label="Adresse de partage">
          <button id="copy-share-url" type="button">Copier</button>
        </div>
        <div class="share-progress-card" aria-live="polite">
          <strong id="share-state">Serveur prêt</strong>
          <span id="share-counter"></span>
          <span id="share-bytes"></span>
        </div>
      </section>
    </div>
    <div class="dialog-footer">
      <output id="share-status">Le transfert reste entièrement local.</output>
      <div class="dialog-actions"><button id="stop-share" class="danger" type="button" hidden>Arrêter le partage</button></div>
    </div>
  </dialog>

  <dialog id="update-dialog" class="compact-dialog update-dialog">
    <div class="dialog-header">
      <div><h2>Mises à jour d’ESE</h2><p>Vérification sécurisée sur GitHub Releases</p></div>
      <button id="close-update" type="button">Fermer</button>
    </div>
    <div class="dialog-body update-dialog-body">
      <div class="update-version-card">
        <span>Version installée</span>
        <strong id="update-current-version">—</strong>
      </div>
      <p id="update-summary">Recherche d’une nouvelle version…</p>
      <div id="update-release-details" class="update-release-details" hidden>
        <div><span>Version disponible</span><strong id="update-available-version"></strong></div>
        <div><span>Publication</span><strong id="update-published-at"></strong></div>
        <p id="update-notes"></p>
        <a id="update-release-link" href="https://github.com/NibinNaug/ESE-Electrical-Schematics-Enlightener/releases" target="_blank" rel="noreferrer">Voir la release sur GitHub</a>
      </div>
      <progress id="update-progress" max="1" hidden></progress>
      <p class="dialog-note" id="update-security-note">Les mises à jour desktop sont signées par la clé ESE. Android vérifie l’empreinte téléchargée, puis la signature de l’APK avant remplacement.</p>
    </div>
    <div class="dialog-footer update-dialog-footer">
      <output id="update-status" aria-live="polite"></output>
      <div class="dialog-actions">
        <button id="check-update" type="button">Rechercher</button>
        <button id="install-update" class="primary" type="button" hidden>Installer</button>
      </div>
    </div>
  </dialog>

  <input id="project-file" type="file" accept=".ese,.html,.htm,application/zip,text/html" hidden>
  <input id="source-file" type="file" accept="image/*,.pdf,.html,.htm,.json,application/pdf,text/html,application/json" hidden>
  <input id="camera-file" type="file" accept="image/*" capture="environment" hidden>
`;

const byId = <T extends Element>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément absent : ${id}`);
  return element as unknown as T;
};

const appShell = root.querySelector<HTMLDivElement>(".app-shell")!;
const svg = byId<SVGSVGElement>("diagram");
const viewport = byId<HTMLDivElement>("viewport");
const image = byId<SVGImageElement>("source-image");
const canvasHit = byId<SVGRectElement>("canvas-hit");
const wireLayer = byId<SVGGElement>("wire-layer");
const traceEditLayer = byId<SVGGElement>("trace-edit-layer");
const previewOutline = root.querySelector<SVGPathElement>(".preview-outline")!;
const previewMain = root.querySelector<SVGPathElement>(".preview-main")!;
const previewStripe = root.querySelector<SVGPathElement>(".preview-stripe")!;
const previewNode = root.querySelector<SVGCircleElement>(".preview-node")!;
const titleNode = byId<HTMLDivElement>("project-title");
const sourceList = byId<HTMLDivElement>("source-list");
const circuitList = byId<HTMLDivElement>("circuit-list");
const circuitSummary = byId<HTMLParagraphElement>("circuit-summary");
const circuitSearch = byId<HTMLInputElement>("circuit-search");
const statusMessage = byId<HTMLSpanElement>("status-message");
const coordinates = byId<HTMLSpanElement>("coordinates");
const saveState = byId<HTMLSpanElement>("save-state");
const editMode = byId<HTMLInputElement>("edit-mode");
const editTools = byId<HTMLDivElement>("edit-tools");
const newProjectButton = byId<HTMLButtonElement>("new-project");
const importSourceButton = byId<HTMLButtonElement>("import-source");
const captureSourceButton = byId<HTMLButtonElement>("capture-source");
const emptyProject = byId<HTMLDivElement>("empty-project");
const emptyImportSourceButton = byId<HTMLButtonElement>("empty-import-source");
const emptyCaptureSourceButton = byId<HTMLButtonElement>("empty-capture-source");
const activeLegend = byId<HTMLSelectElement>("active-legend");
const addTraceButton = byId<HTMLButtonElement>("add-trace");
const editPortionButton = byId<HTMLButtonElement>("edit-portion");
const finishButton = byId<HTMLButtonElement>("finish-trace");
const cancelButton = byId<HTMLButtonElement>("cancel-trace");
const undoButton = byId<HTMLButtonElement>("undo");
const redoButton = byId<HTMLButtonElement>("redo");
const removeTraceButton = byId<HTMLButtonElement>("remove-trace");
const deleteCircuitButton = byId<HTMLButtonElement>("delete-circuit");
const deletePageButton = byId<HTMLButtonElement>("delete-page");
const zoomLabel = byId<HTMLSpanElement>("zoom-label");
const pageSelect = byId<HTMLSelectElement>("page-select");
const previousPageButton = byId<HTMLButtonElement>("previous-page");
const nextPageButton = byId<HTMLButtonElement>("next-page");
const zoomOutButton = byId<HTMLButtonElement>("zoom-out");
const zoomInButton = byId<HTMLButtonElement>("zoom-in");
const fitViewButton = byId<HTMLButtonElement>("fit-view");
const viewerFullscreenButton = byId<HTMLButtonElement>("viewer-fullscreen");
const fullscreenEnterIcon = viewerFullscreenButton.querySelector<SVGSVGElement>(".fullscreen-enter-icon")!;
const fullscreenExitIcon = viewerFullscreenButton.querySelector<SVGSVGElement>(".fullscreen-exit-icon")!;
const newCircuitButton = byId<HTMLButtonElement>("new-circuit");
const exportHtmlButton = byId<HTMLButtonElement>("export-html");
const shareHtmlButton = byId<HTMLButtonElement>("share-html");
const legendDialog = byId<HTMLDialogElement>("legend-dialog");
const legendBody = byId<HTMLTableSectionElement>("legend-table-body");
const openOcrButton = byId<HTMLButtonElement>("open-ocr");
const ocrDialog = byId<HTMLDialogElement>("ocr-dialog");
const ocrPageSelect = byId<HTMLSelectElement>("ocr-page");
const ocrCanvas = byId<HTMLCanvasElement>("ocr-canvas");
const ocrSelectionNode = byId<HTMLDivElement>("ocr-selection");
const ocrStatus = byId<HTMLOutputElement>("ocr-status");
const ocrResults = byId<HTMLTableSectionElement>("ocr-results");
const ocrEmpty = byId<HTMLParagraphElement>("ocr-empty");
const ocrRawText = byId<HTMLPreElement>("ocr-raw-text");
const runOcrButton = byId<HTMLButtonElement>("run-ocr");
const applyOcrButton = byId<HTMLButtonElement>("apply-ocr");
const projectFile = byId<HTMLInputElement>("project-file");
const sourceFile = byId<HTMLInputElement>("source-file");
const cameraFile = byId<HTMLInputElement>("camera-file");
const sourceDestinationDialog = byId<HTMLDialogElement>("source-destination-dialog");
const sourceDestinationName = byId<HTMLParagraphElement>("source-destination-name");
const sourceDestinationCopy = byId<HTMLParagraphElement>("source-destination-copy");
const sourceDestinationWarning = byId<HTMLParagraphElement>("source-destination-warning");
const cameraDialog = byId<HTMLDialogElement>("camera-dialog");
const cameraDevice = byId<HTMLSelectElement>("camera-device");
const cameraVideo = byId<HTMLVideoElement>("camera-video");
const cameraPreview = byId<HTMLImageElement>("camera-preview");
const cameraPlaceholder = byId<HTMLDivElement>("camera-placeholder");
const cameraStatus = byId<HTMLOutputElement>("camera-status");
const switchCameraButton = byId<HTMLButtonElement>("switch-camera");
const takePhotoButton = byId<HTMLButtonElement>("take-photo");
const retakePhotoButton = byId<HTMLButtonElement>("retake-photo");
const importPhotoButton = byId<HTMLButtonElement>("import-photo");
const newProjectDialog = byId<HTMLDialogElement>("new-project-dialog");
const newProjectCopy = byId<HTMLParagraphElement>("new-project-copy");
const pdfImportDialog = byId<HTMLDialogElement>("pdf-import-dialog");
const pdfDialogBody = byId<HTMLDivElement>("pdf-dialog-body");
const pdfDocumentSummary = byId<HTMLParagraphElement>("pdf-document-summary");
const pdfPageSelection = byId<HTMLInputElement>("pdf-page-selection");
const pdfThumbnailGrid = byId<HTMLDivElement>("pdf-thumbnail-grid");
const pdfImportStatus = byId<HTMLOutputElement>("pdf-import-status");
const confirmPdfImport = byId<HTMLButtonElement>("confirm-pdf-import");
const shareDialog = byId<HTMLDialogElement>("share-dialog");
const shareSetup = byId<HTMLElement>("share-setup");
const shareActive = byId<HTMLElement>("share-active");
const shareExportMode = byId<HTMLElement>("share-export-mode");
const shareMultiple = byId<HTMLInputElement>("share-multiple");
const shareNetworkSummary = byId<HTMLParagraphElement>("share-network-summary");
const shareNetworkQr = byId<HTMLDivElement>("share-network-qr");
const shareNetworkCredentials = byId<HTMLDivElement>("share-network-credentials");
const shareNetworkSsid = byId<HTMLElement>("share-network-ssid");
const shareNetworkPassword = byId<HTMLElement>("share-network-password");
const continueShareButton = byId<HTMLButtonElement>("continue-share");
const shareFileQr = byId<HTMLDivElement>("share-file-qr");
const shareUrl = byId<HTMLInputElement>("share-url");
const shareState = byId<HTMLElement>("share-state");
const shareCounter = byId<HTMLElement>("share-counter");
const shareBytes = byId<HTMLElement>("share-bytes");
const shareStatus = byId<HTMLOutputElement>("share-status");
const stopShareButton = byId<HTMLButtonElement>("stop-share");
const appUpdateButton = byId<HTMLButtonElement>("app-update");
const updateBadge = byId<HTMLSpanElement>("update-badge");
const updateDialog = byId<HTMLDialogElement>("update-dialog");
const closeUpdateButton = byId<HTMLButtonElement>("close-update");
const checkUpdateButton = byId<HTMLButtonElement>("check-update");
const installUpdateButton = byId<HTMLButtonElement>("install-update");
const updateCurrentVersion = byId<HTMLElement>("update-current-version");
const updateSummary = byId<HTMLParagraphElement>("update-summary");
const updateReleaseDetails = byId<HTMLDivElement>("update-release-details");
const updateAvailableVersion = byId<HTMLElement>("update-available-version");
const updatePublishedAt = byId<HTMLElement>("update-published-at");
const updateNotes = byId<HTMLParagraphElement>("update-notes");
const updateReleaseLink = byId<HTMLAnchorElement>("update-release-link");
const updateProgress = byId<HTMLProgressElement>("update-progress");
const updateStatus = byId<HTMLOutputElement>("update-status");
const ns = "http://www.w3.org/2000/svg";

type ImportDestination = "add" | "new";
type ProjectReplacementChoice = "save" | "discard" | "cancel";

type ShareNetworkCapabilities = {
  platform: string;
  automaticHotspot: boolean;
  canStartServer: boolean;
};

type AndroidHotspotCapabilities = {
  supported: boolean;
  apiLevel: number;
  permissionGranted: boolean;
};

type AndroidHotspotEventDetail = {
  requestId: string;
  state: "starting" | "ready" | "unsupported" | "permissionDenied" | "incompatibleMode" | "failed" | "stopped";
  owned: boolean;
  message?: string;
  ssid?: string;
  passphrase?: string;
  security?: "WPA" | "nopass";
  address?: string;
  interfaceName?: string;
};

type ShareStartResult = {
  sessionId: string;
  url: string;
  multiple: boolean;
};

type ShareStatus = ShareStartResult & {
  running: boolean;
  completedTransfers: number;
  fileDeliveries: number;
  bytesSent: number;
  stopReason: "completed" | "timeout" | "manual" | "error" | null;
  lastError: string | null;
};

type PendingPdfImport = {
  file: File;
  document: PdfDocument;
  destination: ImportDestination;
};

type Drawing = {
  circuitId: string;
  points: Point[];
  cursor: Point | null;
};

type TraceDrag = {
  circuitId: string;
  traceId: string;
  pointerId: number;
  kind: "point" | "segment";
  index: number;
  startClient: Point;
  startSvg: Point;
  originalPoints: Point[];
  moved: boolean;
};

type TouchGesture = {
  startCenter: Point;
  startDistance: number;
  anchor: Point;
  startView: { x: number; y: number; width: number; height: number };
};

type OcrSelection = { x: number; y: number; width: number; height: number };

type EditableOcrProposal = OcrProposal & {
  selected: boolean;
};

let project: EseProject;
let assets: ProjectAssets = new Map();
let currentPageId = "";
let currentPath: string | null = null;
let selectedCircuitId: string | null = null;
let hoveredCircuitId: string | null = null;
let portionEditMode = false;
let selectedTraceId: string | null = null;
let hoveredTraceId: string | null = null;
let traceDrag: TraceDrag | null = null;
let drawing: Drawing | null = null;
let imageUrl: string | null = null;
let dirty = false;
let viewerFullscreen = false;
let view: PageView = { x: 0, y: 0, width: 1, height: 1 };
let dragState: { x: number; y: number; viewX: number; viewY: number; moved: boolean } | null = null;
const touchPoints = new Map<number, Point>();
let touchGesture: TouchGesture | null = null;
let suppressDiagramClickUntil = 0;
let wheelGestureMode: "pan" | "zoom" | null = null;
let lastWheelEventAt = 0;
let pendingPdfImport: PendingPdfImport | null = null;
let selectedPdfPages = new Set<number>();
let pdfThumbnailObserver: IntersectionObserver | null = null;
let pdfImportBusy = false;
let ocrSelection: OcrSelection = { x: 0, y: 0, width: 1, height: 1 };
let ocrSelectionMode: "none" | "region" | "full" = "none";
let ocrSelectionStart: Point | null = null;
let ocrPreviewUrl: string | null = null;
let ocrProposals: EditableOcrProposal[] = [];
let ocrBusy = false;
let shareSessionId: string | null = null;
let sharePollTimer: number | null = null;
let hotspotClientPollTimer: number | null = null;
let shareBusy = false;
let shareLastStatus: ShareStatus | null = null;
let androidHotspotRequestId: string | null = null;
let androidHotspotOwned = false;
let androidShareAddress = "";
let cameraStream: MediaStream | null = null;
let cameraDevices: MediaDeviceInfo[] = [];
let cameraCaptureBlob: Blob | null = null;
let cameraCaptureUrl: string | null = null;
let cameraFacingMode: "environment" | "user" = "environment";
let cameraOpening = false;
let cameraRequestGeneration = 0;
let availableAppUpdate: AppUpdateInfo | null = null;
let appUpdateBusy = false;
const undoStack: string[] = [];
const redoStack: string[] = [];
let recoveryReady = false;
let recoveryTimer: number | null = null;
let recoveryWriteActive = false;
let recoveryWritePending = false;

const page = (): ProjectPage => {
  const found = project.pages.find((item) => item.id === currentPageId);
  if (!found) throw new Error("Page active introuvable.");
  return found;
};

const hasPage = (): boolean => project.pages.length > 0;

const isBlankProject = (): boolean =>
  !project.sources.length
  && !project.pages.length
  && !project.legendEntries.length
  && !project.circuits.length;

const circuit = (id: string | null): Circuit | null =>
  id ? project.circuits.find((item) => item.id === id) ?? null : null;

const trace = (circuitId: string | null, traceId: string | null): Trace | null =>
  circuit(circuitId)?.traces.find((item) => item.id === traceId) ?? null;

const legendEntry = (circuitValue: Circuit | null): LegendEntry | null =>
  getLegendEntry(project, circuitValue);

const pointsToPath = (points: Point[]): string =>
  points.length
    ? points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ")
    : "";

const setStatus = (text: string): void => {
  statusMessage.textContent = text;
};

const persistRecoverySession = async (): Promise<void> => {
  if (!recoveryReady) return;
  if (recoveryWriteActive) {
    recoveryWritePending = true;
    return;
  }

  recoveryWriteActive = true;
  try {
    do {
      recoveryWritePending = false;
      const recovery = {
        // Les PNG sont déjà compressés : le mode stockage évite de les recomprimer
        // à chaque autosauvegarde et garde cette opération légère sur mobile.
        archiveBytes: createEseArchive(project, assets, 0),
        currentPath,
        currentPageId,
        dirty,
        editMode: editMode.checked,
        selectedCircuitId
      };
      await saveRecoverySession(recovery);
    } while (recoveryWritePending);
  } catch (error) {
    console.warn("La copie privée de récupération n’a pas pu être mise à jour.", error);
  } finally {
    recoveryWriteActive = false;
  }
};

const scheduleRecoverySession = (delay = 650): void => {
  if (!recoveryReady) return;
  recoveryWritePending = true;
  if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
  recoveryTimer = window.setTimeout(() => {
    recoveryTimer = null;
    void persistRecoverySession();
  }, delay);
};

const markDirty = (): void => {
  dirty = true;
  project.modifiedAt = new Date().toISOString();
  saveState.innerHTML = '<span class="dirty-dot">●</span> Modifications non enregistrées';
  scheduleRecoverySession();
};

const markSaved = (): void => {
  dirty = false;
  saveState.textContent = "Enregistré";
  scheduleRecoverySession();
};

const updateProgressLabel = (progress: AppUpdateProgress): string => {
  if (!progress.total) return progress.message;
  const percent = Math.min(100, Math.round(progress.downloaded / progress.total * 100));
  return `${progress.message} ${percent} %`;
};

const renderAvailableAppUpdate = (update: AppUpdateInfo | null): void => {
  availableAppUpdate = update;
  updateBadge.hidden = !update;
  appUpdateButton.classList.toggle("update-available", Boolean(update));
  appUpdateButton.title = update
    ? `ESE ${update.version} est disponible.`
    : "Rechercher une mise à jour d’ESE.";
  installUpdateButton.hidden = !update;
  updateReleaseDetails.hidden = !update;
  if (!update) return;

  updateAvailableVersion.textContent = update.version;
  updatePublishedAt.textContent = update.publishedAt
    ? new Date(update.publishedAt).toLocaleDateString("fr-FR", { dateStyle: "long" })
    : "Date non fournie";
  updateNotes.textContent = update.notes;
  updateReleaseLink.href = update.releaseUrl;
  installUpdateButton.textContent = update.platform === "android"
    ? "Télécharger et installer"
    : "Installer et redémarrer";
};

const setAppUpdateBusy = (busy: boolean): void => {
  appUpdateBusy = busy;
  checkUpdateButton.disabled = busy;
  installUpdateButton.disabled = busy;
  closeUpdateButton.disabled = busy;
};

const checkApplicationUpdate = async (manual: boolean): Promise<void> => {
  if (appUpdateBusy || !appUpdatesSupported()) return;
  setAppUpdateBusy(true);
  if (manual) {
    updateSummary.textContent = "Recherche d’une nouvelle version…";
    updateStatus.textContent = "Connexion à GitHub Releases…";
    updateProgress.hidden = true;
  }
  try {
    const result = await checkForAppUpdate();
    updateCurrentVersion.textContent = result.currentVersion;
    renderAvailableAppUpdate(result.update);
    if (result.update) {
      updateSummary.textContent = `ESE ${result.update.version} est disponible.`;
      updateStatus.textContent = "La mise à jour est prête à être téléchargée.";
      setStatus(`Mise à jour ESE ${result.update.version} disponible.`);
    } else {
      updateSummary.textContent = "ESE est à jour.";
      updateStatus.textContent = `Aucune version plus récente que ${result.currentVersion}.`;
    }
  } catch (error) {
    if (manual) {
      updateSummary.textContent = "La vérification a échoué.";
      updateStatus.textContent = String(error);
    } else {
      console.warn("Vérification automatique des mises à jour impossible.", error);
    }
  } finally {
    setAppUpdateBusy(false);
  }
};

const openApplicationUpdate = async (): Promise<void> => {
  if (!appUpdatesSupported()) return;
  if (!updateDialog.open) updateDialog.showModal();
  if (availableAppUpdate) {
    renderAvailableAppUpdate(availableAppUpdate);
    updateSummary.textContent = `ESE ${availableAppUpdate.version} est disponible.`;
    updateStatus.textContent = "La mise à jour est prête à être téléchargée.";
    return;
  }
  await checkApplicationUpdate(true);
};

const installAvailableAppUpdate = async (): Promise<void> => {
  if (!availableAppUpdate || appUpdateBusy) return;
  if (dirty && !window.confirm("Le projet contient des modifications non enregistrées. ESE va conserver une copie de récupération, mais il est préférable de les enregistrer avant la mise à jour. Continuer ?")) return;

  const attemptedUpdate = availableAppUpdate;
  setAppUpdateBusy(true);
  updateProgress.hidden = false;
  updateProgress.removeAttribute("value");
  updateStatus.textContent = "Préparation de la mise à jour…";
  try {
    await persistRecoverySession();
    await installAppUpdate(availableAppUpdate, (progress) => {
      updateStatus.textContent = updateProgressLabel(progress);
      if (progress.total) updateProgress.value = Math.min(1, progress.downloaded / progress.total);
      else updateProgress.removeAttribute("value");
    });
    if (availableAppUpdate.platform === "android") {
      updateProgress.value = 1;
      updateStatus.textContent = "Valide maintenant le remplacement d’ESE dans l’installateur Android.";
    }
  } catch (error) {
    if (attemptedUpdate.platform === "desktop") {
      renderAvailableAppUpdate(null);
      updateSummary.textContent = "La mise à jour doit être vérifiée à nouveau.";
      updateStatus.textContent = `Installation impossible : ${String(error)} Relance la recherche avant de réessayer.`;
    } else {
      updateStatus.textContent = `Installation impossible : ${String(error)}`;
    }
    updateProgress.hidden = true;
  } finally {
    setAppUpdateBusy(false);
  }
};

const initializeAppUpdates = async (): Promise<void> => {
  if (!appUpdatesSupported()) return;
  appUpdateButton.hidden = false;
  try { updateCurrentVersion.textContent = await getInstalledAppVersion(); }
  catch { updateCurrentVersion.textContent = "Inconnue"; }
  window.setTimeout(() => { void checkApplicationUpdate(false); }, 4_000);
};

type EseAndroidBridge = {
  setImmersive: (enabled: boolean) => void;
  getHotspotCapabilities: () => string;
  startLocalHotspot: (requestId: string) => void;
  stopLocalHotspot: () => void;
  getPreferredIpv4: () => string;
  getHotspotClientCount: () => number;
  cleanupCameraCaptures: () => void;
  downloadAndInstallUpdate: (requestId: string, url: string, sha256: string) => void;
};

const getAndroidBridge = (): EseAndroidBridge | undefined =>
  (window as Window & { ESEAndroid?: EseAndroidBridge }).ESEAndroid;

const cleanupAndroidCameraCaptures = (): void => {
  try { getAndroidBridge()?.cleanupCameraCaptures(); } catch { /* Le dossier temporaire reste privé à ESE. */ }
};

const setSystemFullscreen = async (enabled: boolean): Promise<void> => {
  const androidBridge = getAndroidBridge();
  if (androidBridge) {
    androidBridge.setImmersive(enabled);
    return;
  }

  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(enabled);
    return;
  }

  if (enabled) await document.documentElement.requestFullscreen?.();
  else if (document.fullscreenElement) await document.exitFullscreen();
};

const setViewerFullscreen = async (enabled: boolean): Promise<void> => {
  if (enabled && (editMode.checked || !hasPage())) return;
  viewerFullscreen = enabled;
  appShell.classList.toggle("viewer-fullscreen", enabled);
  viewerFullscreenButton.setAttribute("aria-pressed", String(enabled));
  viewerFullscreenButton.setAttribute(
    "aria-label",
    enabled ? "Quitter le plein écran" : "Afficher le schéma en plein écran"
  );
  viewerFullscreenButton.title = enabled ? "Quitter le plein écran" : "Plein écran";
  fullscreenEnterIcon.toggleAttribute("hidden", enabled);
  fullscreenExitIcon.toggleAttribute("hidden", !enabled);

  try {
    await setSystemFullscreen(enabled);
  } catch (error) {
    if (enabled) {
      viewerFullscreen = false;
      appShell.classList.remove("viewer-fullscreen");
      viewerFullscreenButton.setAttribute("aria-pressed", "false");
      viewerFullscreenButton.setAttribute("aria-label", "Afficher le schéma en plein écran");
      viewerFullscreenButton.title = "Plein écran";
      fullscreenEnterIcon.removeAttribute("hidden");
      fullscreenExitIcon.setAttribute("hidden", "");
    }
    setStatus(`Plein écran impossible : ${String(error)}`);
  }
};

const snapshot = (): string => JSON.stringify(project);

const pushHistory = (): void => {
  undoStack.push(snapshot());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  updateControls();
};

const restoreSnapshot = (value: string): void => {
  const previousPageId = currentPageId;
  project = JSON.parse(value) as EseProject;
  if (!project.pages.some((pageValue) => pageValue.id === currentPageId)) {
    currentPageId = project.pages[0]?.id || "";
  }
  if (selectedCircuitId && !circuit(selectedCircuitId)) selectedCircuitId = null;
  if (selectedTraceId && !trace(selectedCircuitId, selectedTraceId)) selectedTraceId = null;
  markDirty();
  if (!hasPage() || currentPageId !== previousPageId) refreshImage();
  else {
    const activePage = page();
    view = normalizePageView(activePage, activePage.view);
    applyView(false);
  }
  renderAll();
  displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
};

const undo = (): void => {
  if (!undoStack.length || drawing || traceDrag) return;
  redoStack.push(snapshot());
  restoreSnapshot(undoStack.pop()!);
};

const redo = (): void => {
  if (!redoStack.length || drawing || traceDrag) return;
  undoStack.push(snapshot());
  restoreSnapshot(redoStack.pop()!);
};

const dataUrlFromBytes = (bytes: Uint8Array, mime: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  });

const objectUrlFromBytes = (bytes: Uint8Array, mime: string): string =>
  URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));

const refreshImage = (): void => {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null;
  const activePage = project.pages.find((item) => item.id === currentPageId);
  if (!activePage) {
    image.removeAttribute("href");
    image.setAttribute("width", "1");
    image.setAttribute("height", "1");
    canvasHit.setAttribute("width", "1");
    canvasHit.setAttribute("height", "1");
    view = { x: 0, y: 0, width: 1, height: 1 };
    svg.setAttribute("viewBox", "0 0 1 1");
    zoomLabel.textContent = "—";
    coordinates.textContent = "x — · y —";
    emptyProject.hidden = false;
    return;
  }
  const bytes = assets.get(activePage.rendition.archivePath);
  if (!bytes) throw new Error(`Image absente : ${activePage.rendition.archivePath}`);
  imageUrl = objectUrlFromBytes(bytes, activePage.rendition.mime);
  image.setAttribute("href", imageUrl);
  image.setAttribute("width", String(activePage.width));
  image.setAttribute("height", String(activePage.height));
  canvasHit.setAttribute("width", String(activePage.width));
  canvasHit.setAttribute("height", String(activePage.height));
  emptyProject.hidden = true;
  view = normalizePageView(activePage, activePage.view);
  applyView(false);
};

const persistCurrentPageView = (): void => {
  if (!hasPage()) return;
  const activePage = page();
  if (pageViewsEqual(activePage.view, view)) return;
  activePage.view = { ...view };
  markDirty();
};

const applyView = (persist = true): void => {
  if (!hasPage()) return;
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  const ratio = page().width / view.width;
  zoomLabel.textContent = `${Math.round(ratio * 100)} %`;
  if (persist) persistCurrentPageView();
  renderTraceHandles();
};

const fitView = (): void => {
  if (!hasPage()) return;
  view = fitPageView(page());
  applyView();
};

const clampView = (): void => {
  if (!hasPage()) return;
  const activePage = page();
  const marginX = view.width * 0.25;
  const marginY = view.height * 0.25;
  view.x = Math.max(-marginX, Math.min(activePage.width - view.width + marginX, view.x));
  view.y = Math.max(-marginY, Math.min(activePage.height - view.height + marginY, view.y));
};

const zoomAt = (factor: number, center?: Point): void => {
  if (!hasPage()) return;
  const activePage = page();
  const target = center ?? { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const nextWidth = Math.max(activePage.width / 18, Math.min(activePage.width * 1.4, view.width * factor));
  const nextHeight = nextWidth * (view.height / view.width);
  const rx = (target.x - view.x) / view.width;
  const ry = (target.y - view.y) / view.height;
  view = {
    x: target.x - nextWidth * rx,
    y: target.y - nextHeight * ry,
    width: nextWidth,
    height: nextHeight
  };
  clampView();
  applyView();
};

const clientPointToSvg = (clientX: number, clientY: number): Point => {
  const matrix = svg.getScreenCTM();
  if (matrix) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  const rect = svg.getBoundingClientRect();
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.width,
    y: view.y + ((clientY - rect.top) / rect.height) * view.height
  };
};

const clientDeltaToSvg = (deltaX: number, deltaY: number): Point => {
  const matrix = svg.getScreenCTM();
  if (matrix) {
    const inverse = matrix.inverse();
    return {
      x: inverse.a * deltaX + inverse.c * deltaY,
      y: inverse.b * deltaX + inverse.d * deltaY
    };
  }
  return {
    x: (deltaX / svg.clientWidth) * view.width,
    y: (deltaY / svg.clientHeight) * view.height
  };
};

const eventPoint = (event: PointerEvent | WheelEvent | MouseEvent): Point =>
  clientPointToSvg(event.clientX, event.clientY);

const touchPair = (): [Point, Point] | null => {
  const points = [...touchPoints.values()];
  return points.length >= 2 ? [points[0], points[1]] : null;
};

const touchCenter = (first: Point, second: Point): Point => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2
});

const beginTouchGesture = (): void => {
  const pair = touchPair();
  if (!pair) return;
  const center = touchCenter(...pair);
  touchGesture = {
    startCenter: center,
    startDistance: Math.max(1, Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y)),
    anchor: clientPointToSvg(center.x, center.y),
    startView: { ...view }
  };
  dragState = null;
  suppressDiagramClickUntil = performance.now() + 750;
  viewport.classList.add("panning");
  if (drawing) {
    drawing.cursor = null;
    updatePreview();
  }
};

const updateTouchGesture = (): void => {
  const pair = touchPair();
  if (!pair || !touchGesture) return;
  const center = touchCenter(...pair);
  const distance = Math.max(1, Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y));
  const gesture = touchGesture;
  view = { ...gesture.startView };
  zoomAt(Math.pow(gesture.startDistance / distance, 2), gesture.anchor);
  const centerDelta = clientDeltaToSvg(
    center.x - gesture.startCenter.x,
    center.y - gesture.startCenter.y
  );
  view.x -= centerDelta.x;
  view.y -= centerDelta.y;
  clampView();
  applyView();
  suppressDiagramClickUntil = performance.now() + 750;
};

const panViewByClientDelta = (deltaX: number, deltaY: number): void => {
  if (!hasPage()) return;
  const delta = clientDeltaToSvg(deltaX, deltaY);
  view.x += delta.x;
  view.y += delta.y;
  clampView();
  applyView();
};

const rounded = (point: Point): Point => ({ x: Math.round(point.x), y: Math.round(point.y) });

const orthogonal = (from: Point, to: Point): Point =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    ? { x: Math.round(to.x), y: from.y }
    : { x: from.x, y: Math.round(to.y) };

const nearestPointOnSegment = (point: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return a;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + t * dx, y: a.y + t * dy };
};

const nearestPointOnSelectedCircuit = (point: Point): Point => {
  const selected = circuit(selectedCircuitId);
  if (!selected) return rounded(point);
  let best = rounded(point);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const trace of selected.traces.filter((item) => item.pageId === currentPageId)) {
    for (let index = 1; index < trace.points.length; index += 1) {
      const candidate = nearestPointOnSegment(point, trace.points[index - 1], trace.points[index]);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rounded(candidate);
      }
    }
  }
  const threshold = Math.max(8, (view.width / page().width) * 32);
  return bestDistance <= threshold ? best : rounded(point);
};

const makeSvgPath = (className: string, d: string): SVGPathElement => {
  const path = document.createElementNS(ns, "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  return path;
};

const tracePosition = (value: Circuit, traceId: string): string => {
  const pageTraces = value.traces.filter((item) => item.pageId === currentPageId);
  const index = pageTraces.findIndex((item) => item.id === traceId);
  return index >= 0 ? `${index + 1}/${pageTraces.length}` : "—";
};

const displayTraceStatus = (value: Circuit, traceId: string, selected = false): void => {
  const entry = legendEntry(value);
  setStatus(
    `${getCircuitReference(project, value)} · ${entry?.name || value.name} · portion ${tracePosition(value, traceId)}`
    + (selected ? " sélectionnée" : "")
  );
};

const displayCircuitStatus = (value: Circuit | null, locked = false): void => {
  if (!hasPage()) {
    setStatus("Projet vierge. Importe une source pour commencer.");
    return;
  }
  if (!value) {
    setStatus(editMode.checked ? "Sélectionne un circuit ou crée-en un nouveau." : "Survole ou clique sur un circuit.");
    return;
  }
  if (value.id === selectedCircuitId && selectedTraceId) {
    displayTraceStatus(value, selectedTraceId, true);
    return;
  }
  const entry = legendEntry(value);
  setStatus(`${getCircuitReference(project, value)} · ${entry?.name || value.name}${locked ? " · sélection active" : ""}`);
};

const setHoveredCircuit = (id: string | null): void => {
  hoveredCircuitId = id;
  root.querySelectorAll<Element>("[data-circuit-id]").forEach((element) => {
    element.classList.toggle("hovered", element.getAttribute("data-circuit-id") === id);
  });
};

const setHoveredTrace = (id: string | null): void => {
  hoveredTraceId = id;
  wireLayer.querySelectorAll<SVGGElement>("[data-trace-id]").forEach((element) => {
    element.classList.toggle("trace-hovered", element.dataset.traceId === id);
  });
};

const renderTraceHandles = (): void => {
  traceEditLayer.replaceChildren();
  if (!editMode.checked || !portionEditMode || !selectedCircuitId || !selectedTraceId || drawing) return;
  const selected = trace(selectedCircuitId, selectedTraceId);
  if (!selected || selected.pageId !== currentPageId) return;

  const radius = Math.max(5, (view.width / Math.max(1, svg.clientWidth)) * 7);
  selected.points.forEach((point, index) => {
    const handle = document.createElementNS(ns, "circle");
    handle.classList.add("trace-handle");
    handle.setAttribute("cx", String(point.x));
    handle.setAttribute("cy", String(point.y));
    handle.setAttribute("r", String(radius));
    handle.setAttribute("aria-label", `Point ${index + 1} de la portion`);
    handle.addEventListener("pointerdown", (event) => {
      beginTraceDrag(event, "point", index);
    });
    traceEditLayer.append(handle);
  });
};

const setPortionEditMode = (enabled: boolean): void => {
  portionEditMode = enabled && editMode.checked && Boolean(selectedCircuitId) && !drawing;
  if (!portionEditMode) {
    selectedTraceId = null;
    hoveredTraceId = null;
    traceDrag = null;
  }
  editPortionButton.setAttribute("aria-pressed", String(portionEditMode));
  editPortionButton.classList.toggle("active", portionEditMode);
  viewport.classList.toggle("portion-editing", portionEditMode);
  renderCircuits();
  renderTraceHandles();
  updateControls();
  if (portionEditMode) setStatus("Survole puis clique sur une portion. Fais glisser un point ou un segment pour la modifier.");
  else displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
};

const selectTrace = (id: string | null): void => {
  if (!portionEditMode || drawing) return;
  selectedTraceId = id && trace(selectedCircuitId, id)?.pageId === currentPageId ? id : null;
  hoveredTraceId = null;
  renderCircuits();
  renderTraceHandles();
  updateControls();
  const selected = circuit(selectedCircuitId);
  if (selected && selectedTraceId) displayTraceStatus(selected, selectedTraceId, true);
  else if (selected) setStatus("Circuit conservé. Clique sur une portion pour l’éditer.");
};

const selectCircuit = (id: string | null, toggle = false): void => {
  if (drawing) return;
  const nextCircuitId = toggle && selectedCircuitId === id ? null : id;
  if (nextCircuitId !== selectedCircuitId) {
    selectedTraceId = null;
    hoveredTraceId = null;
    traceDrag = null;
  }
  selectedCircuitId = nextCircuitId;
  const selected = circuit(selectedCircuitId);
  if (!selected && portionEditMode) {
    portionEditMode = false;
    editPortionButton.setAttribute("aria-pressed", "false");
    editPortionButton.classList.remove("active");
    viewport.classList.remove("portion-editing", "trace-dragging");
  }
  if (selected) activeLegend.value = selected.legendEntryId;
  displayCircuitStatus(selected, Boolean(selected));
  renderCircuits();
  renderCircuitList();
  updateControls();
  scheduleRecoverySession();
};

const updateTraceGeometryInView = (traceValue: Trace): void => {
  const traceGroup = [...wireLayer.querySelectorAll<SVGGElement>("[data-trace-id]")]
    .find((element) => element.dataset.traceId === traceValue.id);
  if (!traceGroup) return;
  const d = pointsToPath(traceValue.points);
  traceGroup.querySelectorAll<SVGPathElement>("path").forEach((path) => path.setAttribute("d", d));
  renderTraceHandles();
};

const beginTraceDrag = (event: PointerEvent, kind: TraceDrag["kind"], index: number): void => {
  if (event.button !== 0 || drawing || traceDrag || !portionEditMode || !selectedCircuitId || !selectedTraceId) return;
  const selected = trace(selectedCircuitId, selectedTraceId);
  if (!selected) return;
  event.preventDefault();
  event.stopPropagation();
  const startSvg = eventPoint(event);
  traceDrag = {
    circuitId: selectedCircuitId,
    traceId: selectedTraceId,
    pointerId: event.pointerId,
    kind,
    index,
    startClient: { x: event.clientX, y: event.clientY },
    startSvg,
    originalPoints: selected.points.map((point) => ({ ...point })),
    moved: false
  };
  viewport.classList.add("trace-dragging");
  viewport.setPointerCapture(event.pointerId);
  updateControls();
};

const updateTraceDrag = (event: PointerEvent): void => {
  const drag = traceDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const selected = trace(drag.circuitId, drag.traceId);
  if (!selected) return;

  if (!drag.moved) {
    const clientDistance = Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y);
    if (clientDistance <= 2) return;
    pushHistory();
    drag.moved = true;
    markDirty();
  }

  const current = eventPoint(event);
  if (drag.kind === "point") {
    selected.points = moveTracePoint(drag.originalPoints, drag.index, rounded(current));
  } else {
    selected.points = moveTraceSegment(drag.originalPoints, drag.index, {
      x: Math.round(current.x - drag.startSvg.x),
      y: Math.round(current.y - drag.startSvg.y)
    });
  }
  updateTraceGeometryInView(selected);
  displayTraceStatus(circuit(drag.circuitId)!, drag.traceId, true);
};

const finishTraceDrag = (pointerId: number): void => {
  if (!traceDrag || traceDrag.pointerId !== pointerId) return;
  const moved = traceDrag.moved;
  traceDrag = null;
  viewport.classList.remove("trace-dragging");
  if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
  if (moved) {
    markDirty();
    suppressDiagramClickUntil = performance.now() + 300;
    renderCircuits();
  }
  displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
  updateControls();
};

const deleteSelectedTrace = (): void => {
  const selected = circuit(selectedCircuitId);
  if (!selected || !selectedTraceId || drawing || traceDrag) return;
  if (!selected.traces.some((item) => item.id === selectedTraceId)) return;
  pushHistory();
  selected.traces = removeTraceById(selected.traces, selectedTraceId);
  selectedTraceId = null;
  hoveredTraceId = null;
  markDirty();
  renderAll();
  setStatus("Portion supprimée. Le circuit reste sélectionné.");
};

const deleteCurrentPage = (): void => {
  if (!editMode.checked || drawing || traceDrag) return;
  if (project.pages.length <= 1) {
    setStatus("La dernière page du projet ne peut pas être supprimée.");
    return;
  }
  const activePage = page();
  const traceCount = countPageTraces(project, activePage.id);
  const activeSource = project.sources.find((source) => source.id === activePage.sourceId);
  const removesSource = activeSource?.pageIds.length === 1;
  const traceWarning = traceCount
    ? `\n\n${traceCount} portion${traceCount > 1 ? "s" : ""} présente${traceCount > 1 ? "s" : ""} sur cette page ${traceCount > 1 ? "seront" : "sera"} également supprimée${traceCount > 1 ? "s" : ""}. Les circuits logiques seront conservés.`
    : "";
  const sourceWarning = removesSource
    ? `\n\nLa source « ${activeSource?.name || activePage.sourceId} » ne contiendra plus aucune page et sera retirée du projet.`
    : "";
  if (!confirm(`Supprimer « ${activePage.name} » du projet ?${traceWarning}${sourceWarning}`)) return;

  pushHistory();
  const removed = removeProjectPage(project, activePage.id);
  project = removed.project;
  currentPageId = removed.nextPageId;
  selectedTraceId = null;
  hoveredTraceId = null;
  hoveredCircuitId = null;
  drawing = null;
  traceDrag = null;
  viewport.classList.remove("drawing", "trace-dragging");
  refreshImage();
  renderAll();
  markDirty();
  setStatus(
    `Page supprimée${removed.removedTraceCount ? ` avec ${removed.removedTraceCount} portion${removed.removedTraceCount > 1 ? "s" : ""}` : ""}. Les circuits logiques sont conservés.`
  );
};

const activatePage = (pageId: string): void => {
  if (pageId === currentPageId || !project.pages.some((item) => item.id === pageId)) return;
  drawing = null;
  viewport.classList.remove("drawing", "trace-dragging");
  selectedTraceId = null;
  hoveredTraceId = null;
  traceDrag = null;
  currentPageId = pageId;
  refreshImage();
  renderAll();
  displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
  scheduleRecoverySession();
};

const renderPageNavigation = (): void => {
  pageSelect.replaceChildren();
  for (const pageValue of project.pages) {
    const source = project.sources.find((item) => item.id === pageValue.sourceId);
    const option = document.createElement("option");
    option.value = pageValue.id;
    option.textContent = project.sources.length > 1
      ? `${source?.name || "Source"} - ${pageValue.name}`
      : pageValue.name;
    pageSelect.append(option);
  }
  pageSelect.value = currentPageId;
  const index = project.pages.findIndex((item) => item.id === currentPageId);
  previousPageButton.disabled = index <= 0;
  nextPageButton.disabled = index < 0 || index >= project.pages.length - 1;
  pageSelect.disabled = project.pages.length < 2;
};

const renderSources = (): void => {
  sourceList.replaceChildren();
  if (!project.sources.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Aucune source importée.";
    sourceList.append(empty);
    return;
  }
  for (const source of project.sources) {
    const sourceButton = document.createElement("button");
    sourceButton.className = "source-item";
    sourceButton.textContent = source.name;
    sourceList.append(sourceButton);
    for (const pageId of source.pageIds) {
      const pageValue = project.pages.find((item) => item.id === pageId);
      if (!pageValue) continue;
      const pageButton = document.createElement("button");
      pageButton.className = `page-item${pageId === currentPageId ? " active" : ""}`;
      pageButton.textContent = pageValue.name;
      pageButton.addEventListener("click", () => activatePage(pageId));
      sourceList.append(pageButton);
    }
  }
};

const renderLegendSelect = (): void => {
  const previous = activeLegend.value;
  activeLegend.replaceChildren();
  for (const entry of project.legendEntries) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = `${entry.reference} · ${entry.name}`;
    activeLegend.append(option);
  }
  const selected = circuit(selectedCircuitId);
  activeLegend.value = selected?.legendEntryId || previous || project.legendEntries[0]?.id || "";
};

const renderCircuits = (): void => {
  wireLayer.replaceChildren();
  for (const value of project.circuits) {
    const pageTraces = value.traces.filter((item) => item.pageId === currentPageId && item.points.length >= 2);
    if (!pageTraces.length) continue;
    const entry = legendEntry(value);
    const colors = entry?.highlight.colors.length ? entry.highlight.colors : ["#e93478"];
    const group = document.createElementNS(ns, "g");
    group.classList.add("wire-group");
    if (value.id === selectedCircuitId) group.classList.add("selected");
    if (value.id === hoveredCircuitId) group.classList.add("hovered");
    group.dataset.circuitId = value.id;
    group.style.setProperty("--wire-main", colors[0]);
    group.style.setProperty("--wire-second", colors[1] || "transparent");

    for (const traceValue of pageTraces) {
      const d = pointsToPath(traceValue.points);
      const traceGroup = document.createElementNS(ns, "g");
      traceGroup.classList.add("trace-group");
      if (value.id === selectedCircuitId && traceValue.id === selectedTraceId) traceGroup.classList.add("trace-selected");
      if (value.id === selectedCircuitId && traceValue.id === hoveredTraceId) traceGroup.classList.add("trace-hovered");
      traceGroup.dataset.traceId = traceValue.id;
      if (portionEditMode && selectedCircuitId === value.id) {
        traceGroup.setAttribute("tabindex", "0");
        traceGroup.setAttribute("role", "button");
        traceGroup.setAttribute(
          "aria-label",
          `Portion ${tracePosition(value, traceValue.id)} du circuit ${getCircuitReference(project, value)}`
        );
        const xs = traceValue.points.map((point) => point.x);
        const ys = traceValue.points.map((point) => point.y);
        const focusTarget = document.createElementNS(ns, "rect");
        focusTarget.classList.add("trace-focus-target");
        focusTarget.setAttribute("x", String(Math.min(...xs) - 1));
        focusTarget.setAttribute("y", String(Math.min(...ys) - 1));
        focusTarget.setAttribute("width", String(Math.max(2, Math.max(...xs) - Math.min(...xs) + 2)));
        focusTarget.setAttribute("height", String(Math.max(2, Math.max(...ys) - Math.min(...ys) + 2)));
        traceGroup.append(focusTarget);
      }
      traceGroup.append(makeSvgPath("wire-outline", d));
      traceGroup.append(makeSvgPath("wire-main", d));
      if (colors[1]) traceGroup.append(makeSvgPath("wire-stripe", d));
      const hit = makeSvgPath("wire-hit", d);
      traceGroup.append(hit);

      traceGroup.addEventListener("pointerenter", () => {
        if (drawing || traceDrag) return;
        if (portionEditMode && selectedCircuitId === value.id) {
          setHoveredTrace(traceValue.id);
          displayTraceStatus(value, traceValue.id, traceValue.id === selectedTraceId);
        } else {
          setHoveredCircuit(value.id);
          displayCircuitStatus(value, selectedCircuitId === value.id);
        }
      });
      traceGroup.addEventListener("pointerleave", () => {
        if (drawing || traceDrag) return;
        if (portionEditMode && selectedCircuitId === value.id) setHoveredTrace(null);
        else setHoveredCircuit(null);
        displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
      });
      hit.addEventListener("pointerdown", (event) => {
        if (!portionEditMode || selectedCircuitId !== value.id || selectedTraceId !== traceValue.id) return;
        const segmentIndex = nearestTraceSegmentIndex(traceValue.points, eventPoint(event));
        if (segmentIndex >= 0) beginTraceDrag(event, "segment", segmentIndex);
      });
      traceGroup.addEventListener("click", (event) => {
        if (drawing || performance.now() < suppressDiagramClickUntil) return;
        event.stopPropagation();
        if (portionEditMode) {
          if (selectedCircuitId === value.id) selectTrace(traceValue.id);
          else selectCircuit(value.id);
        } else {
          selectCircuit(value.id, true);
        }
      });
      traceGroup.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (portionEditMode && selectedCircuitId === value.id) selectTrace(traceValue.id);
        else selectCircuit(value.id, true);
      });
      group.append(traceGroup);
    }
    wireLayer.append(group);
  }
  renderTraceHandles();
};

const renderCircuitList = (): void => {
  const query = circuitSearch.value.trim().toLocaleLowerCase();
  const values = project.circuits.filter((value) => {
    const entry = legendEntry(value);
    return !query || `${getCircuitReference(project, value)} ${value.name} ${entry?.name || ""}`.toLocaleLowerCase().includes(query);
  });
  circuitSummary.textContent = `${project.circuits.length} circuit${project.circuits.length > 1 ? "s" : ""} · ${project.legendEntries.length} repères`;
  circuitList.replaceChildren();
  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Aucun circuit correspondant.";
    circuitList.append(empty);
    return;
  }

  for (const value of values) {
    const entry = legendEntry(value);
    const colors = entry?.highlight.colors.length ? entry.highlight.colors : ["#777"];
    const row = document.createElement("button");
    row.className = "circuit-row";
    row.dataset.circuitId = value.id;
    if (value.id === selectedCircuitId) row.classList.add("selected");
    if (value.id === hoveredCircuitId) row.classList.add("hovered");
    row.innerHTML = `
      <span class="swatch${colors[1] ? " two" : ""}"></span>
      <span class="circuit-reference"></span>
      <span class="circuit-name"></span>
      <span class="circuit-count"></span>`;
    row.style.setProperty("--swatch-main", colors[0]);
    row.style.setProperty("--swatch-second", colors[1] || colors[0]);
    row.querySelector<HTMLElement>(".circuit-reference")!.textContent = getCircuitReference(project, value);
    row.querySelector<HTMLElement>(".circuit-name")!.textContent = value.name;
    row.querySelector<HTMLElement>(".circuit-count")!.textContent = String(value.traces.length);
    row.addEventListener("pointerenter", () => {
      setHoveredCircuit(value.id);
      displayCircuitStatus(value, selectedCircuitId === value.id);
    });
    row.addEventListener("pointerleave", () => {
      setHoveredCircuit(null);
      displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
    });
    row.addEventListener("click", () => selectCircuit(value.id, true));
    row.addEventListener("dblclick", (event) => {
      if (!editMode.checked) return;
      event.preventDefault();
      const next = prompt("Nom du circuit", value.name);
      if (next === null || !next.trim() || next.trim() === value.name) return;
      pushHistory();
      value.name = next.trim();
      markDirty();
      renderCircuitList();
    });
    circuitList.append(row);
  }
};

const updatePreview = (): void => {
  if (!drawing) {
    for (const path of [previewOutline, previewMain, previewStripe]) path.setAttribute("d", "");
    previewNode.setAttribute("visibility", "hidden");
    return;
  }
  const value = circuit(drawing.circuitId);
  const entry = legendEntry(value);
  const colors = entry?.highlight.colors.length ? entry.highlight.colors : ["#e93478"];
  const points = drawing.points.slice();
  if (drawing.cursor && points.length) points.push(orthogonal(points.at(-1)!, drawing.cursor));
  const d = pointsToPath(points);
  for (const path of [previewOutline, previewMain, previewStripe]) path.setAttribute("d", d);
  previewMain.style.setProperty("--preview-main", colors[0]);
  previewStripe.style.setProperty("--preview-second", colors[1] || "transparent");
  previewStripe.style.opacity = colors[1] ? "1" : "0";
  previewNode.style.setProperty("--preview-main", colors[0]);
  if (drawing.points.length) {
    previewNode.setAttribute("cx", String(drawing.points[0].x));
    previewNode.setAttribute("cy", String(drawing.points[0].y));
    previewNode.setAttribute("visibility", "visible");
  }
};

const beginDrawing = (): void => {
  const selected = circuit(selectedCircuitId);
  if (!editMode.checked || !hasPage() || !selected || drawing) return;
  if (portionEditMode) setPortionEditMode(false);
  drawing = { circuitId: selected.id, points: [], cursor: null };
  viewport.classList.add("drawing");
  setStatus("Clique pour poser les angles. Entrée termine ; le double-clic termine et enchaîne un nouveau tracé.");
  updatePreview();
  updateControls();
};

const cancelDrawing = (): void => {
  drawing = null;
  viewport.classList.remove("drawing");
  updatePreview();
  displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
  updateControls();
};

const finishDrawing = (continueOnSameCircuit = false): void => {
  if (!hasPage() || !drawing || drawing.points.length < 2) return;
  const selected = circuit(drawing.circuitId);
  if (!selected) return cancelDrawing();
  pushHistory();
  selected.traces.push({ id: makeId("trace"), pageId: currentPageId, points: drawing.points });
  drawing = null;
  viewport.classList.remove("drawing");
  markDirty();
  updatePreview();
  renderCircuits();
  renderCircuitList();
  if (continueOnSameCircuit) beginDrawing();
  else {
    displayCircuitStatus(selected, true);
    updateControls();
  }
};

const updateControls = (): void => {
  const selected = circuit(selectedCircuitId);
  const hasSelection = Boolean(selected);
  const pageAvailable = hasPage();
  const busy = Boolean(drawing || traceDrag);
  importSourceButton.disabled = !editMode.checked || busy;
  captureSourceButton.disabled = !editMode.checked || busy;
  emptyImportSourceButton.disabled = busy;
  emptyCaptureSourceButton.disabled = busy;
  importSourceButton.title = editMode.checked
    ? "Importer une image, des pages PDF, un HTML ESE ou des annotations JSON."
    : "Active le mode édition pour importer une source.";
  captureSourceButton.title = editMode.checked
    ? "Photographier un schéma avec la caméra de cet appareil."
    : "Active le mode édition pour photographier un schéma.";
  openOcrButton.disabled = !editMode.checked || !pageAvailable || busy || ocrBusy;
  openOcrButton.title = !pageAvailable
    ? "Importe d’abord une source à reconnaître."
    : editMode.checked
    ? "Reconnaître localement les repères d’une légende."
    : "Active le mode édition pour reconnaître des repères.";
  addTraceButton.disabled = !pageAvailable || !hasSelection || busy;
  editPortionButton.disabled = !pageAvailable || !hasSelection || busy;
  newCircuitButton.disabled = !pageAvailable || busy;
  finishButton.disabled = !drawing || drawing.points.length < 2;
  cancelButton.disabled = !drawing;
  undoButton.disabled = !undoStack.length || busy;
  redoButton.disabled = !redoStack.length || busy;
  removeTraceButton.disabled = !selectedTraceId || busy;
  deleteCircuitButton.disabled = !hasSelection || busy;
  deletePageButton.disabled = !editMode.checked || project.pages.length <= 1 || busy;
  deletePageButton.title = !pageAvailable
    ? "Importe d’abord une source."
    : project.pages.length <= 1
    ? "La dernière page du projet ne peut pas être supprimée."
    : "Supprimer la page active du projet.";
  zoomOutButton.disabled = !pageAvailable;
  zoomInButton.disabled = !pageAvailable;
  fitViewButton.disabled = !pageAvailable;
  viewerFullscreenButton.disabled = !pageAvailable;
  viewerFullscreenButton.hidden = editMode.checked;
  exportHtmlButton.disabled = !pageAvailable;
  exportHtmlButton.title = pageAvailable
    ? "Exporter le projet en HTML autonome."
    : "Importe d’abord une source à exporter.";
  shareHtmlButton.disabled = !pageAvailable;
  shareHtmlButton.title = pageAvailable
    ? "Partager l’export HTML courant par QR Code sur le réseau local."
    : "Importe d’abord une source à partager.";
  activeLegend.disabled = !hasSelection || busy;
};

const renderAll = (): void => {
  titleNode.textContent = project.title;
  renderPageNavigation();
  renderSources();
  renderLegendSelect();
  renderCircuits();
  renderCircuitList();
  updatePreview();
  updateControls();
};

const loadProject = (
  nextProject: EseProject,
  nextAssets: ProjectAssets,
  path: string | null,
  initialPageId = nextProject.pages[0]?.id || ""
): void => {
  project = mergeCircuitsByReference(nextProject);
  assets = nextAssets;
  currentPageId = project.pages.some((pageValue) => pageValue.id === initialPageId)
    ? initialPageId
    : project.pages[0]?.id || "";
  currentPath = path;
  selectedCircuitId = null;
  hoveredCircuitId = null;
  portionEditMode = false;
  selectedTraceId = null;
  hoveredTraceId = null;
  traceDrag = null;
  editPortionButton.setAttribute("aria-pressed", "false");
  editPortionButton.classList.remove("active");
  viewport.classList.remove("portion-editing", "trace-dragging");
  drawing = null;
  undoStack.length = 0;
  redoStack.length = 0;
  circuitSearch.value = "";
  refreshImage();
  renderAll();
  markSaved();
  setStatus("Projet chargé. Survole ou clique sur un circuit.");
};

const initializeApplication = async (): Promise<void> => {
  let recoveryError: unknown = null;
  try {
    const recovery = await loadRecoverySession();
    if (recovery) {
      const opened = openEseArchive(recovery.archiveBytes);
      loadProject(opened.project, opened.assets, recovery.currentPath, recovery.currentPageId);
      editMode.checked = recovery.editMode;
      editTools.hidden = !recovery.editMode;
      selectedCircuitId = recovery.selectedCircuitId && circuit(recovery.selectedCircuitId)
        ? recovery.selectedCircuitId
        : null;
      dirty = recovery.dirty;
      if (dirty) {
        saveState.innerHTML = '<span class="dirty-dot">●</span> Session récupérée · modifications non enregistrées';
      }
      renderAll();
      recoveryReady = true;
      scheduleRecoverySession(0);
      setStatus(dirty
        ? "Session récupérée, y compris les modifications non enregistrées."
        : "Dernière session rouverte automatiquement.");
      return;
    }
  } catch (error) {
    recoveryError = error;
    try { await clearRecoverySession(); } catch { /* Une nouvelle copie remplacera la session illisible. */ }
  }

  loadProject(createBlankProject(), new Map(), null);
  editMode.checked = true;
  editTools.hidden = false;
  renderAll();
  saveState.textContent = "Nouveau projet";
  recoveryReady = true;
  scheduleRecoverySession(0);
  setStatus(recoveryError
    ? "L’ancienne session était illisible et a été remplacée par un projet vierge."
    : "Projet vierge créé. Importe une source pour commencer.");
};

const looksLikeHtml = (bytes: Uint8Array, name: string): boolean =>
  /\.html?$/i.test(name) || /^\s*<!doctype\s+html|^\s*<html\b/i.test(new TextDecoder().decode(bytes.subarray(0, 256)));

const openProjectDocument = (bytes: Uint8Array, path: string | null, name: string): void => {
  if (looksLikeHtml(bytes, name)) {
    const opened = openEseHtmlBytes(bytes);
    loadProject(opened.project, opened.assets, null, opened.initialPageId);
    saveState.textContent = "HTML ouvert · à enregistrer en .ese";
    setStatus("Export HTML ESE ouvert. « Enregistrer » créera toujours un projet .ese.");
    return;
  }
  const opened = openEseArchive(bytes);
  loadProject(opened.project, opened.assets, path);
};

const openProject = async (): Promise<void> => {
  try {
    if (isTauri()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Projet ESE ou export HTML ESE", extensions: ["ese", "html", "htm"] }]
      });
      if (!selected || Array.isArray(selected)) return;
      const bytes = await invoke<number[]>("read_binary", { path: selected });
      openProjectDocument(Uint8Array.from(bytes), selected, selected);
    } else {
      projectFile.click();
    }
  } catch (error) {
    setStatus(`Ouverture impossible : ${String(error)}`);
  }
};

const safeFilename = (value: string): string =>
  value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "projet";

const ensureEsePath = (value: string): string => /\.ese$/i.test(value) ? value : `${value}.ese`;
const isContentUri = (value: string): boolean => /^content:\/\//i.test(value);

const saveProject = async (forceDialog = false): Promise<boolean> => {
  try {
    project.modifiedAt = new Date().toISOString();
    const bytes = createEseArchive(project, assets);
    if (isTauri()) {
      let path = forceDialog || (currentPath && !isContentUri(currentPath) && !/\.ese$/i.test(currentPath)) ? null : currentPath;
      if (!path) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        path = await save({
          defaultPath: `${safeFilename(project.title)}.ese`,
          filters: [{ name: "Projet ESE", extensions: ["ese"] }]
        });
      }
      if (!path) return false;
      if (!isContentUri(path)) path = ensureEsePath(path);
      await invoke("atomic_write", { path, bytes: Array.from(bytes) });
      currentPath = path;
    } else {
      downloadBytes(`${safeFilename(project.title)}.ese`, bytes, "application/vnd.ese.project+zip");
    }
    markSaved();
    setStatus("Projet ESE enregistré.");
    return true;
  } catch (error) {
    setStatus(`Enregistrement impossible : ${String(error)}`);
    return false;
  }
};

const prepareProjectReplacement = async (): Promise<boolean> => {
  if (!dirty) return true;
  newProjectCopy.textContent = `« ${project.title} » contient des modifications non enregistrées.`;
  newProjectDialog.returnValue = "cancel";
  newProjectDialog.showModal();
  const choice = await new Promise<ProjectReplacementChoice>((resolve) => {
    newProjectDialog.addEventListener("close", () => {
      const value = newProjectDialog.returnValue;
      resolve(value === "save" || value === "discard" ? value : "cancel");
    }, { once: true });
  });
  if (choice === "cancel") return false;
  if (choice === "save") return saveProject(false);
  return true;
};

const newProject = async (): Promise<void> => {
  if (!await prepareProjectReplacement()) return;
  editMode.checked = true;
  editTools.hidden = false;
  loadProject(createBlankProject(), new Map(), null);
  saveState.textContent = "Nouveau projet";
  setStatus("Projet vierge créé. Importe une source pour commencer.");
};

const loadImageDimensions = (bytes: Uint8Array, mime: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const url = objectUrlFromBytes(bytes, mime);
    const probe = new Image();
    probe.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    probe.src = url;
  });

const importImage = async (file: File, destination: ImportDestination): Promise<void> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = await loadImageDimensions(bytes, file.type || "image/png");
  const sourceId = makeId("source");
  const pageId = makeId("page");
  const archivePath = `sources/${sourceId}/${safeFilename(file.name)}`;
  const nextProject = createBlankProject(file.name.replace(/\.[^.]+$/, ""));
  nextProject.sources.push({
    id: sourceId,
    name: file.name,
    originalName: file.name,
    mime: file.type || "image/png",
    originalPath: archivePath,
    pageIds: [pageId]
  });
  nextProject.pages.push({
    id: pageId,
    sourceId,
    name: "Page 1",
    width: dimensions.width,
    height: dimensions.height,
    rendition: { kind: "image", mime: file.type || "image/png", archivePath }
  });
  if (destination === "new") {
    loadProject(nextProject, new Map([[archivePath, bytes]]), null);
  } else {
    pushHistory();
    project.sources.push(...nextProject.sources);
    project.pages.push(...nextProject.pages);
    assets.set(archivePath, bytes);
    currentPageId = pageId;
    selectedTraceId = null;
    hoveredTraceId = null;
    drawing = null;
    refreshImage();
    renderAll();
  }
  markDirty();
  setStatus("Image importée. Ouvre « Repères… » ou crée un circuit.");
};

const importHtmlProject = async (file: File, destination: ImportDestination): Promise<void> => {
  const opened = openEseHtmlBytes(new Uint8Array(await file.arrayBuffer()));
  if (destination === "new" || isBlankProject()) {
    loadProject(opened.project, opened.assets, null, opened.initialPageId);
    markDirty();
    setStatus(`HTML ESE importé : ${opened.project.pages.length} page${opened.project.pages.length > 1 ? "s" : ""} et ${opened.project.circuits.length} circuit${opened.project.circuits.length > 1 ? "s" : ""}.`);
    return;
  }

  pushHistory();
  const merged = mergeImportedProject(project, assets, opened.project, opened.assets);
  project = mergeCircuitsByReference(merged.project);
  assets = merged.assets;
  currentPageId = merged.importedPageIds[0] || currentPageId;
  selectedCircuitId = null;
  selectedTraceId = null;
  hoveredTraceId = null;
  drawing = null;
  refreshImage();
  renderAll();
  markDirty();
  setStatus(`HTML ajouté : ${merged.importedPageIds.length} page${merged.importedPageIds.length > 1 ? "s" : ""} et ${merged.importedCircuitCount} circuit${merged.importedCircuitCount > 1 ? "s" : ""} importé${merged.importedCircuitCount > 1 ? "s" : ""}.`);
};

const importJsonAnnotations = async (file: File): Promise<void> => {
  const result = importAnnotationsJson(project, currentPageId, await file.text());
  pushHistory();
  project = mergeCircuitsByReference(result.project);
  selectedCircuitId = null;
  selectedTraceId = null;
  hoveredTraceId = null;
  drawing = null;
  renderAll();
  markDirty();
  setStatus(
    `JSON ${result.legacy ? "historique " : ""}importé : ${result.importedCircuitCount} circuit${result.importedCircuitCount > 1 ? "s" : ""}, ${result.importedTraceCount} tracé${result.importedTraceCount > 1 ? "s" : ""}, ${result.mappedPageCount} page${result.mappedPageCount > 1 ? "s" : ""} associée${result.mappedPageCount > 1 ? "s" : ""}.`
  );
};

const chooseImportDestination = async (file: File): Promise<ImportDestination | null> => {
  if (isBlankProject()) return "add";
  sourceDestinationName.textContent = file.name;
  sourceDestinationCopy.textContent = `Le projet actuel est « ${project.title} ».`;
  sourceDestinationWarning.textContent = dirty
    ? "Il contient des modifications non enregistrées. ESE te proposera de les enregistrer avant de créer un nouveau projet."
    : "L'ajout au projet actuel conserve toutes ses pages, ses repères et ses circuits.";
  sourceDestinationDialog.returnValue = "cancel";
  sourceDestinationDialog.showModal();
  const value = await new Promise<string>((resolve) => {
    sourceDestinationDialog.addEventListener("close", () => resolve(sourceDestinationDialog.returnValue), { once: true });
  });
  if (value !== "add" && value !== "new") return null;
  if (value === "new" && !await prepareProjectReplacement()) return null;
  return value;
};

const finishPdfSourceImport = (
  destination: ImportDestination,
  source: EseProject["sources"][number],
  importedPages: ProjectPage[],
  importedAssets: ProjectAssets,
  newProjectTitle: string
): void => {
  if (destination === "new") {
    const nextProject = createBlankProject(newProjectTitle);
    nextProject.sources.push(source);
    nextProject.pages.push(...importedPages);
    loadProject(nextProject, importedAssets, null);
  } else {
    pushHistory();
    project.sources.push(source);
    project.pages.push(...importedPages);
    for (const [path, bytes] of importedAssets) assets.set(path, bytes);
    currentPageId = importedPages[0].id;
    selectedTraceId = null;
    hoveredTraceId = null;
    drawing = null;
    refreshImage();
    renderAll();
  }
  markDirty();
};

const updatePdfSelection = (scrollToSelection = false): void => {
  const pending = pendingPdfImport;
  if (!pending) return;
  try {
    selectedPdfPages = new Set(parsePageSelection(pdfPageSelection.value, pending.document.numPages));
    pdfPageSelection.setCustomValidity("");
    pdfThumbnailGrid.querySelectorAll<HTMLButtonElement>(".pdf-thumbnail").forEach((button) => {
      const selected = selectedPdfPages.has(Number(button.dataset.pageNumber));
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    confirmPdfImport.disabled = pdfImportBusy || !selectedPdfPages.size;
    pdfImportStatus.textContent = selectedPdfPages.size
      ? `${selectedPdfPages.size} page${selectedPdfPages.size > 1 ? "s" : ""} sélectionnée${selectedPdfPages.size > 1 ? "s" : ""}.`
      : "Sélectionne au moins une page.";
    if (scrollToSelection && selectedPdfPages.size) {
      const first = Math.min(...selectedPdfPages);
      pdfThumbnailGrid.querySelector<HTMLElement>(`[data-page-number="${first}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  } catch (error) {
    pdfPageSelection.setCustomValidity(String(error));
    confirmPdfImport.disabled = true;
    pdfImportStatus.textContent = String(error);
  }
};

const setPdfSelection = (pages: Iterable<number>, scroll = false): void => {
  pdfPageSelection.value = formatPageSelection(pages);
  updatePdfSelection(scroll);
};

const buildPdfThumbnails = (pdfDocument: PdfDocument): void => {
  pdfThumbnailObserver?.disconnect();
  pdfThumbnailGrid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pdf-thumbnail";
    button.dataset.pageNumber = String(pageNumber);
    button.setAttribute("aria-pressed", "false");
    const canvas = document.createElement("canvas");
    const label = document.createElement("span");
    label.textContent = `Page ${pageNumber}`;
    button.append(canvas, label);
    button.addEventListener("click", () => {
      if (selectedPdfPages.has(pageNumber)) selectedPdfPages.delete(pageNumber);
      else selectedPdfPages.add(pageNumber);
      setPdfSelection(selectedPdfPages);
    });
    fragment.append(button);
  }
  pdfThumbnailGrid.append(fragment);

  pdfThumbnailObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const button = entry.target as HTMLButtonElement;
      const pageNumber = Number(button.dataset.pageNumber);
      const canvas = button.querySelector("canvas")!;
      void renderPdfThumbnail(pdfDocument, pageNumber, canvas).then(() => {
        button.classList.add("rendered");
      }).catch(() => {
        button.classList.add("thumbnail-error");
      });
    }
  }, { root: pdfDialogBody, rootMargin: "240px" });
  pdfThumbnailGrid.querySelectorAll(".pdf-thumbnail").forEach((button) => pdfThumbnailObserver!.observe(button));
};

const disposePdfImport = (): void => {
  pdfThumbnailObserver?.disconnect();
  pdfThumbnailObserver = null;
  const pending = pendingPdfImport;
  pendingPdfImport = null;
  selectedPdfPages.clear();
  pdfThumbnailGrid.replaceChildren();
  pdfImportBusy = false;
  if (pdfImportDialog.open) pdfImportDialog.close();
  if (pending) void pending.document.destroy();
};

const openPdfImport = async (file: File, destination: ImportDestination): Promise<void> => {
  setStatus(`Lecture du PDF : ${file.name}…`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfDocument = await openPdfDocument(bytes);
  pendingPdfImport = { file, document: pdfDocument, destination };
  pdfDocumentSummary.textContent = `${file.name} · ${pdfDocument.numPages} pages physiques`;
  buildPdfThumbnails(pdfDocument);
  setPdfSelection([]);
  pdfImportDialog.showModal();
  setStatus("PDF ouvert. Choisis une ou plusieurs pages physiques.");
};

const confirmPdfPages = async (): Promise<void> => {
  const pending = pendingPdfImport;
  if (!pending || pdfImportBusy) return;
  updatePdfSelection();
  const pageNumbers = [...selectedPdfPages].sort((a, b) => a - b);
  if (!pageNumbers.length) return;

  pdfImportBusy = true;
  confirmPdfImport.disabled = true;
  byId<HTMLButtonElement>("cancel-pdf-import").disabled = true;
  byId<HTMLButtonElement>("close-pdf-import").disabled = true;
  const sourceId = makeId("source");
  const importedAssets: ProjectAssets = new Map();
  const importedPages: ProjectPage[] = [];

  try {
    for (let index = 0; index < pageNumbers.length; index += 1) {
      const pageNumber = pageNumbers[index];
      pdfImportStatus.textContent = `Conversion de la page physique ${pageNumber} (${index + 1}/${pageNumbers.length})…`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const rendered = await renderPdfPageToPng(pending.document, pageNumber);
      const pageId = makeId("page");
      const archivePath = `renditions/${sourceId}/page-${String(pageNumber).padStart(4, "0")}.png`;
      importedAssets.set(archivePath, rendered.bytes);
      importedPages.push({
        id: pageId,
        sourceId,
        name: `Page PDF ${pageNumber}`,
        sourcePageNumber: pageNumber,
        width: rendered.width,
        height: rendered.height,
        rendition: { kind: "image", mime: "image/png", archivePath }
      });
    }

    const source = {
      id: sourceId,
      name: pending.file.name,
      originalName: pending.file.name,
      mime: "application/pdf",
      pageIds: importedPages.map((pageValue) => pageValue.id)
    };
    finishPdfSourceImport(
      pending.destination,
      source,
      importedPages,
      importedAssets,
      pending.file.name.replace(/\.[^.]+$/, "")
    );
    const summary = formatPageSelection(pageNumbers);
    disposePdfImport();
    setStatus(`PDF ajouté : page${pageNumbers.length > 1 ? "s" : ""} physique${pageNumbers.length > 1 ? "s" : ""} ${summary}.`);
  } catch (error) {
    pdfImportBusy = false;
    confirmPdfImport.disabled = false;
    byId<HTMLButtonElement>("cancel-pdf-import").disabled = false;
    byId<HTMLButtonElement>("close-pdf-import").disabled = false;
    pdfImportStatus.textContent = `Import impossible : ${String(error)}`;
  }
};

const importSource = async (file: File): Promise<void> => {
  if (!editMode.checked) {
    setStatus("Active le mode édition pour importer une source.");
    return;
  }
  if (file.type === "application/json" || /\.json$/i.test(file.name)) {
    await importJsonAnnotations(file);
    return;
  }
  const destination = await chooseImportDestination(file);
  if (!destination) return;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) await openPdfImport(file, destination);
  else if (file.type === "text/html" || /\.html?$/i.test(file.name)) await importHtmlProject(file, destination);
  else await importImage(file, destination);
};

const cameraPhotoFilename = (): string => {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `photo-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.jpg`;
};

const stopCameraStream = (): void => {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
};

const clearCameraCapture = (): void => {
  cameraCaptureBlob = null;
  if (cameraCaptureUrl) URL.revokeObjectURL(cameraCaptureUrl);
  cameraCaptureUrl = null;
  cameraPreview.removeAttribute("src");
  cameraPreview.hidden = true;
};

const cameraErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Accès à la caméra refusé. Autorise ESE dans les réglages du système, puis réessaie.";
    if (error.name === "NotFoundError") return "Aucune caméra utilisable n’a été trouvée.";
    if (error.name === "NotReadableError") return "La caméra est déjà utilisée par une autre application ou indisponible.";
    if (error.name === "OverconstrainedError") return "La caméra ne prend pas en charge le mode demandé.";
  }
  return `Ouverture de la caméra impossible : ${String(error)}`;
};

const refreshCameraDevices = async (): Promise<void> => {
  cameraDevices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  const activeDeviceId = cameraStream?.getVideoTracks()[0]?.getSettings().deviceId || "";
  cameraDevice.replaceChildren();
  if (!cameraDevices.length) {
    cameraDevice.add(new Option("Caméra par défaut", ""));
  } else {
    cameraDevices.forEach((device, index) => {
      cameraDevice.add(new Option(device.label || `Caméra ${index + 1}`, device.deviceId));
    });
    if (cameraDevices.some((device) => device.deviceId === activeDeviceId)) cameraDevice.value = activeDeviceId;
  }
  cameraDevice.disabled = cameraDevices.length <= 1;
  switchCameraButton.disabled = cameraOpening || cameraDevices.length <= 1;
};

const waitForCameraVideo = (): Promise<void> => {
  if (cameraVideo.readyState >= HTMLMediaElement.HAVE_METADATA && cameraVideo.videoWidth && cameraVideo.videoHeight) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("La caméra n’a fourni aucune image."));
    }, 10_000);
    const loaded = (): void => {
      cleanup();
      resolve();
    };
    const failed = (): void => {
      cleanup();
      reject(new Error("Le flux vidéo de la caméra est illisible."));
    };
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      cameraVideo.removeEventListener("loadedmetadata", loaded);
      cameraVideo.removeEventListener("error", failed);
    };
    cameraVideo.addEventListener("loadedmetadata", loaded, { once: true });
    cameraVideo.addEventListener("error", failed, { once: true });
  });
};

const startCameraStream = async (deviceId = ""): Promise<void> => {
  if (cameraOpening) return;
  const requestGeneration = ++cameraRequestGeneration;
  cameraOpening = true;
  takePhotoButton.disabled = true;
  switchCameraButton.disabled = true;
  cameraStatus.textContent = "Ouverture de la caméra…";
  cameraPlaceholder.textContent = "Ouverture de la caméra…";
  cameraPlaceholder.hidden = false;
  cameraVideo.hidden = true;
  clearCameraCapture();
  retakePhotoButton.hidden = true;
  importPhotoButton.hidden = true;
  takePhotoButton.hidden = false;
  stopCameraStream();

  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("La capture vidéo n’est pas disponible sur cette plateforme.");
    const video: MediaTrackConstraints = {
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: cameraFacingMode } })
    };
    let nextStream: MediaStream;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      if (!deviceId) throw error;
      nextStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 3840 }, height: { ideal: 2160 }, facingMode: { ideal: cameraFacingMode } },
        audio: false
      });
    }
    if (requestGeneration !== cameraRequestGeneration || !cameraDialog.open) {
      nextStream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream = nextStream;
    cameraVideo.srcObject = cameraStream;
    cameraVideo.hidden = false;
    await cameraVideo.play();
    await waitForCameraVideo();
    cameraPlaceholder.hidden = true;
    await refreshCameraDevices();
    takePhotoButton.disabled = false;
    const width = cameraVideo.videoWidth;
    const height = cameraVideo.videoHeight;
    cameraStatus.textContent = `Caméra prête · ${width} × ${height} pixels. Cadre le schéma puis photographie.`;
  } catch (error) {
    if (requestGeneration !== cameraRequestGeneration) return;
    stopCameraStream();
    cameraPlaceholder.textContent = "Caméra indisponible";
    cameraStatus.textContent = cameraErrorMessage(error);
  } finally {
    if (requestGeneration !== cameraRequestGeneration) return;
    cameraOpening = false;
    switchCameraButton.disabled = cameraDevices.length <= 1;
  }
};

const closeCameraDialog = (): void => {
  cameraRequestGeneration += 1;
  cameraOpening = false;
  stopCameraStream();
  clearCameraCapture();
  cameraDevices = [];
  cameraDevice.replaceChildren();
  if (cameraDialog.open) cameraDialog.close();
};

const openCameraCapture = async (): Promise<void> => {
  if (!editMode.checked) {
    setStatus("Active le mode édition pour photographier un schéma.");
    return;
  }
  if (getAndroidBridge()) {
    cameraFile.value = "";
    setStatus("Ouverture de l’appareil photo…");
    cameraFile.click();
    return;
  }
  if (!cameraDialog.open) cameraDialog.showModal();
  await startCameraStream();
};

const captureCameraFrame = async (): Promise<void> => {
  if (!cameraStream || !cameraVideo.videoWidth || !cameraVideo.videoHeight) return;
  takePhotoButton.disabled = true;
  const canvas = document.createElement("canvas");
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Capture d’image indisponible.");
  context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("La photo n’a pas pu être encodée.")), "image/jpeg", 0.94);
  });
  clearCameraCapture();
  cameraCaptureBlob = blob;
  cameraCaptureUrl = URL.createObjectURL(blob);
  cameraPreview.src = cameraCaptureUrl;
  cameraPreview.hidden = false;
  cameraVideo.hidden = true;
  cameraPlaceholder.hidden = true;
  stopCameraStream();
  takePhotoButton.hidden = true;
  retakePhotoButton.hidden = false;
  importPhotoButton.hidden = false;
  cameraStatus.textContent = `${canvas.width} × ${canvas.height} pixels · vérifie la netteté avant l’import.`;
};

const importCameraCapture = async (): Promise<void> => {
  const blob = cameraCaptureBlob;
  if (!blob) return;
  const photo = new File([blob], cameraPhotoFilename(), { type: "image/jpeg", lastModified: Date.now() });
  closeCameraDialog();
  await importSource(photo);
};

const switchCamera = (): void => {
  if (cameraOpening) return;
  if (cameraDevices.length > 1) {
    const currentIndex = Math.max(0, cameraDevices.findIndex((device) => device.deviceId === cameraDevice.value));
    const next = cameraDevices[(currentIndex + 1) % cameraDevices.length];
    void startCameraStream(next.deviceId);
    return;
  }
  cameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
  void startCameraStream();
};

const renderOcrSelection = (): void => {
  ocrSelectionNode.hidden = ocrSelectionMode === "none";
  const width = Math.max(1, ocrCanvas.width);
  const height = Math.max(1, ocrCanvas.height);
  ocrSelectionNode.style.left = `${ocrSelection.x / width * 100}%`;
  ocrSelectionNode.style.top = `${ocrSelection.y / height * 100}%`;
  ocrSelectionNode.style.width = `${ocrSelection.width / width * 100}%`;
  ocrSelectionNode.style.height = `${ocrSelection.height / height * 100}%`;
  runOcrButton.textContent = ocrSelectionMode === "full" ? "Reconnaître la page" : "Reconnaître la zone";
  runOcrButton.disabled = ocrBusy || ocrSelectionMode === "none";
};

const clearOcrSelection = (): void => {
  ocrSelectionMode = "none";
  ocrSelection = { x: 0, y: 0, width: 0, height: 0 };
  renderOcrSelection();
};

const selectWholeOcrPage = (): void => {
  ocrSelectionMode = "full";
  ocrSelection = { x: 0, y: 0, width: ocrCanvas.width, height: ocrCanvas.height };
  renderOcrSelection();
  ocrStatus.textContent = "Page entière sélectionnée. Lance la reconnaissance lorsque tu es prêt.";
};

const ocrCanvasPoint = (event: PointerEvent): Point => {
  const bounds = ocrCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(ocrCanvas.width, (event.clientX - bounds.left) / bounds.width * ocrCanvas.width)),
    y: Math.max(0, Math.min(ocrCanvas.height, (event.clientY - bounds.top) / bounds.height * ocrCanvas.height))
  };
};

const clearOcrResults = (): void => {
  ocrProposals = [];
  ocrResults.replaceChildren();
  ocrEmpty.hidden = false;
  ocrRawText.textContent = "";
  applyOcrButton.disabled = true;
};

const loadOcrPage = async (pageId: string): Promise<void> => {
  const pageValue = project.pages.find((candidate) => candidate.id === pageId);
  if (!pageValue) throw new Error("Page OCR introuvable.");
  const bytes = assets.get(pageValue.rendition.archivePath);
  if (!bytes) throw new Error(`Image absente : ${pageValue.rendition.archivePath}`);
  if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
  ocrPreviewUrl = objectUrlFromBytes(bytes, pageValue.rendition.mime);
  ocrStatus.textContent = `Préparation de « ${pageValue.name} »…`;
  clearOcrResults();

  const previewImage = new Image();
  previewImage.src = ocrPreviewUrl;
  await new Promise<void>((resolve, reject) => {
    previewImage.onload = () => resolve();
    previewImage.onerror = () => reject(new Error("Image source illisible."));
  });
  const maxDimensionScale = Math.min(1, 3200 / Math.max(pageValue.width, pageValue.height));
  const maxPixelScale = Math.min(1, Math.sqrt(12_000_000 / (pageValue.width * pageValue.height)));
  const scale = Math.min(maxDimensionScale, maxPixelScale);
  ocrCanvas.width = Math.max(1, Math.round(pageValue.width * scale));
  ocrCanvas.height = Math.max(1, Math.round(pageValue.height * scale));
  const context = ocrCanvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas OCR indisponible.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);
  context.drawImage(previewImage, 0, 0, ocrCanvas.width, ocrCanvas.height);
  clearOcrSelection();
  ocrStatus.textContent = "Trace un rectangle autour de la légende, ou choisis explicitement la page entière.";
};

const existingOcrReference = (reference: string): boolean =>
  project.legendEntries.some((entry) =>
    entry.reference.localeCompare(reference.trim(), undefined, { sensitivity: "accent" }) === 0
  );

const renderOcrProposals = (): void => {
  ocrResults.replaceChildren();
  ocrEmpty.hidden = Boolean(ocrProposals.length);
  for (const proposal of ocrProposals) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input class="ocr-selected" type="checkbox" aria-label="Ajouter ce repère"></td>
      <td><input class="ocr-reference" type="text" aria-label="Repère proposé"><small class="ocr-existing"></small></td>
      <td><input class="ocr-name" type="text" aria-label="Désignation proposée"></td>
      <td><span class="ocr-colors"></span></td>
      <td><span class="ocr-confidence"></span></td>`;
    const selectedInput = row.querySelector<HTMLInputElement>(".ocr-selected")!;
    const referenceInput = row.querySelector<HTMLInputElement>(".ocr-reference")!;
    const nameInput = row.querySelector<HTMLInputElement>(".ocr-name")!;
    const existingLabel = row.querySelector<HTMLElement>(".ocr-existing")!;
    const colorsNode = row.querySelector<HTMLSpanElement>(".ocr-colors")!;
    const confidenceNode = row.querySelector<HTMLSpanElement>(".ocr-confidence")!;
    referenceInput.value = proposal.reference;
    nameInput.value = proposal.name;
    confidenceNode.textContent = `${Math.round(proposal.confidence)} %`;
    confidenceNode.title = proposal.sourceText;

    const syncExistingState = (): void => {
      const exists = existingOcrReference(proposal.reference);
      selectedInput.disabled = exists;
      if (exists) proposal.selected = selectedInput.checked = false;
      else selectedInput.checked = proposal.selected;
      existingLabel.textContent = exists ? "Déjà présent" : "";
      applyOcrButton.disabled = ocrBusy || !ocrProposals.some((candidate) =>
        candidate.selected && !existingOcrReference(candidate.reference)
      );
    };
    selectedInput.addEventListener("change", () => {
      proposal.selected = selectedInput.checked;
      syncExistingState();
    });
    referenceInput.addEventListener("input", () => {
      proposal.reference = referenceInput.value.trim().toUpperCase();
      const marking = proposal.markings[0];
      if (marking?.type === "color") marking.code = proposal.reference;
      else if (marking) marking.value = proposal.reference;
      syncExistingState();
    });
    nameInput.addEventListener("input", () => { proposal.name = nameInput.value; });
    proposal.highlight.colors.forEach((color, index) => {
      const input = document.createElement("input");
      input.type = "color";
      input.value = color;
      input.setAttribute("aria-label", `Couleur ${index + 1} de ${proposal.reference}`);
      input.addEventListener("input", () => {
        proposal.highlight.colors[index] = input.value;
        const marking = proposal.markings.find((candidate) => candidate.type === "color");
        if (marking?.type === "color") marking.bands[index] = input.value;
      });
      colorsNode.append(input);
    });
    syncExistingState();
    ocrResults.append(row);
  }
};

const recognizeOcrSelection = async (): Promise<void> => {
  if (ocrBusy || ocrSelection.width < 3 || ocrSelection.height < 3) return;
  ocrBusy = true;
  runOcrButton.disabled = true;
  applyOcrButton.disabled = true;
  ocrPageSelect.disabled = true;
  byId<HTMLButtonElement>("ocr-full-page").disabled = true;
  ocrStatus.textContent = "Chargement du moteur OCR…";
  clearOcrResults();

  const crop = document.createElement("canvas");
  const sourceWidth = Math.max(1, Math.round(ocrSelection.width));
  const sourceHeight = Math.max(1, Math.round(ocrSelection.height));
  const recognitionScale = Math.min(2.5, Math.max(1, 1800 / Math.max(sourceWidth, sourceHeight)));
  crop.width = Math.round(sourceWidth * recognitionScale);
  crop.height = Math.round(sourceHeight * recognitionScale);
  const context = crop.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas OCR indisponible.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, crop.width, crop.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    ocrCanvas,
    Math.round(ocrSelection.x),
    Math.round(ocrSelection.y),
    sourceWidth,
    sourceHeight,
    0,
    0,
    crop.width,
    crop.height
  );

  let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;
  try {
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    const localUrl = (path: string): string => new URL(path, window.location.href).href;
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: localUrl("/ocr/worker.min.js"),
      corePath: localUrl("/ocr/tesseract-core-lstm.wasm.js"),
      langPath: localUrl("/ocr").replace(/\/$/, ""),
      logger: (message) => {
        const percent = Math.max(0, Math.min(100, Math.round((message.progress || 0) * 100)));
        ocrStatus.textContent = `${ocrStatusLabel(message.status)} — ${percent} %`;
      }
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "200"
    });
    const sparseResult = await worker.recognize(crop, {}, { text: true, blocks: true });
    const linesFromRecognition = (
      data: typeof sparseResult.data,
      offset = { x: 0, y: 0 },
      scale = 1
    ) => data.blocks?.flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => ({
        text: line.text,
        confidence: line.confidence,
        bbox: line.bbox ? {
          x0: offset.x + line.bbox.x0 / scale,
          y0: offset.y + line.bbox.y0 / scale,
          x1: offset.x + line.bbox.x1 / scale,
          y1: offset.y + line.bbox.y1 / scale
        } : undefined
      })))
    ) || data.text.split(/\r?\n/).map((text) => ({ text, confidence: data.confidence }));

    let proposals = proposalsFromOcrLines(linesFromRecognition(sparseResult.data));
    let rawText = sparseResult.data.text.trim();
    const numericProposalCount = proposals.filter((proposal) =>
      proposal.markings.some((marking) => marking.type === "number")
    ).length;
    if (numericProposalCount >= 3) {
      ocrStatus.textContent = "Liste numérotée détectée — seconde lecture des petits repères…";
      const region = numericLegendRegion(proposals, crop.width, crop.height) || {
        x: 0, y: 0, width: crop.width, height: crop.height
      };
      const blockScale = Math.min(2.5, Math.max(1, 1800 / Math.max(region.width, region.height)));
      const blockCrop = document.createElement("canvas");
      blockCrop.width = Math.max(1, Math.round(region.width * blockScale));
      blockCrop.height = Math.max(1, Math.round(region.height * blockScale));
      const blockContext = blockCrop.getContext("2d", { alpha: false });
      if (!blockContext) throw new Error("Canvas de seconde lecture OCR indisponible.");
      blockContext.fillStyle = "#ffffff";
      blockContext.fillRect(0, 0, blockCrop.width, blockCrop.height);
      blockContext.imageSmoothingEnabled = true;
      blockContext.imageSmoothingQuality = "high";
      blockContext.drawImage(
        crop,
        region.x, region.y, region.width, region.height,
        0, 0, blockCrop.width, blockCrop.height
      );
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const blockResult = await worker.recognize(blockCrop, {}, { text: true, blocks: true });
      proposals = mergeOcrProposalPasses(
        proposals,
        proposalsFromOcrLines(linesFromRecognition(blockResult.data, region, blockScale))
      );
      rawText = `${rawText}\n\n[Seconde lecture]\n${blockResult.data.text.trim()}`;
    }
    ocrRawText.textContent = rawText;
    ocrProposals = proposals.map((proposal) => ({
      ...proposal,
      selected: !existingOcrReference(proposal.reference)
    }));
    renderOcrProposals();
    ocrStatus.textContent = ocrProposals.length
      ? `${ocrProposals.length} proposition${ocrProposals.length > 1 ? "s" : ""} détectée${ocrProposals.length > 1 ? "s" : ""}. Vérifie-les avant insertion.`
      : "Le texte a été reconnu, mais aucun repère exploitable n’a été identifié dans cette zone.";
  } catch (error) {
    ocrStatus.textContent = `Reconnaissance impossible : ${String(error)}`;
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
    ocrBusy = false;
    ocrPageSelect.disabled = false;
    byId<HTMLButtonElement>("ocr-full-page").disabled = false;
    renderOcrSelection();
    applyOcrButton.disabled = !ocrProposals.some((proposal) =>
      proposal.selected && !existingOcrReference(proposal.reference)
    );
  }
};

const closeOcrDialog = (): void => {
  if (ocrBusy) return;
  if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
  ocrPreviewUrl = null;
  ocrDialog.close();
  renderLegendDialog();
  legendDialog.showModal();
};

const openOcrDialog = async (): Promise<void> => {
  if (!editMode.checked || !hasPage() || ocrBusy) return;
  legendDialog.close();
  ocrPageSelect.replaceChildren();
  for (const pageValue of project.pages) {
    const source = project.sources.find((candidate) => candidate.id === pageValue.sourceId);
    const option = document.createElement("option");
    option.value = pageValue.id;
    option.textContent = project.sources.length > 1
      ? `${source?.name || "Source"} — ${pageValue.name}`
      : pageValue.name;
    ocrPageSelect.append(option);
  }
  ocrPageSelect.value = currentPageId;
  clearOcrResults();
  ocrDialog.showModal();
  try { await loadOcrPage(currentPageId); }
  catch (error) { ocrStatus.textContent = `Préparation impossible : ${String(error)}`; }
};

const applyOcrProposals = (): void => {
  if (ocrBusy) return;
  const accepted = ocrProposals.filter((proposal) =>
    proposal.selected && proposal.reference.trim() && !existingOcrReference(proposal.reference)
  );
  if (!accepted.length) return;
  const legendId = project.legends[0]?.id || makeId("legend");
  pushHistory();
  if (!project.legends.length) project.legends.push({ id: legendId, name: "Repères du projet", scope: "project" });
  for (const proposal of accepted) {
    project.legendEntries.push({
      id: makeId("repere"),
      legendId,
      reference: proposal.reference.trim(),
      name: proposal.name.trim() || proposal.reference.trim(),
      markings: structuredClone(proposal.markings),
      highlight: structuredClone(proposal.highlight)
    });
  }
  markDirty();
  renderAll();
  setStatus(`${accepted.length} repère${accepted.length > 1 ? "s" : ""} ajouté${accepted.length > 1 ? "s" : ""} après validation OCR.`);
  closeOcrDialog();
};

const renderLegendDialog = (): void => {
  legendBody.replaceChildren();
  for (const entry of project.legendEntries) {
    const row = document.createElement("tr");
    const colors = entry.highlight.colors;
    row.innerHTML = `
      <td><input class="legend-reference" type="text"></td>
      <td><input class="legend-name" type="text"></td>
      <td><input class="legend-color-one" type="color"></td>
      <td><label><input class="legend-two-enabled" type="checkbox"> <input class="legend-color-two" type="color"></label></td>
      <td><button class="danger legend-delete" type="button">×</button></td>`;
    const referenceInput = row.querySelector<HTMLInputElement>(".legend-reference")!;
    const nameInput = row.querySelector<HTMLInputElement>(".legend-name")!;
    const firstColor = row.querySelector<HTMLInputElement>(".legend-color-one")!;
    const secondEnabled = row.querySelector<HTMLInputElement>(".legend-two-enabled")!;
    const secondColor = row.querySelector<HTMLInputElement>(".legend-color-two")!;
    const deleteButton = row.querySelector<HTMLButtonElement>(".legend-delete")!;
    referenceInput.value = entry.reference;
    nameInput.value = entry.name;
    firstColor.value = colors[0] || "#e93478";
    secondEnabled.checked = Boolean(colors[1]);
    secondColor.value = colors[1] || "#ffffff";
    secondColor.disabled = !secondEnabled.checked;
    const mutate = (operation: () => void): void => {
      pushHistory();
      operation();
      markDirty();
      renderLegendSelect();
      renderCircuits();
      renderCircuitList();
    };
    referenceInput.addEventListener("change", () => mutate(() => {
      entry.reference = referenceInput.value.trim() || "—";
      const firstMarking = entry.markings[0];
      if (firstMarking?.type === "number" || firstMarking?.type === "text") firstMarking.value = entry.reference;
      if (firstMarking?.type === "color") firstMarking.code = entry.reference;
    }));
    nameInput.addEventListener("change", () => mutate(() => { entry.name = nameInput.value.trim() || entry.reference; }));
    firstColor.addEventListener("change", () => mutate(() => {
      entry.highlight.colors[0] = firstColor.value;
      const marking = entry.markings.find((item) => item.type === "color");
      if (marking?.type === "color") marking.bands[0] = firstColor.value;
    }));
    secondEnabled.addEventListener("change", () => mutate(() => {
      secondColor.disabled = !secondEnabled.checked;
      entry.highlight.colors = secondEnabled.checked ? [firstColor.value, secondColor.value] : [firstColor.value];
      entry.highlight.pattern = secondEnabled.checked ? "striped" : "solid";
    }));
    secondColor.addEventListener("change", () => mutate(() => { entry.highlight.colors[1] = secondColor.value; }));
    const usage = project.circuits.filter((value) => value.legendEntryId === entry.id).length;
    deleteButton.disabled = usage > 0;
    deleteButton.setAttribute("aria-label", usage ? `Repère utilisé par ${usage} circuits` : "Supprimer ce repère");
    deleteButton.addEventListener("click", () => {
      if (usage) return;
      pushHistory();
      project.legendEntries = project.legendEntries.filter((value) => value.id !== entry.id);
      markDirty();
      renderLegendDialog();
      renderAll();
    });
    legendBody.append(row);
  }
};

const openLegendDialog = (): void => {
  renderLegendDialog();
  legendDialog.showModal();
};

const addLegendEntry = (): void => {
  const legendId = project.legends[0]?.id || makeId("legend");
  if (!project.legends.length) project.legends.push({ id: legendId, name: "Repères du projet", scope: "project" });
  pushHistory();
  project.legendEntries.push({
    id: makeId("repere"),
    legendId,
    reference: String(project.legendEntries.length + 1),
    name: "Nouveau repère",
    markings: [{ type: "number", value: String(project.legendEntries.length + 1) }],
    highlight: { colors: ["#e93478"], pattern: "solid" }
  });
  markDirty();
  renderLegendDialog();
  renderAll();
};

const createCircuit = (): void => {
  if (!hasPage()) {
    setStatus("Importe une source avant de créer un circuit.");
    return;
  }
  const entryId = activeLegend.value || project.legendEntries[0]?.id;
  if (!entryId) return openLegendDialog();
  pushHistory();
  const value: Circuit = { id: makeId("circuit"), legendEntryId: entryId, name: "Nouveau circuit", traces: [] };
  project.circuits.push(value);
  selectedCircuitId = value.id;
  markDirty();
  renderAll();
  beginDrawing();
};

const currentHtmlExport = (): { editable: boolean; label: string; filename: string } => {
  const editable = byId<HTMLSelectElement>("export-mode").value === "editable";
  return {
    editable,
    label: editable ? "HTML modifiable" : "HTML de consultation",
    filename: `${safeFilename(project.title)}-${editable ? "modifiable" : "consultation"}.html`
  };
};

const prepareStandaloneHtml = async (): Promise<string> => {
  const standalonePages = [];
  for (let index = 0; index < project.pages.length; index += 1) {
    const pageValue = project.pages[index];
    const bytes = assets.get(pageValue.rendition.archivePath);
    if (!bytes) throw new Error(`Image absente : ${pageValue.rendition.archivePath}`);
    setStatus(`Préparation de la page ${index + 1}/${project.pages.length} pour l'export HTML…`);
    standalonePages.push({ page: pageValue, imageDataUrl: await dataUrlFromBytes(bytes, pageValue.rendition.mime) });
  }
  return createStandaloneHtml(project, standalonePages, currentHtmlExport().editable, currentPageId);
};

const exportHtml = async (): Promise<void> => {
  if (!hasPage()) {
    setStatus("Importe une source avant d’exporter le projet en HTML.");
    return;
  }
  const mode = currentHtmlExport();
  const html = await prepareStandaloneHtml();
  downloadText(mode.filename, html, "text/html;charset=utf-8");
  setStatus(`${mode.label} exporté.`);
};

const formatBytes = (value: number): string => {
  if (value < 1024) return `${value.toLocaleString("fr-FR")} octets`;
  const units = ["Kio", "Mio", "Gio"];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount.toLocaleString("fr-FR", { maximumFractionDigits: amount < 10 ? 1 : 0 })} ${unit}`;
};

const randomShareIdentifier = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

const clearHotspotClientPolling = (): void => {
  if (hotspotClientPollTimer !== null) window.clearInterval(hotspotClientPollTimer);
  hotspotClientPollTimer = null;
};

const releaseAndroidHotspot = (): void => {
  clearHotspotClientPolling();
  if (androidHotspotOwned) {
    try { getAndroidBridge()?.stopLocalHotspot(); } catch { /* Android libère aussi la réservation avec l’activité. */ }
  }
  androidHotspotOwned = false;
  androidHotspotRequestId = null;
  androidShareAddress = "";
};

const wifiQrEscape = (value: string): string => value.replaceAll(/([\\;,:"'])/g, "\\$1");

const showManualShareFallback = (message: string): void => {
  clearHotspotClientPolling();
  androidHotspotOwned = false;
  androidShareAddress = getAndroidBridge()?.getPreferredIpv4().trim() || "";
  shareNetworkQr.hidden = true;
  shareNetworkQr.replaceChildren();
  shareNetworkCredentials.hidden = true;
  shareNetworkSummary.textContent = `${message} Connecte les appareils au même réseau, puis continue.`;
  shareStatus.textContent = "Mode manuel : ESE ne modifiera pas la connexion existante.";
  continueShareButton.textContent = "Les appareils sont connectés — Continuer";
  continueShareButton.disabled = false;
};

const renderHotspotQr = async (detail: AndroidHotspotEventDetail): Promise<void> => {
  const ssid = detail.ssid || "";
  const passphrase = detail.passphrase || "";
  if (!ssid || !detail.address) {
    showManualShareFallback("Android n’a pas fourni tous les paramètres du point d’accès.");
    return;
  }
  const security = detail.security === "nopass" ? "nopass" : "WPA";
  const qrValue = security === "nopass"
    ? `WIFI:T:nopass;S:${wifiQrEscape(ssid)};;`
    : `WIFI:T:${security};S:${wifiQrEscape(ssid)};P:${wifiQrEscape(passphrase)};;`;
  const { default: QRCode } = await import("qrcode");
  shareNetworkQr.innerHTML = await QRCode.toString(qrValue, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 250,
    color: { dark: "#111827", light: "#ffffff" }
  });
  shareNetworkQr.hidden = false;
  shareNetworkSsid.textContent = ssid;
  shareNetworkPassword.textContent = passphrase || "Aucun";
  shareNetworkCredentials.hidden = false;
  shareNetworkSummary.textContent = "Scanne ce premier QR pour rejoindre le réseau ESE. Le QR du fichier apparaîtra dès que le récepteur sera détecté.";
  shareStatus.textContent = "Point d’accès local créé par ESE · attente du récepteur.";
  continueShareButton.textContent = "Connexion établie — Continuer";
  continueShareButton.disabled = false;
};

const startHotspotClientPolling = (): void => {
  clearHotspotClientPolling();
  hotspotClientPollTimer = window.setInterval(() => {
    if (shareBusy || shareSessionId || !androidHotspotOwned) return;
    try {
      const clientCount = getAndroidBridge()?.getHotspotClientCount() ?? -1;
      if (clientCount < 0) {
        clearHotspotClientPolling();
        shareStatus.textContent = "Android ne permet pas la détection automatique : utilise le bouton Continuer après la connexion.";
        return;
      }
      if (clientCount > 0) {
        clearHotspotClientPolling();
        shareNetworkSummary.textContent = "Récepteur détecté · préparation du QR du fichier…";
        void beginHtmlShare();
      }
    } catch {
      clearHotspotClientPolling();
      shareStatus.textContent = "Détection automatique indisponible : utilise le bouton Continuer après la connexion.";
    }
  }, 750);
};

const handleAndroidHotspotEvent = async (detail: AndroidHotspotEventDetail): Promise<void> => {
  if (!androidHotspotRequestId || detail.requestId !== androidHotspotRequestId) return;
  if (detail.state === "starting") {
    shareNetworkSummary.textContent = detail.message || "Création du point d’accès local ESE…";
    shareStatus.textContent = "Android prépare le réseau local temporaire.";
    return;
  }
  if (detail.state === "ready") {
    androidHotspotOwned = true;
    androidShareAddress = detail.address || "";
    await renderHotspotQr(detail);
    if (androidHotspotOwned) startHotspotClientPolling();
    return;
  }
  if (detail.state === "stopped") {
    androidHotspotOwned = false;
    androidShareAddress = "";
    clearHotspotClientPolling();
    shareStatus.textContent = detail.message || "Le point d’accès local a été arrêté.";
    if (shareSessionId && shareLastStatus?.running) {
      try { await invoke("stop_html_share", { sessionId: shareSessionId }); } catch { /* Le serveur expirera seul. */ }
    }
    return;
  }
  showManualShareFallback(detail.message || "Création automatique du réseau impossible.");
};

window.addEventListener("ese-hotspot", (event) => {
  const detail = (event as CustomEvent<AndroidHotspotEventDetail>).detail;
  if (detail) void handleAndroidHotspotEvent(detail);
});

const clearSharePolling = (): void => {
  if (sharePollTimer !== null) window.clearInterval(sharePollTimer);
  sharePollTimer = null;
};

const renderShareStatus = (status: ShareStatus): void => {
  shareLastStatus = status;
  const completed = status.completedTransfers;
  shareCounter.textContent = status.multiple
    ? `${completed} réception${completed > 1 ? "s" : ""} terminée${completed > 1 ? "s" : ""}`
    : completed
    ? "Réception confirmée"
    : status.fileDeliveries
    ? "Fichier envoyé · attente de l’affichage"
    : "En attente d’un appareil";
  shareBytes.textContent = status.bytesSent
    ? `${formatBytes(status.bytesSent)} envoyé${status.fileDeliveries > 1 ? "s" : ""}`
    : "Aucun octet envoyé";

  if (status.running) {
    shareState.textContent = status.multiple ? "Partage multiple en cours" : "Partage prêt";
    shareStatus.textContent = status.multiple
      ? "Le serveur restera ouvert jusqu’à ton arrêt explicite."
      : "Le serveur s’arrêtera après la réception complète, ou après 5 minutes sans transfert.";
    stopShareButton.hidden = false;
    stopShareButton.textContent = "Arrêter le partage";
    return;
  }

  clearSharePolling();
  releaseAndroidHotspot();
  stopShareButton.hidden = false;
  stopShareButton.textContent = "Fermer";
  if (status.stopReason === "completed") {
    shareState.textContent = "Transfert terminé";
    shareStatus.textContent = "Réception confirmée : le serveur local a été arrêté automatiquement.";
  } else if (status.stopReason === "timeout") {
    shareState.textContent = "Partage expiré";
    shareStatus.textContent = "Aucun transfert terminé pendant 5 minutes : le serveur a été arrêté.";
  } else if (status.stopReason === "error") {
    shareState.textContent = "Partage interrompu";
    shareStatus.textContent = status.lastError || "Le serveur local a rencontré une erreur.";
  } else {
    shareState.textContent = "Partage arrêté";
    shareStatus.textContent = "Le serveur local est fermé.";
  }
};

const pollShareStatus = async (): Promise<void> => {
  if (!shareSessionId || !isTauri()) return;
  try {
    const status = await invoke<ShareStatus>("get_share_status", { sessionId: shareSessionId });
    renderShareStatus(status);
  } catch (error) {
    shareStatus.textContent = `État du partage inaccessible : ${String(error)}`;
  }
};

const startSharePolling = (): void => {
  clearSharePolling();
  void pollShareStatus();
  sharePollTimer = window.setInterval(() => { void pollShareStatus(); }, 750);
};

const openShareDialog = async (): Promise<void> => {
  if (!hasPage()) return;
  releaseAndroidHotspot();
  const mode = currentHtmlExport();
  shareExportMode.textContent = mode.label;
  shareMultiple.checked = false;
  shareSetup.hidden = false;
  shareActive.hidden = true;
  shareNetworkQr.hidden = true;
  shareNetworkQr.replaceChildren();
  shareNetworkCredentials.hidden = true;
  shareNetworkSsid.textContent = "";
  shareNetworkPassword.textContent = "";
  shareFileQr.replaceChildren();
  shareUrl.value = "";
  shareState.textContent = "Serveur prêt";
  shareCounter.textContent = "";
  shareBytes.textContent = "";
  shareStatus.textContent = "Le transfert reste entièrement local.";
  stopShareButton.hidden = true;
  continueShareButton.disabled = true;
  continueShareButton.textContent = "Les appareils sont connectés — Continuer";
  shareSessionId = null;
  shareLastStatus = null;
  shareDialog.showModal();

  if (!isTauri()) {
    shareNetworkSummary.textContent = "Le serveur de partage est disponible dans l’application native ESE, pas dans l’aperçu Web.";
    shareStatus.textContent = "Ouvre ce projet dans ESE pour lancer le partage local.";
    return;
  }

  const androidBridge = getAndroidBridge();
  if (androidBridge) {
    try {
      const nativeCapabilities = JSON.parse(androidBridge.getHotspotCapabilities()) as AndroidHotspotCapabilities;
      if (nativeCapabilities.supported) {
        androidHotspotRequestId = randomShareIdentifier();
        shareNetworkSummary.textContent = nativeCapabilities.permissionGranted
          ? "Création du point d’accès local temporaire…"
          : "Android va demander l’autorisation d’accéder aux appareils Wi-Fi à proximité.";
        shareStatus.textContent = "Préparation de la connexion Android directe.";
        androidBridge.startLocalHotspot(androidHotspotRequestId);
        return;
      }
      showManualShareFallback("Cette version d’Android ne prend pas en charge le point d’accès local.");
      return;
    } catch (error) {
      showManualShareFallback(`Adaptateur Android indisponible : ${String(error)}.`);
      return;
    }
  }

  try {
    const capabilities = await invoke<ShareNetworkCapabilities>("share_network_capabilities");
    continueShareButton.disabled = !capabilities.canStartServer;
    shareNetworkSummary.textContent = capabilities.automaticHotspot
      ? "ESE peut préparer automatiquement une connexion locale sur cette plateforme."
      : "Cette version ne peut pas créer elle-même le point d’accès : connecte les appareils au même réseau, puis continue.";
  } catch (error) {
    shareNetworkSummary.textContent = `Vérification réseau impossible : ${String(error)}`;
    shareStatus.textContent = "Le partage ne peut pas démarrer.";
  }
};

const beginHtmlShare = async (): Promise<void> => {
  if (shareBusy || !isTauri()) return;
  shareBusy = true;
  clearHotspotClientPolling();
  continueShareButton.disabled = true;
  shareStatus.textContent = "Préparation de l’export HTML…";
  try {
    const mode = currentHtmlExport();
    const html = await prepareStandaloneHtml();
    const sessionId = randomShareIdentifier();
    const token = `${randomShareIdentifier()}${randomShareIdentifier()}`.replaceAll("-", "");
    const addressOverride = androidShareAddress || getAndroidBridge()?.getPreferredIpv4().trim() || null;
    const result = await invoke<ShareStartResult>("start_html_share", {
      sessionId,
      token,
      html,
      filename: mode.filename,
      multiple: shareMultiple.checked,
      addressOverride
    });
    shareSessionId = result.sessionId;

    const { default: QRCode } = await import("qrcode");
    const qrSvg = await QRCode.toString(result.url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#111827", light: "#ffffff" }
    });
    shareFileQr.innerHTML = qrSvg;
    shareUrl.value = result.url;
    shareSetup.hidden = true;
    shareActive.hidden = false;
    stopShareButton.hidden = false;
    setStatus(`${mode.label} prêt à être partagé sur le réseau local.`);
    startSharePolling();
  } catch (error) {
    if (shareSessionId) {
      try { await invoke("stop_html_share", { sessionId: shareSessionId }); } catch { /* Arrêt de secours. */ }
    }
    shareSessionId = null;
    releaseAndroidHotspot();
    shareStatus.textContent = `Partage impossible : ${String(error)}`;
    continueShareButton.disabled = false;
  } finally {
    shareBusy = false;
  }
};

const stopOrCloseShare = async (): Promise<void> => {
  if (shareBusy) return;
  if (!shareSessionId || !shareLastStatus?.running) {
    clearSharePolling();
    releaseAndroidHotspot();
    shareDialog.close();
    return;
  }
  shareBusy = true;
  stopShareButton.disabled = true;
  shareStatus.textContent = "Arrêt du serveur local…";
  try {
    const status = await invoke<ShareStatus>("stop_html_share", { sessionId: shareSessionId });
    renderShareStatus(status);
    startSharePolling();
  } catch (error) {
    shareStatus.textContent = `Arrêt impossible : ${String(error)}`;
  } finally {
    stopShareButton.disabled = false;
    shareBusy = false;
  }
};

const closeShareDialog = async (): Promise<void> => {
  if (shareBusy) {
    shareStatus.textContent = "La préparation du partage est encore en cours…";
    return;
  }
  if (shareSessionId && shareLastStatus?.running !== false) {
    const confirmed = window.confirm("Un partage est encore en cours. Arrêter le serveur local et fermer ?");
    if (!confirmed) return;
    try {
      if (shareSessionId) await invoke("stop_html_share", { sessionId: shareSessionId });
    } catch (error) {
      shareStatus.textContent = `Arrêt impossible : ${String(error)}`;
      return;
    }
  }
  clearSharePolling();
  releaseAndroidHotspot();
  shareSessionId = null;
  shareLastStatus = null;
  shareDialog.close();
};

const copyShareAddress = async (): Promise<void> => {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    shareStatus.textContent = "Adresse copiée.";
  } catch {
    shareUrl.select();
    document.execCommand("copy");
    shareStatus.textContent = "Adresse copiée.";
  }
};

appUpdateButton.addEventListener("click", () => { void openApplicationUpdate(); });
checkUpdateButton.addEventListener("click", () => { void checkApplicationUpdate(true); });
installUpdateButton.addEventListener("click", () => { void installAvailableAppUpdate(); });
closeUpdateButton.addEventListener("click", () => {
  if (!appUpdateBusy) updateDialog.close();
});
updateDialog.addEventListener("cancel", (event) => {
  if (appUpdateBusy) event.preventDefault();
});

byId<HTMLButtonElement>("open-project").addEventListener("click", openProject);
newProjectButton.addEventListener("click", () => { void newProject(); });
importSourceButton.addEventListener("click", () => {
  if (!editMode.checked) return;
  sourceFile.click();
});
captureSourceButton.addEventListener("click", () => { void openCameraCapture(); });
emptyImportSourceButton.addEventListener("click", () => {
  if (!editMode.checked) {
    editMode.checked = true;
    editTools.hidden = false;
    updateControls();
  }
  sourceFile.click();
});
emptyCaptureSourceButton.addEventListener("click", () => {
  if (!editMode.checked) {
    editMode.checked = true;
    editTools.hidden = false;
    updateControls();
  }
  void openCameraCapture();
});
byId<HTMLButtonElement>("save-project").addEventListener("click", () => saveProject(false));
byId<HTMLButtonElement>("save-project-as").addEventListener("click", () => saveProject(true));
exportHtmlButton.addEventListener("click", exportHtml);
shareHtmlButton.addEventListener("click", () => { void openShareDialog(); });
continueShareButton.addEventListener("click", () => { void beginHtmlShare(); });
byId<HTMLButtonElement>("copy-share-url").addEventListener("click", () => { void copyShareAddress(); });
stopShareButton.addEventListener("click", () => { void stopOrCloseShare(); });
byId<HTMLButtonElement>("close-share").addEventListener("click", () => { void closeShareDialog(); });
shareDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  void closeShareDialog();
});
byId<HTMLButtonElement>("export-json").addEventListener("click", () => {
  downloadText(`${safeFilename(project.title)}-annotations.json`, createAnnotationsJson(project), "application/json;charset=utf-8");
});
zoomInButton.addEventListener("click", () => zoomAt(0.8));
zoomOutButton.addEventListener("click", () => zoomAt(1.25));
fitViewButton.addEventListener("click", fitView);
pageSelect.addEventListener("change", () => activatePage(pageSelect.value));
previousPageButton.addEventListener("click", () => {
  const index = project.pages.findIndex((item) => item.id === currentPageId);
  if (index > 0) activatePage(project.pages[index - 1].id);
});
nextPageButton.addEventListener("click", () => {
  const index = project.pages.findIndex((item) => item.id === currentPageId);
  if (index >= 0 && index < project.pages.length - 1) activatePage(project.pages[index + 1].id);
});
byId<HTMLButtonElement>("edit-legend").addEventListener("click", openLegendDialog);
byId<HTMLButtonElement>("close-legend").addEventListener("click", () => legendDialog.close());
byId<HTMLButtonElement>("add-legend-entry").addEventListener("click", addLegendEntry);
openOcrButton.addEventListener("click", () => { void openOcrDialog(); });
byId<HTMLButtonElement>("close-ocr").addEventListener("click", closeOcrDialog);
byId<HTMLButtonElement>("cancel-ocr").addEventListener("click", closeOcrDialog);
byId<HTMLButtonElement>("ocr-full-page").addEventListener("click", selectWholeOcrPage);
runOcrButton.addEventListener("click", () => { void recognizeOcrSelection(); });
applyOcrButton.addEventListener("click", applyOcrProposals);
ocrPageSelect.addEventListener("change", () => { void loadOcrPage(ocrPageSelect.value).catch((error) => {
  ocrStatus.textContent = `Préparation impossible : ${String(error)}`;
}); });
ocrDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOcrDialog();
});
ocrCanvas.addEventListener("pointerdown", (event) => {
  if (ocrBusy || event.button !== 0) return;
  ocrSelectionStart = ocrCanvasPoint(event);
  ocrSelectionMode = "region";
  ocrSelection = { x: ocrSelectionStart.x, y: ocrSelectionStart.y, width: 0, height: 0 };
  try { ocrCanvas.setPointerCapture(event.pointerId); } catch { /* Le glisser reste utilisable sans capture. */ }
  renderOcrSelection();
});
ocrCanvas.addEventListener("pointermove", (event) => {
  if (!ocrSelectionStart) return;
  const current = ocrCanvasPoint(event);
  ocrSelection = {
    x: Math.min(ocrSelectionStart.x, current.x),
    y: Math.min(ocrSelectionStart.y, current.y),
    width: Math.abs(current.x - ocrSelectionStart.x),
    height: Math.abs(current.y - ocrSelectionStart.y)
  };
  renderOcrSelection();
});
const finishOcrSelection = (event: PointerEvent): void => {
  if (!ocrSelectionStart) return;
  ocrSelectionStart = null;
  if (ocrCanvas.hasPointerCapture(event.pointerId)) ocrCanvas.releasePointerCapture(event.pointerId);
  if (ocrSelection.width < 3 || ocrSelection.height < 3) {
    clearOcrSelection();
    ocrStatus.textContent = "Zone trop petite : trace un rectangle, ou choisis la page entière.";
    return;
  }
  renderOcrSelection();
  ocrStatus.textContent = "Zone sélectionnée. Lance la reconnaissance lorsque tu es prêt.";
};
ocrCanvas.addEventListener("pointerup", finishOcrSelection);
ocrCanvas.addEventListener("pointercancel", finishOcrSelection);
newCircuitButton.addEventListener("click", createCircuit);
addTraceButton.addEventListener("click", beginDrawing);
editPortionButton.addEventListener("click", () => setPortionEditMode(!portionEditMode));
finishButton.addEventListener("click", () => finishDrawing(false));
cancelButton.addEventListener("click", cancelDrawing);
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);

removeTraceButton.addEventListener("click", deleteSelectedTrace);
deletePageButton.addEventListener("click", deleteCurrentPage);

deleteCircuitButton.addEventListener("click", () => {
  if (!selectedCircuitId || drawing) return;
  pushHistory();
  project.circuits = project.circuits.filter((value) => value.id !== selectedCircuitId);
  selectedCircuitId = null;
  selectedTraceId = null;
  setPortionEditMode(false);
  markDirty();
  renderAll();
});

activeLegend.addEventListener("change", () => {
  const selected = circuit(selectedCircuitId);
  if (!selected || selected.legendEntryId === activeLegend.value) return;
  pushHistory();
  selected.legendEntryId = activeLegend.value;
  markDirty();
  renderAll();
});

editMode.addEventListener("change", () => {
  if (editMode.checked && viewerFullscreen) void setViewerFullscreen(false);
  editTools.hidden = !editMode.checked;
  if (!editMode.checked && drawing) cancelDrawing();
  if (!editMode.checked && portionEditMode) setPortionEditMode(false);
  displayCircuitStatus(circuit(selectedCircuitId), Boolean(selectedCircuitId));
  updateControls();
  scheduleRecoverySession();
});

viewerFullscreenButton.addEventListener("click", () => {
  void setViewerFullscreen(!viewerFullscreen);
});

circuitSearch.addEventListener("input", renderCircuitList);

projectFile.addEventListener("change", async () => {
  const file = projectFile.files?.[0];
  if (!file) return;
  try { openProjectDocument(new Uint8Array(await file.arrayBuffer()), null, file.name); }
  catch (error) { setStatus(`Projet invalide : ${String(error)}`); }
  projectFile.value = "";
});

sourceFile.addEventListener("change", async () => {
  const file = sourceFile.files?.[0];
  if (!file) return;
  try {
    if (!editMode.checked) setStatus("Active le mode édition pour importer une source.");
    else await importSource(file);
  }
  catch (error) { setStatus(`Import impossible : ${String(error)}`); }
  sourceFile.value = "";
});

cameraFile.addEventListener("change", async () => {
  const file = cameraFile.files?.[0];
  if (!file) return;
  try {
    const photo = new File([file], cameraPhotoFilename(), {
      type: file.type || "image/jpeg",
      lastModified: file.lastModified || Date.now()
    });
    await importSource(photo);
  } catch (error) {
    setStatus(`Import de la photo impossible : ${String(error)}`);
  } finally {
    cameraFile.value = "";
    cleanupAndroidCameraCaptures();
  }
});
cameraFile.addEventListener("cancel", () => {
  cameraFile.value = "";
  cleanupAndroidCameraCaptures();
  setStatus("Prise de vue annulée.");
});

byId<HTMLButtonElement>("close-camera").addEventListener("click", closeCameraDialog);
byId<HTMLButtonElement>("cancel-camera").addEventListener("click", closeCameraDialog);
switchCameraButton.addEventListener("click", switchCamera);
cameraDevice.addEventListener("change", () => { void startCameraStream(cameraDevice.value); });
takePhotoButton.addEventListener("click", () => {
  void captureCameraFrame().catch((error) => {
    takePhotoButton.disabled = false;
    cameraStatus.textContent = `Photo impossible : ${String(error)}`;
  });
});
retakePhotoButton.addEventListener("click", () => { void startCameraStream(cameraDevice.value); });
importPhotoButton.addEventListener("click", () => {
  void importCameraCapture().catch((error) => setStatus(`Import de la photo impossible : ${String(error)}`));
});
cameraDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCameraDialog();
});

pdfPageSelection.addEventListener("input", () => updatePdfSelection(true));
pdfPageSelection.addEventListener("change", () => updatePdfSelection(true));
byId<HTMLButtonElement>("pdf-select-all").addEventListener("click", () => {
  if (!pendingPdfImport) return;
  setPdfSelection(Array.from({ length: pendingPdfImport.document.numPages }, (_, index) => index + 1));
});
byId<HTMLButtonElement>("pdf-clear-selection").addEventListener("click", () => setPdfSelection([]));
byId<HTMLButtonElement>("cancel-pdf-import").addEventListener("click", disposePdfImport);
byId<HTMLButtonElement>("close-pdf-import").addEventListener("click", disposePdfImport);
confirmPdfImport.addEventListener("click", () => { void confirmPdfPages(); });
pdfImportDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!pdfImportBusy) disposePdfImport();
});

viewport.addEventListener("pointermove", (event) => {
  if (!hasPage()) return;
  if (traceDrag?.pointerId === event.pointerId) {
    const point = eventPoint(event);
    coordinates.textContent = `x ${Math.round(point.x)} · y ${Math.round(point.y)}`;
    updateTraceDrag(event);
    return;
  }

  if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchGesture && touchPoints.size >= 2) {
      event.preventDefault();
      updateTouchGesture();
      const pair = touchPair();
      if (pair) {
        const center = touchCenter(...pair);
        const centerPoint = clientPointToSvg(center.x, center.y);
        coordinates.textContent = `x ${Math.round(centerPoint.x)} · y ${Math.round(centerPoint.y)}`;
      }
      return;
    }
  }

  const point = eventPoint(event);
  coordinates.textContent = `x ${Math.round(point.x)} · y ${Math.round(point.y)}`;
  if (dragState) {
    const clientDx = event.clientX - dragState.x;
    const clientDy = event.clientY - dragState.y;
    const delta = clientDeltaToSvg(clientDx, clientDy);
    if (Math.hypot(clientDx, clientDy) > 3) dragState.moved = true;
    view.x = dragState.viewX - delta.x;
    view.y = dragState.viewY - delta.y;
    clampView();
    applyView();
  } else if (drawing) {
    drawing.cursor = point;
    updatePreview();
  }
});

viewport.addEventListener("pointerdown", (event) => {
  if (!hasPage()) return;
  if (event.pointerType === "touch") {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);
    if (touchPoints.size >= 2) {
      event.preventDefault();
      beginTouchGesture();
    }
    return;
  }

  if (drawing || (event.button !== 0 && event.button !== 1)) return;
  if (event.target !== canvasHit && event.button !== 1) return;
  dragState = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
  viewport.classList.add("panning");
  viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener("pointerup", (event) => {
  if (!hasPage()) return;
  if (traceDrag?.pointerId === event.pointerId) {
    finishTraceDrag(event.pointerId);
    return;
  }

  if (event.pointerType === "touch") {
    const wasGesture = Boolean(touchGesture);
    touchPoints.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (wasGesture) {
      suppressDiagramClickUntil = performance.now() + 750;
      if (touchPoints.size >= 2) beginTouchGesture();
      else {
        touchGesture = null;
        viewport.classList.remove("panning");
      }
    }
    return;
  }

  if (!dragState) return;
  const moved = dragState.moved;
  dragState = null;
  viewport.classList.remove("panning");
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  if (!moved && !drawing && event.target === canvasHit) {
    if (portionEditMode) selectTrace(null);
    else selectCircuit(null);
  }
});

viewport.addEventListener("pointercancel", (event) => {
  if (!hasPage()) return;
  if (traceDrag?.pointerId === event.pointerId) {
    finishTraceDrag(event.pointerId);
    return;
  }
  if (event.pointerType !== "touch") return;
  touchPoints.delete(event.pointerId);
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  suppressDiagramClickUntil = performance.now() + 750;
  if (touchPoints.size >= 2) beginTouchGesture();
  else {
    touchGesture = null;
    viewport.classList.remove("panning");
  }
});

viewport.addEventListener("click", (event) => {
  if (!hasPage()) return;
  if (performance.now() < suppressDiagramClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!drawing) return;
  let point = eventPoint(event);
  point = drawing.points.length ? orthogonal(drawing.points.at(-1)!, point) : nearestPointOnSelectedCircuit(point);
  const previous = drawing.points.at(-1);
  if (!previous || previous.x !== point.x || previous.y !== point.y) drawing.points.push(point);
  drawing.cursor = null;
  updatePreview();
  updateControls();
  if (event.detail > 1 && drawing.points.length >= 2) finishDrawing(true);
});

viewport.addEventListener("dblclick", (event) => event.preventDefault());

// Empêche WebView2 de zoomer toute l'interface : le pincement reste réservé
// à la vue du schéma et continue ensuite vers l'écouteur de la zone de travail.
document.addEventListener("wheel", (event) => {
  if (event.ctrlKey || event.metaKey) event.preventDefault();
}, { passive: false, capture: true });

viewport.addEventListener("wheel", (event) => {
  if (!hasPage()) return;
  event.preventDefault();
  const now = performance.now();
  if (now - lastWheelEventAt > 180) wheelGestureMode = null;
  lastWheelEventAt = now;

  if (event.ctrlKey || event.metaKey) {
    wheelGestureMode = "zoom";
    const exponent = Math.max(-0.6, Math.min(0.6, event.deltaY * 0.006));
    zoomAt(Math.exp(exponent), eventPoint(event));
  } else {
    const precisionScroll = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
      && (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 80 || !Number.isInteger(event.deltaY));
    wheelGestureMode ??= precisionScroll ? "pan" : "zoom";
    if (wheelGestureMode === "pan") panViewByClientDelta(event.deltaX, event.deltaY);
    else zoomAt(event.deltaY < 0 ? 0.86 : 1.16, eventPoint(event));
  }

  if (drawing) {
    drawing.cursor = null;
    updatePreview();
  }
}, { passive: false });

document.addEventListener("keydown", (event) => {
  const field = /^(INPUT|SELECT|TEXTAREA)$/.test((event.target as HTMLElement | null)?.tagName || "");
  const control = event.ctrlKey || event.metaKey;
  if (viewerFullscreen && event.key === "Escape") {
    event.preventDefault();
    void setViewerFullscreen(false);
  } else if (control && ["+", "-", "=", "0"].includes(event.key)) {
    event.preventDefault();
  } else if (control && event.key.toLocaleLowerCase() === "s") {
    event.preventDefault();
    void saveProject(event.shiftKey);
  } else if (!field && control && event.key.toLocaleLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if (!field && drawing && event.key === "Enter") {
    event.preventDefault();
    finishDrawing(false);
  } else if (!field && drawing && event.key === "Escape") {
    event.preventDefault();
    cancelDrawing();
  } else if (!field && drawing && event.key === "Backspace") {
    event.preventDefault();
    drawing.points.pop();
    updatePreview();
    updateControls();
  } else if (!field && !drawing && portionEditMode && event.key === "Escape") {
    event.preventDefault();
    selectTrace(null);
  } else if (!field && !drawing && portionEditMode && event.key === "Delete") {
    event.preventDefault();
    deleteSelectedTrace();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (shareSessionId && isTauri()) void invoke("stop_html_share", { sessionId: shareSessionId });
  releaseAndroidHotspot();
  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  void persistRecoverySession();
  if (!dirty) return;
  event.preventDefault();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void persistRecoverySession();
});

void initializeApplication().then(() => initializeAppUpdates());
