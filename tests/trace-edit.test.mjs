import assert from "node:assert/strict";
import test from "node:test";

import {
  moveTracePoint,
  moveTraceSegment,
  nearestTraceSegmentIndex,
  removeTraceById
} from "../src/trace-edit.ts";

test("un point de portion se déplace sans altérer les autres points", () => {
  const original = [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 60 }];
  const moved = moveTracePoint(original, 1, { x: 35, y: 18 });

  assert.deepEqual(moved, [{ x: 10, y: 10 }, { x: 35, y: 18 }, { x: 40, y: 60 }]);
  assert.deepEqual(original, [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 60 }]);
});

test("déplacer un segment déplace uniquement ses deux extrémités", () => {
  const moved = moveTraceSegment(
    [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 60 }, { x: 80, y: 60 }],
    1,
    { x: 5, y: -3 }
  );

  assert.deepEqual(moved, [
    { x: 10, y: 10 },
    { x: 45, y: 7 },
    { x: 45, y: 57 },
    { x: 80, y: 60 }
  ]);
});

test("le segment le plus proche du pointeur est identifié", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

  assert.equal(nearestTraceSegmentIndex(points, { x: 40, y: 8 }), 0);
  assert.equal(nearestTraceSegmentIndex(points, { x: 93, y: 70 }), 1);
});

test("une portion arbitraire peut être supprimée sans retirer la dernière", () => {
  const traces = [{ id: "première" }, { id: "milieu" }, { id: "dernière" }];

  assert.deepEqual(removeTraceById(traces, "milieu"), [{ id: "première" }, { id: "dernière" }]);
});
