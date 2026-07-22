import type { EseProject } from "./types";

export type PageRemovalResult = {
  project: EseProject;
  nextPageId: string;
  removedTraceCount: number;
  removedSourceCount: number;
};

export const countPageTraces = (project: EseProject, pageId: string): number =>
  project.circuits.reduce(
    (total, circuit) => total + circuit.traces.filter((trace) => trace.pageId === pageId).length,
    0
  );

export const removeProjectPage = (project: EseProject, pageId: string): PageRemovalResult => {
  if (project.pages.length <= 1) throw new Error("La dernière page du projet ne peut pas être supprimée.");
  const pageIndex = project.pages.findIndex((page) => page.id === pageId);
  if (pageIndex < 0) throw new Error("Page introuvable.");

  const nextProject = structuredClone(project);
  const removedTraceCount = countPageTraces(nextProject, pageId);
  nextProject.pages = nextProject.pages.filter((page) => page.id !== pageId);
  nextProject.circuits = nextProject.circuits.map((circuit) => ({
    ...circuit,
    traces: circuit.traces.filter((trace) => trace.pageId !== pageId)
  }));
  nextProject.sources = nextProject.sources.map((source) => ({
    ...source,
    pageIds: source.pageIds.filter((candidate) => candidate !== pageId)
  }));

  const removedSourceIds = new Set(
    nextProject.sources.filter((source) => !source.pageIds.length).map((source) => source.id)
  );
  nextProject.sources = nextProject.sources.filter((source) => source.pageIds.length > 0);
  nextProject.legends = nextProject.legends.map((legend) =>
    legend.sourceId && removedSourceIds.has(legend.sourceId)
      ? { id: legend.id, name: legend.name, scope: "project" }
      : legend
  );

  const nextPage = nextProject.pages[Math.min(pageIndex, nextProject.pages.length - 1)];
  return {
    project: nextProject,
    nextPageId: nextPage.id,
    removedTraceCount,
    removedSourceCount: removedSourceIds.size
  };
};
