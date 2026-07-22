import assert from "node:assert/strict";
import test from "node:test";

import { countPageTraces, removeProjectPage } from "../src/project-pages.ts";

const project = {
  format: "ese-project",
  formatVersion: 1,
  projectId: "project",
  title: "Test",
  createdAt: "2026-07-21T00:00:00.000Z",
  modifiedAt: "2026-07-21T00:00:00.000Z",
  sources: [
    { id: "source-a", name: "A", originalName: "a.pdf", mime: "application/pdf", pageIds: ["page-a"] },
    { id: "source-b", name: "B", originalName: "b.png", mime: "image/png", originalPath: "b.png", pageIds: ["page-b"] }
  ],
  pages: [
    { id: "page-a", sourceId: "source-a", name: "Page A", width: 100, height: 100, rendition: { kind: "image", mime: "image/png", archivePath: "a.png" } },
    { id: "page-b", sourceId: "source-b", name: "Page B", width: 100, height: 100, rendition: { kind: "image", mime: "image/png", archivePath: "b.png" } }
  ],
  legends: [{ id: "legend", name: "Repères", scope: "source", sourceId: "source-a" }],
  legendEntries: [{ id: "entry", legendId: "legend", reference: "R", name: "Rouge", markings: [], highlight: { colors: ["#f00"], pattern: "solid" } }],
  circuits: [
    { id: "circuit-a", legendEntryId: "entry", name: "Circuit A", traces: [
      { id: "trace-a", pageId: "page-a", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { id: "trace-b", pageId: "page-b", points: [{ x: 0, y: 1 }, { x: 10, y: 1 }] }
    ] },
    { id: "circuit-empty", legendEntryId: "entry", name: "Circuit vide", traces: [
      { id: "trace-only-a", pageId: "page-a", points: [{ x: 0, y: 2 }, { x: 10, y: 2 }] }
    ] }
  ]
};

test("supprimer une page retire seulement ses portions et conserve les circuits", () => {
  assert.equal(countPageTraces(project, "page-a"), 2);
  const removed = removeProjectPage(project, "page-a");

  assert.equal(removed.removedTraceCount, 2);
  assert.equal(removed.removedSourceCount, 1);
  assert.equal(removed.nextPageId, "page-b");
  assert.deepEqual(removed.project.pages.map((page) => page.id), ["page-b"]);
  assert.deepEqual(removed.project.sources.map((source) => source.id), ["source-b"]);
  assert.equal(removed.project.circuits.length, 2);
  assert.deepEqual(removed.project.circuits[0].traces.map((trace) => trace.id), ["trace-b"]);
  assert.deepEqual(removed.project.circuits[1].traces, []);
  assert.deepEqual(removed.project.legends[0], { id: "legend", name: "Repères", scope: "project" });
  assert.equal(project.pages.length, 2, "le projet source ne doit pas être muté");
});

test("la dernière page du projet est protégée", () => {
  const onePageProject = { ...project, pages: [project.pages[0]] };
  assert.throws(() => removeProjectPage(onePageProject, "page-a"), /dernière page/);
});
