import assert from "node:assert/strict";
import test from "node:test";

import { createEseArchive, openEseArchive } from "../src/archive.ts";
import { createStandaloneHtml } from "../src/export-html.ts";
import { openEseHtml } from "../src/html-project.ts";
import { createAnnotationsJson, importAnnotationsJson, parseAnnotationsJson } from "../src/json-interchange.ts";
import { createBlankProject } from "../src/project-factory.ts";
import { mergeImportedProject } from "../src/project-import.ts";
import { mergeCircuitsByReference } from "../src/project-normalization.ts";
import { imageBytes, imageDataUrl, page, project } from "./fixtures/synthetic-project.mjs";

test("un HTML ESE recrée un projet complet enregistrable en .ese", () => {
  const html = createStandaloneHtml(project, [{ page, imageDataUrl }], false, page.id);
  const opened = openEseHtml(html);

  assert.equal(opened.project.format, "ese-project");
  assert.equal(opened.project.projectId, project.projectId);
  assert.equal(opened.project.title, project.title);
  assert.equal(opened.project.pages.length, 1);
  assert.equal(opened.project.sources.length, 1);
  assert.equal(opened.project.sources[0].originalPath, undefined);
  assert.equal(opened.project.legendEntries.length, project.legendEntries.length);
  assert.equal(opened.project.circuits.length, project.circuits.length);
  assert.equal(opened.initialPageId, page.id);
  assert.deepEqual(opened.assets.get(opened.project.pages[0].rendition.archivePath), imageBytes);

  const archive = createEseArchive(opened.project, opened.assets);
  const reopened = openEseArchive(archive);
  assert.equal(reopened.project.title, project.title);
  assert.equal(reopened.project.circuits.length, project.circuits.length);
  assert.deepEqual(reopened.assets.get(reopened.project.pages[0].rendition.archivePath), imageBytes);
});

test("les HTML ESE plus anciens sans métadonnées restent ouvrables", () => {
  const current = createStandaloneHtml(project, [{ page, imageDataUrl }], true);
  const payloadMatch = current.match(/<script type="application\/json" id="ese-data">([\s\S]*?)<\/script>/);
  assert.ok(payloadMatch);
  const payload = JSON.parse(payloadMatch[1]);
  delete payload.format;
  delete payload.formatVersion;
  delete payload.project;
  const legacy = current.replace(payloadMatch[1], JSON.stringify(payload));
  const opened = openEseHtml(legacy);

  assert.equal(opened.project.pages.length, 1);
  assert.equal(opened.project.sources[0].pageIds[0], page.id);
  assert.equal(opened.project.legends.length, 1);
});

test("ajouter un HTML remappe pages, ressources et identifiants sans casser les repères communs", () => {
  const opened = openEseHtml(createStandaloneHtml(project, [{ page, imageDataUrl }], false));
  const target = createBlankProject("Cible");
  target.legendEntries.push(structuredClone(project.legendEntries.find((entry) => entry.reference === "Y/GR")));
  target.legendEntries[0].legendId = target.legends[0].id;
  const existingEntryId = target.legendEntries[0].id;

  const merged = mergeImportedProject(target, new Map(), opened.project, opened.assets);
  const ygr = merged.project.legendEntries.filter((entry) => entry.reference === "Y/GR");
  const importedPage = merged.project.pages.find((candidate) => candidate.id === merged.importedPageIds[0]);

  assert.equal(merged.project.pages.length, 1);
  assert.equal(merged.assets.size, 1);
  assert.notEqual(importedPage.id, page.id);
  assert.equal(ygr.length, 1);
  assert.equal(ygr[0].id, existingEntryId);
  assert.ok(merged.project.circuits.every((circuit) =>
    circuit.traces.every((trace) => trace.pageId === importedPage.id)
  ));
});

test("le nouvel export JSON contient tracés, repères et description des pages sans image", () => {
  const text = createAnnotationsJson(project);
  const payload = JSON.parse(text);
  const parsed = parseAnnotationsJson(text);

  assert.equal(payload.format, "ese-annotations");
  assert.equal(payload.formatVersion, 1);
  assert.equal(payload.pages[0].width, page.width);
  assert.equal(payload.legendEntries.length, project.legendEntries.length);
  assert.equal(payload.circuits.length, project.circuits.length);
  assert.equal(parsed.legacy, false);
  assert.doesNotMatch(text, /imageDataUrl|data:image|originalPath/);
});

test("un JSON autonome se réimporte sur une autre page et adapte les coordonnées", () => {
  const target = createBlankProject("Cible JSON");
  target.sources.push({
    id: "target-source",
    name: "Image cible",
    originalName: "cible.png",
    mime: "image/png",
    pageIds: ["target-page"]
  });
  target.pages.push({
    id: "target-page",
    sourceId: "target-source",
    name: "Autre nom",
    width: page.width * 2,
    height: page.height * 2,
    rendition: { kind: "image", mime: "image/png", archivePath: "target.png" }
  });

  const imported = importAnnotationsJson(target, "target-page", createAnnotationsJson(project));
  const normalizedSource = mergeCircuitsByReference(project);
  const normalizedImported = mergeCircuitsByReference(imported.project);
  const sourceYgr = normalizedSource.circuits.find((circuit) =>
    normalizedSource.legendEntries.find((entry) => entry.id === circuit.legendEntryId)?.reference === "Y/GR"
  );
  const importedYgr = normalizedImported.circuits.find((circuit) =>
    normalizedImported.legendEntries.find((entry) => entry.id === circuit.legendEntryId)?.reference === "Y/GR"
  );

  assert.equal(normalizedImported.circuits.length, 3);
  assert.equal(imported.mappedPageCount, 1);
  assert.ok(normalizedImported.circuits.every((circuit) => circuit.traces.every((trace) => trace.pageId === "target-page")));
  assert.deepEqual(
    importedYgr.traces[0].points,
    sourceYgr.traces[0].points.map((point) => ({ x: point.x * 2, y: point.y * 2 }))
  );
  assert.deepEqual(
    normalizedImported.legendEntries.find((entry) => entry.reference === "Y/GR").highlight,
    project.legendEntries.find((entry) => entry.reference === "Y/GR").highlight
  );
});

test("les anciens JSON constitués du tableau brut des circuits restent importables", () => {
  const target = {
    ...structuredClone(project),
    circuits: []
  };
  const imported = importAnnotationsJson(target, page.id, JSON.stringify(project.circuits));
  const normalized = mergeCircuitsByReference(imported.project);

  assert.equal(imported.legacy, true);
  assert.equal(normalized.circuits.length, 3);
  assert.equal(imported.project.legendEntries.length, project.legendEntries.length);
  assert.ok(normalized.circuits.every((circuit) => circuit.traces.every((trace) => trace.pageId === page.id)));
});
