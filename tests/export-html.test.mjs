import assert from "node:assert/strict";
import test from "node:test";

import { createEseArchive, openEseArchive } from "../src/archive.ts";
import { createStandaloneHtml } from "../src/export-html.ts";
import { mergeCircuitsByReference } from "../src/project-normalization.ts";
import { imageBytes, imageDataUrl, page, project } from "./fixtures/synthetic-project.mjs";

test("l'export consultation reste autonome et non éditable", () => {
  const html = createStandaloneHtml(project, [{ page, imageDataUrl }], false);

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /"circuits":\[/);
  assert.match(html, /"id":"circuit-red"/);
  assert.doesNotMatch(html, /id="mode"/);
});

test("l'export modifiable conserve la sélection et le survol sans rerendu récursif", () => {
  const html = createStandaloneHtml(project, [{ page, imageDataUrl }], true);

  assert.match(html, /id="mode"/);
  assert.match(html, /function setHover\(id\)/);
  assert.match(html, /g\.dataset\.cid=c\.id/);
  assert.match(html, /row\.dataset\.cid=c\.id/);
  assert.match(html, /svg\.getScreenCTM\(\)/);
  assert.match(html, /matrixTransform\(m\.inverse\(\)\)/);
  assert.doesNotMatch(html, /onpointerenter=\(\)=>\{[^}]*render\(\)/);
  assert.match(html, /if\(e\.detail>1\)end\(true\)/);
  assert.match(html, /JSON\.stringify\(data\)\.replaceAll\("<","\\\\u003c"\)/);
  assert.match(html, /\.hit\{[^}]*vector-effect:non-scaling-stroke/);
  assert.doesNotMatch(html, /\.wire path\{[^}]*vector-effect:non-scaling-stroke/);
});

test("l'export HTML multipage embarque la navigation et toutes les images", () => {
  const secondPage = {
    ...page,
    id: "page-physique-111",
    name: "Page PDF 111",
    sourcePageNumber: 111,
    rendition: { ...page.rendition, archivePath: "renditions/test/page-0111.png" },
    view: { x: 240, y: 160, width: 1200, height: 800 }
  };
  const html = createStandaloneHtml(
    { ...project, pages: [page, secondPage] },
    [
      { page, imageDataUrl },
      { page: secondPage, imageDataUrl: "data:image/png;base64,cGFnZTExMQ==" }
    ],
    false,
    secondPage.id
  );

  assert.match(html, /id="page-select"/);
  assert.match(html, /Page PDF 111/);
  assert.match(html, /data:image\/png;base64,cGFnZTExMQ==/);
  assert.match(html, /function showPage\(id\)/);
  assert.match(html, /viewBox="240 160 1200 800"/);
  assert.match(html, /view=pageView\(next\);applyView\(\)/);
  assert.match(html, /id="fit-view"/);
  const runtime = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(runtime);
  assert.doesNotThrow(() => new Function(runtime));
});

test("un projet .ese effectue un aller-retour ZIP sans perte", () => {
  const assetPath = page.rendition.archivePath;
  const assets = new Map([[assetPath, new Uint8Array(imageBytes)]]);
  const pageView = { x: 420, y: 210, width: 1600, height: 900 };
  const projectWithView = {
    ...project,
    pages: [{ ...page, view: pageView }]
  };
  const archive = createEseArchive(projectWithView, assets);
  const reopened = openEseArchive(archive);

  assert.equal(reopened.project.projectId, project.projectId);
  assert.equal(reopened.project.circuits.length, 4);
  assert.equal(reopened.project.legendEntries.length, 3);
  assert.deepEqual(reopened.project.pages[0].view, pageView);
  assert.deepEqual(reopened.assets.get(assetPath), assets.get(assetPath));
});

test("un PDF importé n'embarque que ses rendus PNG dans le .ese", () => {
  const pdfPage = {
    ...page,
    id: "pdf-page-111",
    sourceId: "pdf-source",
    name: "Page PDF 111",
    sourcePageNumber: 111,
    rendition: { kind: "image", mime: "image/png", archivePath: "renditions/pdf-source/page-0111.png" }
  };
  const pdfProject = {
    ...project,
    sources: [{
      id: "pdf-source",
      name: "manuel.pdf",
      originalName: "manuel.pdf",
      mime: "application/pdf",
      pageIds: [pdfPage.id]
    }],
    pages: [pdfPage],
    circuits: []
  };
  const png = new Uint8Array(imageBytes);
  const archive = createEseArchive(pdfProject, new Map([[pdfPage.rendition.archivePath, png]]));
  const reopened = openEseArchive(archive);

  assert.equal(reopened.project.sources[0].originalPath, undefined);
  assert.deepEqual(reopened.assets.get(pdfPage.rendition.archivePath), png);
  assert.equal(reopened.assets.size, 1);
});

test("un repère devient un circuit logique unique malgré des portions disjointes", () => {
  const normalized = mergeCircuitsByReference(project);
  const ygrEntry = normalized.legendEntries.find((entry) => entry.reference === "Y/GR");
  const ygrCircuits = normalized.circuits.filter(
    (circuit) => circuit.legendEntryId === ygrEntry.id
  );

  assert.equal(normalized.circuits.length, 3);
  assert.equal(ygrCircuits.length, 1);
  assert.equal(ygrCircuits[0].name, "Circuit Y/GR");
  assert.deepEqual(ygrCircuits[0].traces.map((trace) => trace.id), [
    "trace-ygr-1", "trace-ygr-2", "trace-ygr-3"
  ]);
});

test("les repères couleur composée et numérique restent distincts", () => {
  const normalized = mergeCircuitsByReference(project);
  const ygr = normalized.legendEntries.find((entry) => entry.reference === "Y/GR");
  const numbered = normalized.legendEntries.find((entry) => entry.reference === "15");

  assert.deepEqual(ygr.highlight, { colors: ["#facc15", "#16a34a"], pattern: "striped" });
  assert.deepEqual(numbered.markings, [{ type: "number", value: "15" }]);
  assert.notEqual(ygr.id, numbered.id);
});

test("les portions restent présentes dans tous les circuits normalisés", () => {
  const normalized = mergeCircuitsByReference(project);
  const expectedTraceCounts = new Map([
    ["R", 2], ["Y/GR", 3], ["15", 1]
  ]);

  assert.equal(normalized.circuits.length, expectedTraceCounts.size);
  for (const [reference, expectedCount] of expectedTraceCounts) {
    const entry = normalized.legendEntries.find((candidate) => candidate.reference === reference);
    const circuits = normalized.circuits.filter((circuit) => circuit.legendEntryId === entry.id);
    assert.equal(circuits.length, 1, `${reference} doit rester un circuit logique unique`);
    assert.equal(circuits[0].traces.length, expectedCount, `${reference} a perdu une reprise de repere`);
  }

  const allTraceIds = normalized.circuits.flatMap((circuit) => circuit.traces.map((trace) => trace.id));
  assert.deepEqual(allTraceIds.sort(), project.circuits.flatMap((circuit) => circuit.traces.map((trace) => trace.id)).sort());
});
