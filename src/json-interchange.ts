import type { Circuit, EseProject, LegendEntry, Point, ProjectPage } from "./types";

const makeId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

type PageDescriptor = Pick<ProjectPage, "id" | "name" | "sourcePageNumber" | "width" | "height">;

export type EseAnnotationsPayload = {
  format: "ese-annotations";
  formatVersion: 1;
  generator: string;
  sourceProjectId: string;
  title: string;
  exportedAt: string;
  pages: PageDescriptor[];
  legendEntries: LegendEntry[];
  circuits: Circuit[];
};

type ParsedAnnotations = {
  pages: PageDescriptor[];
  legendEntries: LegendEntry[];
  circuits: Circuit[];
  legacy: boolean;
};

type PageMapping = { pageId: string; scaleX: number; scaleY: number };

export type AnnotationImportResult = {
  project: EseProject;
  importedCircuitCount: number;
  importedTraceCount: number;
  mappedPageCount: number;
  legacy: boolean;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const validPoint = (value: unknown): value is Point => {
  const point = record(value);
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
};

const validateCircuits = (value: unknown): Circuit[] => {
  if (!Array.isArray(value)) throw new Error("La liste des circuits JSON est absente.");
  return value.map((candidate, circuitIndex) => {
    const circuit = record(candidate);
    if (!circuit || typeof circuit.id !== "string" || typeof circuit.legendEntryId !== "string" || typeof circuit.name !== "string" || !Array.isArray(circuit.traces)) {
      throw new Error(`Circuit JSON ${circuitIndex + 1} invalide.`);
    }
    const traces = circuit.traces.map((traceCandidate, traceIndex) => {
      const trace = record(traceCandidate);
      if (!trace || typeof trace.id !== "string" || typeof trace.pageId !== "string" || !Array.isArray(trace.points) || trace.points.length < 2 || !trace.points.every(validPoint)) {
        throw new Error(`Tracé JSON ${traceIndex + 1} du circuit ${circuitIndex + 1} invalide.`);
      }
      return trace as unknown as Circuit["traces"][number];
    });
    return { ...(circuit as unknown as Circuit), traces };
  });
};

const validateEntries = (value: unknown): LegendEntry[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("La liste des repères JSON est invalide.");
  return value.map((candidate, index) => {
    const entry = record(candidate);
    if (!entry || typeof entry.id !== "string" || typeof entry.reference !== "string" || typeof entry.name !== "string" || !Array.isArray(entry.markings)) {
      throw new Error(`Repère JSON ${index + 1} invalide.`);
    }
    return entry as unknown as LegendEntry;
  });
};

const validatePages = (value: unknown): PageDescriptor[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("La description des pages JSON est invalide.");
  return value.map((candidate, index) => {
    const page = record(candidate);
    if (!page || typeof page.id !== "string" || typeof page.name !== "string" || !Number.isFinite(page.width) || !Number.isFinite(page.height)) {
      throw new Error(`Page JSON ${index + 1} invalide.`);
    }
    return page as unknown as PageDescriptor;
  });
};

export const createAnnotationsJson = (project: EseProject): string => {
  const payload: EseAnnotationsPayload = {
    format: "ese-annotations",
    formatVersion: 1,
    generator: "ESE 0.1.0",
    sourceProjectId: project.projectId,
    title: project.title,
    exportedAt: new Date().toISOString(),
    pages: project.pages.map(({ id, name, sourcePageNumber, width, height }) => ({
      id,
      name,
      ...(sourcePageNumber === undefined ? {} : { sourcePageNumber }),
      width,
      height
    })),
    legendEntries: structuredClone(project.legendEntries),
    circuits: structuredClone(project.circuits)
  };
  return JSON.stringify(payload, null, 2);
};

export const parseAnnotationsJson = (text: string): ParsedAnnotations => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Le fichier JSON est invalide.");
  }
  if (Array.isArray(parsed)) {
    return { pages: [], legendEntries: [], circuits: validateCircuits(parsed), legacy: true };
  }
  const payload = record(parsed);
  if (!payload) throw new Error("Le contenu JSON n’est pas un échange ESE.");
  if (payload.format !== "ese-annotations" || payload.formatVersion !== 1) {
    throw new Error("Cette version du format d’annotations JSON ESE n’est pas prise en charge.");
  }
  return {
    pages: validatePages(payload.pages),
    legendEntries: validateEntries(payload.legendEntries),
    circuits: validateCircuits(payload.circuits),
    legacy: false
  };
};

const referenceKey = (value: string): string => value.trim().toLocaleUpperCase();

const inferredReference = (circuit: Circuit): string => {
  if (circuit.referenceOverride?.trim()) return circuit.referenceOverride.trim();
  return circuit.name.replace(/^Circuit\s+/i, "").replace(/\s+\d+$/, "").trim() || circuit.legendEntryId;
};

const scaleFor = (source: PageDescriptor | undefined, target: ProjectPage): PageMapping => ({
  pageId: target.id,
  scaleX: source?.width ? target.width / source.width : 1,
  scaleY: source?.height ? target.height / source.height : 1
});

