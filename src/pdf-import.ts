import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfAssetUrl = (folder: string): string =>
  new URL(`pdfjs/${folder}/`, document.baseURI).href;

export type PdfDocument = Pick<PDFDocumentProxy, "numPages" | "getPage"> & {
  destroy: () => Promise<void>;
};

export type RenderedPdfPage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

const canvasToPng = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("La conversion PNG de la page a \u00e9chou\u00e9."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });

export const openPdfDocument = async (bytes: Uint8Array): Promise<PdfDocument> => {
  // PDF.js transf\u00e8re les donn\u00e9es au worker. La copie pr\u00e9serve les octets originaux
  // destin\u00e9s \u00e0 l'archive .ese.
  const loadingTask = getDocument({
    data: bytes.slice(),
    cMapUrl: pdfAssetUrl("cmaps"),
    cMapPacked: true,
    iccUrl: pdfAssetUrl("iccs"),
    standardFontDataUrl: pdfAssetUrl("standard_fonts"),
    wasmUrl: pdfAssetUrl("wasm")
  });
  const document = await loadingTask.promise;
  return {
    numPages: document.numPages,
    getPage: document.getPage.bind(document),
    destroy: () => loadingTask.destroy()
  };
};

export const renderPdfThumbnail = async (
  document: PdfDocument,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  maxWidth = 176
): Promise<void> => {
  const pdfPage = await document.getPage(pageNumber);
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const viewport = pdfPage.getViewport({ scale: maxWidth / baseViewport.width });
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D indisponible.");
  await pdfPage.render({ canvas, canvasContext: context, viewport, background: "#ffffff" }).promise;
  pdfPage.cleanup();
};

export const renderPdfPageToPng = async (
  document: PdfDocument,
  pageNumber: number,
  dpi = 200
): Promise<RenderedPdfPage> => {
  const pdfPage = await document.getPage(pageNumber);
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const requestedScale = dpi / 72;
  const maxSideScale = 8192 / Math.max(baseViewport.width, baseViewport.height);
  const maxPixelScale = Math.sqrt(24_000_000 / (baseViewport.width * baseViewport.height));
  const scale = Math.min(requestedScale, maxSideScale, maxPixelScale);
  const viewport = pdfPage.getViewport({ scale });
  const canvas = documentOwnerCanvas();
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D indisponible.");
  await pdfPage.render({ canvas, canvasContext: context, viewport, background: "#ffffff" }).promise;
  const bytes = await canvasToPng(canvas);
  const rendered = { bytes, width: canvas.width, height: canvas.height };
  canvas.width = 1;
  canvas.height = 1;
  pdfPage.cleanup();
  return rendered;
};

const documentOwnerCanvas = (): HTMLCanvasElement => document.createElement("canvas");
