import type { EseProject } from "./types";

const makeProjectId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

export const createBlankProject = (title = "Projet sans titre"): EseProject => {
  const now = new Date().toISOString();
  return {
    format: "ese-project",
    formatVersion: 1,
    projectId: makeProjectId("project"),
    title,
    createdAt: now,
    modifiedAt: now,
    sources: [],
    pages: [],
    legends: [{ id: makeProjectId("legend"), name: "Repères du projet", scope: "project" }],
    legendEntries: [],
    circuits: []
  };
};
