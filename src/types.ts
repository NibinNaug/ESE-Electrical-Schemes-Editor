export type Point = { x: number; y: number };

export type ColorMarking = {
  type: "color";
  code?: string;
  bands: string[];
};

export type TextMarking = {
  type: "number" | "text";
  value: string;
};

export type Marking = ColorMarking | TextMarking;

export type HighlightStyle = {
  colors: string[];
  pattern: "solid" | "striped";
};

export type LegendEntry = {
  id: string;
  legendId: string;
  reference: string;
  name: string;
  markings: Marking[];
  highlight: HighlightStyle;
};

export type Legend = {
  id: string;
  name: string;
  scope: "project" | "source";
  sourceId?: string;
};

export type Trace = {
  id: string;
  pageId: string;
  points: Point[];
  markingsOverride?: Marking[];
};

export type Circuit = {
  id: string;
  legendEntryId: string;
  name: string;
  referenceOverride?: string;
  traces: Trace[];
};

export type SourceDocument = {
  id: string;
  name: string;
  originalName: string;
  mime: string;
  originalPath?: string;
  pageIds: string[];
};

export type PageRendition = {
  kind: "image" | "tile-pyramid";
  mime: string;
  archivePath: string;
};

export type PageView = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProjectPage = {
  id: string;
  sourceId: string;
  name: string;
  sourcePageNumber?: number;
  width: number;
  height: number;
  view?: PageView;
  rendition: PageRendition;
};

export type EseProject = {
  format: "ese-project";
  formatVersion: 1;
  projectId: string;
  title: string;
  createdAt: string;
  modifiedAt: string;
  sources: SourceDocument[];
  pages: ProjectPage[];
  legends: Legend[];
  legendEntries: LegendEntry[];
  circuits: Circuit[];
};

export type ProjectAssets = Map<string, Uint8Array>;

export const cloneProject = (project: EseProject): EseProject =>
  structuredClone(project);

export const makeId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID()}`;

export const getLegendEntry = (
  project: EseProject,
  circuit: Circuit | null
): LegendEntry | null =>
  circuit
    ? project.legendEntries.find((entry) => entry.id === circuit.legendEntryId) ?? null
    : null;

export const getCircuitReference = (
  project: EseProject,
  circuit: Circuit
): string =>
  circuit.referenceOverride || getLegendEntry(project, circuit)?.reference || "—";
