import assert from "node:assert/strict";
import test from "node:test";

import { formatPageSelection, parsePageSelection } from "../src/page-selection.ts";

test("une s\u00e9lection de pages physiques accepte num\u00e9ros et plages", () => {
  assert.deepEqual(parsePageSelection("111, 3-5, 7, 5", 117), [3, 4, 5, 7, 111]);
  assert.deepEqual(parsePageSelection("5-3", 10), [3, 4, 5]);
});

test("une page physique hors du PDF est refus\u00e9e", () => {
  assert.throws(() => parsePageSelection("118", 117), /entre 1 et 117/);
  assert.throws(() => parsePageSelection("page 3", 117), /invalide/);
});

test("la s\u00e9lection est reformatt\u00e9e en plages compactes", () => {
  assert.equal(formatPageSelection([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10");
  assert.equal(formatPageSelection([]), "");
});
