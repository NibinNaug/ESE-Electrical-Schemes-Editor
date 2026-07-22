import type { Point } from "./types";

export const nearestTraceSegmentIndex = (points: Point[], target: Point): number => {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared
      ? Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSquared))
      : 0;
    const x = a.x + ratio * dx;
    const y = a.y + ratio * dy;
    const distance = Math.hypot(target.x - x, target.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
};

export const moveTracePoint = (points: Point[], pointIndex: number, target: Point): Point[] =>
  points.map((point, index) => index === pointIndex ? { ...target } : { ...point });

export const moveTraceSegment = (points: Point[], segmentIndex: number, delta: Point): Point[] =>
  points.map((point, index) =>
    index === segmentIndex || index === segmentIndex + 1
      ? { x: point.x + delta.x, y: point.y + delta.y }
      : { ...point }
  );

export const removeTraceById = <T extends { id: string }>(traces: T[], traceId: string): T[] =>
  traces.filter((trace) => trace.id !== traceId);
