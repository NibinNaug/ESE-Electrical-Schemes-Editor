import type {
  Circuit,
  EseProject,
  Legend,
  LegendEntry,
  ProjectAssets,
  ProjectPage,
  SourceDocument
} from "./types";

type JsonRecord = Record<string, unknown>;

type EmbeddedPage = ProjectPage & { imageDataUrl: string };

type EmbeddedPayload = {
  format?: string;
  formatVersion?: number;
  project?: {
    projectId?: string;
    createdAt?: string;
    modifiedAt?: string;
    sources?: SourceDocument[];
    legends?: Legend[];
  };
  title: string;
  pages: EmbeddedPage[];
  initialPageId?: string;
  circuits: Circuit[];
  legendEntries: LegendEntry[];
};

export type OpenedHtmlProject = {
  project: EseProject;
  assets: ProjectAssets;
  initialPageId: string;
};

const record = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} absent ou invalide.`);
  return value;
};

const safeSegment = (value: string): string =>
  value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "element";

const extensionForMime = (mime: string): string => {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/bmp": "bmp"
  };
  return extensions[mime.toLowerCase()] || "img";
};

const decodeDataUrl = (value: string): { mime: string; bytes: Uint8Array } => {
  const match = /^data:([^;,]+)?((?:;[^,]*)*?),(.*)$/is.exec(value);
  if (!match) throw new Error("Une image embarquée dans le HTML est invalide.");
  const mime = (match[1] || "application/octet-stream").toLowerCase();
  if (!mime.startsWith("image/")) throw new Error(`Ressource HTML non graphique refusée : ${mime}.`);
  const base64 = /;base64(?:;|$)/i.test(match[2]);
  if (!base64) return { mime, bytes: new TextEncoder().encode(decodeURIComponent(match[3])) };
  let binary: string;
  try {
    binary = atob(match[3].replace(/\s+/g, ""));
  } catch {
    throw new Error("Une image Base64 du HTML est corrompue.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mime, bytes };
};

const validatePage = (value: unknown): EmbeddedPage => {
  const page = record(value);
  if (!page) throw new Error("Page HTML invalide.");
  const width = Number(page.width);
  const height = Number(page.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Dimensions de page HTML invalides.");
  }
  requiredString(page.id, "Identifiant de page");
  requiredString(page.sourceId, "Identifiant de source");
  requiredString(page.name, "Nom de page");
  requiredString(page.imageDataUrl, "Image de page");
  return page as unknown as EmbeddedPage;
};

const validatePayload = (value: unknown): EmbeddedPayload => {
  const payload = record(value);
  if (!payload) throw new Error("Données ESE absentes du HTML.");
  if (payload.format !== undefined && payload.format !== "ese-html-project") {
    throw new Error("Ce HTML n’est pas un export de projet ESE pris en charge.");
  }
  if (payload.formatVersion !== undefined && payload.formatVersion !== 1) {
    throw new Error("Cette version d’export HTML ESE n’est pas prise en charge.");
  }
  requiredString(payload.title, "Titre du projet HTML");
  if (!Array.isArray(payload.pages) || !payload.pages.length) throw new Error("Le HTML ESE ne contient aucune page.");
  if (!Array.isArray(payload.circuits) || !Array.isArray(payload.legendEntries)) {
    throw new Error("Annotations ESE absentes du HTML.");
  }
  for (const entry of payload.legendEntries) {
    const candidate = record(entry);
    if (!candidate || typeof candidate.id !== "string" || typeof candidate.legendId !== "string" || typeof candidate.reference !== "string" || typeof candidate.name !== "string" || !Array.isArray(candidate.markings)) {
      throw new Error("Un repère embarqué dans le HTML est invalide.");
    }
  }
  for (const circuit of payload.circuits) {
    const candidate = record(circuit);
    if (!candidate || typeof candidate.id !== "string" || typeof candidate.legendEntryId !== "string" || !Array.isArray(candidate.traces)) {
      throw new Error("Un circuit embarqué dans le HTML est invalide.");
    }
  }
  return {
    ...(payload as unknown as EmbeddedPayload),
    pages: payload.pages.map(validatePage)
  };
};

const extractPayloadText = (html: string): string => {
  const match = /<script\b[^>]*\bid=(?:"ese-data"|'ese-data')[^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  if (!match) throw new Error("Ce fichier HTML ne contient pas de projet ESE embarqué.");
  return match[1].trim();
};

const legacySources = (payload: EmbeddedPayload): SourceDocument[] => {
  const grouped = new Map<string, EmbeddedPage[]>();
  for (const page of payload.pages) {
    const sourceId = typeof page.sourceId === "string" && page.sourceId ? page.sourceId : `source-${page.id}`;
    page.sourceId = sourceId;
    const pages = grouped.get(sourceId);
    if (pages) pages.push(page);
    else grouped.set(sourceId, [page]);
  }
  return [...grouped].map(([id, pages], index) => ({
    id,
    name: pages.length === 1 ? pages[0].name : `Source HTML ${index + 1}`,
    originalName: `${payload.title}.html`,
    mime: pages[0].rendition?.mime || "image/png",
    pageIds: pages.map((page) => page.id)
  }));
};

export const openEseHtml = (html: string): OpenedHtmlProject => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractPayloadText(html));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Les données du projet ESE embarqué sont corrompues.");
    throw error;
  }
  const payload = validatePayload(parsed);
  const metadata = payload.project || {};
  const assets: ProjectAssets = new Map();
  const usedPaths = new Set<string>();
  const pages: ProjectPage[] = payload.pages.map((embeddedPage) => {
    const { imageDataUrl, ...page } = structuredClone(embeddedPage);
    const decoded = decodeDataUrl(imageDataUrl);
    let archivePath = page.rendition?.archivePath;
    if (!archivePath || usedPaths.has(archivePath)) {
      archivePath = `renditions/${safeSegment(page.sourceId)}/${safeSegment(page.id)}.${extensionForMime(decoded.mime)}`;
    }
    while (usedPaths.has(archivePath)) archivePath = `renditions/html/${safeSegment(page.id)}-${usedPaths.size}.${extensionForMime(decoded.mime)}`;
    usedPaths.add(archivePath);
    assets.set(archivePath, decoded.bytes);
    return {
      ...page,
      rendition: { kind: "image", mime: decoded.mime, archivePath }
    };
  });

  const pageIds = new Set(pages.map((page) => page.id));
  const sources = Array.isArray(metadata.sources) && metadata.sources.length
    ? structuredClone(metadata.sources).map(({ originalPath: _originalPath, ...source }) => ({
      ...source,
      pageIds: source.pageIds.filter((pageId) => pageIds.has(pageId))
    })).filter((source) => source.pageIds.length > 0)
    : legacySources(payload);
  const sourceIds = new Set(sources.map((source) => source.id));
  for (const page of pages) {
    if (sourceIds.has(page.sourceId)) continue;
    sources.push({
      id: page.sourceId,
      name: page.name,
      originalName: `${payload.title}.html`,
      mime: page.rendition.mime,
      pageIds: [page.id]
    });
    sourceIds.add(page.sourceId);
  }

  const legends = Array.isArray(metadata.legends) && metadata.legends.length
    ? structuredClone(metadata.legends).map((legend) =>
      legend.sourceId && !sourceIds.has(legend.sourceId)
        ? { id: legend.id, name: legend.name, scope: "project" as const }
        : legend
    )
    : [...new Set(payload.legendEntries.map((entry) => entry.legendId))].map((id) => ({
      id,
      name: "Repères importés du HTML",
      scope: "project" as const
    }));
  const now = new Date().toISOString();
  const project: EseProject = {
    format: "ese-project",
    formatVersion: 1,
    projectId: typeof metadata.projectId === "string" ? metadata.projectId : `project-html-${crypto.randomUUID()}`,
    title: payload.title,
    createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : now,
    modifiedAt: typeof metadata.modifiedAt === "string" ? metadata.modifiedAt : now,
    sources,
    pages,
    legends,
    legendEntries: structuredClone(payload.legendEntries),
    circuits: structuredClone(payload.circuits)
  };
  const initialPageId = typeof payload.initialPageId === "string" && pageIds.has(payload.initialPageId)
    ? payload.initialPageId
    : pages[0].id;
  return { project, assets, initialPageId };
};

export const openEseHtmlBytes = (bytes: Uint8Array): OpenedHtmlProject =>
  openEseHtml(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
