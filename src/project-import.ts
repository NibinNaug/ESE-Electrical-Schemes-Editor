import type { Circuit, EseProject, LegendEntry, ProjectAssets, SourceDocument } from "./types";

const makeId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

export type ProjectMergeResult = {
  project: EseProject;
  assets: ProjectAssets;
  importedPageIds: string[];
  importedCircuitCount: number;
};

const referenceKey = (value: string): string => value.trim().toLocaleUpperCase();

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

const inferredReference = (circuit: Circuit): string => {
  if (circuit.referenceOverride?.trim()) return circuit.referenceOverride.trim();
  const withoutPrefix = circuit.name.replace(/^Circuit\s+/i, "").trim();
  return withoutPrefix.replace(/\s+\d+$/, "").trim() || circuit.legendEntryId;
};

export const mergeImportedProject = (
  target: EseProject,
  targetAssets: ProjectAssets,
  incoming: EseProject,
  incomingAssets: ProjectAssets
): ProjectMergeResult => {
  const next = structuredClone(target);
  const assets: ProjectAssets = new Map(targetAssets);
  const sourceIds = new Map<string, string>();
  const pageIds = new Map<string, string>();
  const legendIds = new Map<string, string>();
  const entryIds = new Map<string, string>();
  const importedPageIds: string[] = [];

  const importedSources = new Map<string, SourceDocument>();
  const addSource = (sourceId: string, source?: SourceDocument): string => {
    const existing = sourceIds.get(sourceId);
    if (existing) return existing;
    const id = makeId("source");
    const imported: SourceDocument = {
      id,
      name: source?.name || "Source HTML importée",
      originalName: source?.originalName || "export-ESE.html",
      mime: source?.mime || "text/html",
      pageIds: []
    };
    sourceIds.set(sourceId, id);
    importedSources.set(id, imported);
    next.sources.push(imported);
    return id;
  };

  for (const source of incoming.sources) addSource(source.id, source);
  for (const incomingPage of incoming.pages) {
    const source = incoming.sources.find((candidate) => candidate.id === incomingPage.sourceId);
    const sourceId = addSource(incomingPage.sourceId, source);
    const pageId = makeId("page");
    const bytes = incomingAssets.get(incomingPage.rendition.archivePath);
    if (!bytes) throw new Error(`Image absente de la page HTML « ${incomingPage.name} ».`);
    const archivePath = `renditions/${sourceId}/${pageId}.${extensionForMime(incomingPage.rendition.mime)}`;
    pageIds.set(incomingPage.id, pageId);
    importedPageIds.push(pageId);
    importedSources.get(sourceId)!.pageIds.push(pageId);
    next.pages.push({
      ...structuredClone(incomingPage),
      id: pageId,
      sourceId,
      rendition: { ...incomingPage.rendition, archivePath }
    });
    assets.set(archivePath, new Uint8Array(bytes));
  }

  const ensureLegend = (incomingLegendId: string): string => {
    const mapped = legendIds.get(incomingLegendId);
    if (mapped) return mapped;
    const source = incoming.legends.find((legend) => legend.id === incomingLegendId);
    const id = makeId("legend");
    const sourceId = source?.sourceId ? sourceIds.get(source.sourceId) : undefined;
    next.legends.push(source
      ? {
        ...structuredClone(source),
        id,
        scope: source.scope === "source" && sourceId ? "source" : "project",
        ...(source.scope === "source" && sourceId ? { sourceId } : { sourceId: undefined })
      }
      : { id, name: "Repères importés du HTML", scope: "project" });
    legendIds.set(incomingLegendId, id);
    return id;
  };

  const entriesByReference = new Map(
    next.legendEntries.map((entry) => [referenceKey(entry.reference), entry])
  );
  for (const incomingEntry of incoming.legendEntries) {
    const existing = entriesByReference.get(referenceKey(incomingEntry.reference));
    if (existing) {
      entryIds.set(incomingEntry.id, existing.id);
      continue;
    }
    const imported: LegendEntry = {
      ...structuredClone(incomingEntry),
      id: makeId("repere"),
      legendId: ensureLegend(incomingEntry.legendId)
    };
    next.legendEntries.push(imported);
    entriesByReference.set(referenceKey(imported.reference), imported);
    entryIds.set(incomingEntry.id, imported.id);
  }

  const projectLegend = (): string => {
    const existing = next.legends.find((legend) => legend.scope === "project");
    if (existing) return existing.id;
    const id = makeId("legend");
    next.legends.push({ id, name: "Repères importés", scope: "project" });
    return id;
  };

  const ensureCircuitEntry = (circuit: Circuit): string => {
    const mapped = entryIds.get(circuit.legendEntryId);
    if (mapped) return mapped;
    const reference = inferredReference(circuit);
    const existing = entriesByReference.get(referenceKey(reference));
    if (existing) return existing.id;
    const entry: LegendEntry = {
      id: makeId("repere"),
      legendId: projectLegend(),
      reference,
      name: reference,
      markings: [{ type: "text", value: reference }],
      highlight: { colors: ["#e93478"], pattern: "solid" }
    };
    next.legendEntries.push(entry);
    entriesByReference.set(referenceKey(reference), entry);
    return entry.id;
  };

  const importedCircuits = incoming.circuits.map((circuit) => ({
    ...structuredClone(circuit),
    id: makeId("circuit"),
    legendEntryId: ensureCircuitEntry(circuit),
    traces: circuit.traces.flatMap((trace) => {
      const pageId = pageIds.get(trace.pageId);
      return pageId
        ? [{ ...structuredClone(trace), id: makeId("trace"), pageId }]
        : [];
    })
  }));
  next.circuits.push(...importedCircuits);
  next.modifiedAt = new Date().toISOString();

  return {
    project: next,
    assets,
    importedPageIds,
    importedCircuitCount: importedCircuits.length
  };
};
