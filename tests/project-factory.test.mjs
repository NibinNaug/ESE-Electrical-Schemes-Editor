import assert from "node:assert/strict";
import test from "node:test";

import { createEseArchive, openEseArchive } from "../src/archive.ts";
import { createBlankProject } from "../src/project-factory.ts";

test("un nouveau projet est réellement vierge et reste enregistrable", () => {
  const project = createBlankProject();

  assert.equal(project.title, "Projet sans titre");
  assert.deepEqual(project.sources, []);
  assert.deepEqual(project.pages, []);
  assert.deepEqual(project.legendEntries, []);
  assert.deepEqual(project.circuits, []);

  const reopened = openEseArchive(createEseArchive(project, new Map()));
  assert.deepEqual(reopened.project, project);
  assert.equal(reopened.assets.size, 0);
});
