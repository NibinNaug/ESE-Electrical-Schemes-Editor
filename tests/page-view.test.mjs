import assert from "node:assert/strict";
import test from "node:test";

import { fitPageView, normalizePageView, pageViewsEqual } from "../src/page-view.ts";

const page = { width: 1200, height: 800 };

test("un ancien projet sans vue enregistrée s'ouvre en vue entière", () => {
  assert.deepEqual(normalizePageView(page), fitPageView(page));
});

test("une vue valide conserve indépendamment son zoom et sa position", () => {
  const saved = { x: 175, y: 90, width: 600, height: 400 };
  const restored = normalizePageView(page, saved);

  assert.deepEqual(restored, saved);
  assert.notEqual(restored, saved);
  assert.equal(pageViewsEqual(saved, restored), true);
});

test("une vue invalide est remplacée par une vue entière sûre", () => {
  assert.deepEqual(
    normalizePageView(page, { x: Number.NaN, y: 0, width: 0, height: 400 }),
    fitPageView(page)
  );
});