const mapPages = (
  annotations: ParsedAnnotations,
  target: EseProject,
  currentPageId: string
): Map<string, PageMapping> => {
  const referencedIds = [...new Set(annotations.circuits.flatMap((circuit) => circuit.traces.map((trace) => trace.pageId)))];
  const mapping = new Map<string, PageMapping>();
  const descriptors = new Map(annotations.pages.map((page) => [page.id, page]));
  const usedTargets = new Set<string>();

  for (const sourceId of referencedIds) {
    const direct = target.pages.find((page) => page.id === sourceId);
    if (!direct) continue;
    mapping.set(sourceId, scaleFor(descriptors.get(sourceId), direct));
    usedTargets.add(direct.id);
  }

  for (const sourceId of referencedIds) {
    if (mapping.has(sourceId)) continue;
    const source = descriptors.get(sourceId);
    if (!source) continue;
    const candidates = target.pages.filter((page) => {
      if (usedTargets.has(page.id)) return false;
      if (source.sourcePageNumber !== undefined && page.sourcePageNumber === source.sourcePageNumber) return true;
      return page.width === source.width && page.height === source.height && page.name === source.name;
    });
    if (candidates.length !== 1) continue;
    mapping.set(sourceId, scaleFor(source, candidates[0]));
    usedTargets.add(candidates[0].id);
  }

  if (referencedIds.some((id) => !mapping.has(id)) && annotations.pages.length === target.pages.length) {
    for (let index = 0; index < annotations.pages.length; index += 1) {
      const source = annotations.pages[index];
      if (mapping.has(source.id)) continue;
      const destination = target.pages[index];
      if (usedTargets.has(destination.id)) continue;
      mapping.set(source.id, scaleFor(source, destination));
      usedTargets.add(destination.id);
    }
  }

  const remaining = referencedIds.filter((id) => !mapping.has(id));
  if (remaining.length === 1) {
    const active = target.pages.find((page) => page.id === currentPageId && !usedTargets.has(page.id));
    const unused = target.pages.filter((page) => !usedTargets.has(page.id));
    const destination = active || (unused.length === 1 ? unused[0] : mapping.size === 0 ? target.pages[0] : undefined);
    if (destination) mapping.set(remaining[0], scaleFor(descriptors.get(remaining[0]), destination));
  }
  const unresolved = referencedIds.filter((id) => !mapping.has(id));
  if (unresolved.length) {
    throw new Error(`Impossible d’associer ${unresolved.length} page${unresolved.length > 1 ? "s" : ""} du JSON au projet actuel.`);
  }
  return mapping;
};

export const importAnnotationsJson = (
  target: EseProject,
  currentPageId: string,
  text: string
): AnnotationImportResult => {
  if (!target.pages.length) throw new Error("Importe d’abord une page avant d’ajouter des annotations JSON.");
  const annotations = parseAnnotationsJson(text);
  if (!annotations.circuits.length) throw new Error("Le JSON ne contient aucun circuit à importer.");
  const mapping = mapPages(annotations, target, currentPageId);
  const next = structuredClone(target);
  const entriesById = new Map(next.legendEntries.map((entry) => [entry.id, entry]));
  const entriesByReference = new Map(next.legendEntries.map((entry) => [referenceKey(entry.reference), entry]));
  const importedEntries = new Map(annotations.legendEntries.map((entry) => [entry.id, entry]));
  const mappedEntryIds = new Map<string, string>();
  let projectLegendId = next.legends.find((legend) => legend.scope === "project")?.id;
  const ensureProjectLegend = (): string => {
    if (projectLegendId) return projectLegendId;
    projectLegendId = makeId("legend");
    next.legends.push({ id: projectLegendId, name: "Repères importés du JSON", scope: "project" });
    return projectLegendId;
  };

  const entryFor = (circuit: Circuit): string => {
    const known = mappedEntryIds.get(circuit.legendEntryId);
    if (known) return known;
    if (annotations.legacy) {
      const exact = entriesById.get(circuit.legendEntryId);
      if (exact) return exact.id;
    }
    const imported = importedEntries.get(circuit.legendEntryId);
    const reference = imported?.reference || inferredReference(circuit);
    const sameReference = entriesByReference.get(referenceKey(reference));
    if (sameReference) {
      mappedEntryIds.set(circuit.legendEntryId, sameReference.id);
      return sameReference.id;
    }
    const entry: LegendEntry = imported
      ? { ...structuredClone(imported), id: makeId("repere"), legendId: ensureProjectLegend() }
      : {
        id: makeId("repere"),
        legendId: ensureProjectLegend(),
        reference,
        name: reference,
        markings: [{ type: "text", value: reference }],
        highlight: { colors: ["#e93478"], pattern: "solid" }
      };
    next.legendEntries.push(entry);
    entriesByReference.set(referenceKey(entry.reference), entry);
    mappedEntryIds.set(circuit.legendEntryId, entry.id);
    return entry.id;
  };

  let importedTraceCount = 0;
  const circuits = annotations.circuits.map((circuit) => ({
    ...structuredClone(circuit),
    id: makeId("circuit"),
    legendEntryId: entryFor(circuit),
    traces: circuit.traces.map((trace) => {
      const page = mapping.get(trace.pageId)!;
      importedTraceCount += 1;
      return {
        ...structuredClone(trace),
        id: makeId("trace"),
        pageId: page.pageId,
        points: trace.points.map((point) => ({
          x: Math.round(point.x * page.scaleX * 1000) / 1000,
          y: Math.round(point.y * page.scaleY * 1000) / 1000
        }))
      };
    })
  }));
  next.circuits.push(...circuits);
  next.modifiedAt = new Date().toISOString();

  return {
    project: next,
    importedCircuitCount: circuits.length,
    importedTraceCount,
    mappedPageCount: new Set([...mapping.values()].map((page) => page.pageId)).size,
    legacy: annotations.legacy
  };
};
