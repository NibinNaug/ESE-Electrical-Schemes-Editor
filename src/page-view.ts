import type { PageView, ProjectPage } from "./types";

export const fitPageView = (page: Pick<ProjectPage, "width" | "height">): PageView => ({
  x: 0,
  y: 0,
  width: page.width,
  height: page.height
});

export const normalizePageView = (
  page: Pick<ProjectPage, "width" | "height">,
  candidate?: PageView
): PageView => {
  if (
    !candidate ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  ) {
    return fitPageView(page);
  }

  const view = { ...candidate };
  const marginX = view.width * 0.25;
  const marginY = view.height * 0.25;
  view.x = Math.max(-marginX, Math.min(page.width - view.width + marginX, view.x));
  view.y = Math.max(-marginY, Math.min(page.height - view.height + marginY, view.y));
  return view;
};

export const pageViewsEqual = (first: PageView | undefined, second: PageView): boolean =>
  Boolean(first) &&
  first!.x === second.x &&
  first!.y === second.y &&
  first!.width === second.width &&
  first!.height === second.height;
