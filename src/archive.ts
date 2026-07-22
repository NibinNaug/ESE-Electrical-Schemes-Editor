import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Circuit, EseProject, ProjectAssets } from "./types";

const MIME = "application/vnd.ese.project+zip";

type ArchiveManifest = {
  format: "ese-project";
  formatVersion: 1;
  generator: string;
  project: Omit<EseProject, "circuits">;
  annotationsPath: string;
};

type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const createEseArchive = (
  project: EseProject,
  assets: ProjectAssets,
  compressionLevel: CompressionLevel = 6
): Uint8Array => {
  const { circuits, ...projectWithoutCircuits } = project;
  const manifest: ArchiveManifest = {
    format: "ese-project",
    formatVersion: 1,
    generator: "ESE 0.1.0",
    project: projectWithoutCircuits,
    annotationsPath: "annotations/circuits.json"
  };

  const files: Record<string, Uint8Array> = {
    mimetype: strToU8(MIME),
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "annotations/circuits.json": strToU8(JSON.stringify(circuits, null, 2))
  };

  const referencedPaths = new Set([
    ...project.sources.flatMap((source) => source.originalPath ? [source.originalPath] : []),
    ...project.pages.map((page) => page.rendition.archivePath)
  ]);
  for (const path of referencedPaths) {
    const bytes = assets.get(path);
    if (!bytes) throw new Error(`Ressource absente : ${path}`);
    files[path] = bytes;
  }
  return zipSync(files, { level: compressionLevel });
};

const parseJson = <T>(files: Record<string, Uint8Array>, path: string): T => {
  const bytes = files[path];
  if (!bytes) throw new Error(`Entrée absente de l’archive : ${path}`);
  return JSON.parse(strFromU8(bytes)) as T;
};

export const openEseArchive = (
  bytes: Uint8Array
): { project: EseProject; assets: ProjectAssets } => {
  const files = unzipSync(bytes);
  const manifest = parseJson<ArchiveManifest>(files, "manifest.json");

  if (manifest.format !== "ese-project" || manifest.formatVersion !== 1) {
    throw new Error("Cette version du format ESE n’est pas prise en charge.");
  }

  const circuits = parseJson<Circuit[]>(files, manifest.annotationsPath);
  const project: EseProject = { ...manifest.project, circuits };
  const assets: ProjectAssets = new Map();

  for (const source of project.sources) {
    if (!source.originalPath) continue;
    const original = files[source.originalPath];
    if (original) assets.set(source.originalPath, original);
  }
  for (const page of project.pages) {
    const rendition = files[page.rendition.archivePath];
    if (!rendition) {
      throw new Error(`Rendu absent : ${page.rendition.archivePath}`);
    }
    assets.set(page.rendition.archivePath, rendition);
  }

  return { project, assets };
};

export const downloadBytes = (
  filename: string,
  bytes: Uint8Array,
  mime = "application/octet-stream"
): void => {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadText = (
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8"
): void => downloadBytes(filename, strToU8(text), mime);
