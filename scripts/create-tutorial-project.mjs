import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEseArchive } from "../src/archive.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "website", "assets", "tutorial-schematic.svg");
const outputPath = path.resolve(process.argv[2] || path.join(os.tmpdir(), "ese-tutorial-project.ese"));
const archivePath = "renditions/tutorial/schematic.svg";
const now = "2026-07-22T00:00:00.000Z";

const entries = [
  ["r-b", "R/B", "Alimentation principale", ["#ef4444", "#111827"]],
  ["y-gr", "Y/GR", "Commande relais", ["#facc15", "#22c55e"]],
  ["15", "15", "Sortie éclairage", ["#3b82f6"]],
  ["bl", "BL", "Commande moteur", ["#2563eb"]],
  ["31", "31", "Retour auxiliaire", ["#8b5e3c"]],
  ["g-y", "G/Y", "Masse de protection", ["#22c55e", "#facc15"]]
];

const project = {
  format: "ese-project",
  formatVersion: 1,
  projectId: "ese-public-tutorial",
  title: "Circuit de démonstration ESE",
  createdAt: now,
  modifiedAt: now,
  sources: [{
    id: "source-tutorial",
    name: "Schéma synthétique",
    originalName: "tutorial-schematic.svg",
    mime: "image/svg+xml",
    originalPath: archivePath,
    pageIds: ["page-tutorial"]
  }],
  pages: [{
    id: "page-tutorial",
    sourceId: "source-tutorial",
    name: "Commande 12 V",
    width: 1600,
    height: 1000,
    view: { x: 0, y: 0, width: 1600, height: 1000 },
    rendition: { kind: "image", mime: "image/svg+xml", archivePath }
  }],
  legends: [{ id: "legend-tutorial", name: "Repères du tutoriel", scope: "project" }],
  legendEntries: entries.map(([id, reference, name, colors]) => ({
    id: `entry-${id}`,
    legendId: "legend-tutorial",
    reference,
    name,
    markings: reference.includes("/")
      ? [{ type: "color", code: reference, bands: colors }]
      : [{ type: /^\d+$/.test(reference) ? "number" : "color", ...( /^\d+$/.test(reference)
        ? { value: reference }
        : { code: reference, bands: colors }) }],
    highlight: { colors, pattern: colors.length > 1 ? "striped" : "solid" }
  })),
  circuits: [
    {
      id: "circuit-r-b",
      legendEntryId: "entry-r-b",
      name: "Alimentation protégée",
      traces: [
        { id: "trace-r-b-1", pageId: "page-tutorial", points: [{ x: 160, y: 280 }, { x: 300, y: 280 }] },
        { id: "trace-r-b-2", pageId: "page-tutorial", points: [{ x: 360, y: 280 }, { x: 520, y: 280 }] }
      ]
    },
    {
      id: "circuit-y-gr",
      legendEntryId: "entry-y-gr",
      name: "Commande du relais K1",
      traces: [
        { id: "trace-y-gr-1", pageId: "page-tutorial", points: [{ x: 620, y: 280 }, { x: 900, y: 280 }] },
        { id: "trace-y-gr-2", pageId: "page-tutorial", points: [{ x: 760, y: 280 }, { x: 760, y: 390 }, { x: 900, y: 390 }] }
      ]
    },
    {
      id: "circuit-15",
      legendEntryId: "entry-15",
      name: "Éclairage commandé",
      traces: [
        { id: "trace-15-1", pageId: "page-tutorial", points: [{ x: 900, y: 280 }, { x: 1080, y: 280 }] },
        { id: "trace-15-2", pageId: "page-tutorial", points: [{ x: 1180, y: 280 }, { x: 1370, y: 280 }, { x: 1370, y: 720 }] }
      ]
    },
    {
      id: "circuit-bl",
      legendEntryId: "entry-bl",
      name: "Alimentation moteur",
      traces: [
        { id: "trace-bl-1", pageId: "page-tutorial", points: [{ x: 740, y: 520 }, { x: 900, y: 520 }] },
        { id: "trace-bl-2", pageId: "page-tutorial", points: [{ x: 1020, y: 520 }, { x: 1180, y: 520 }, { x: 1180, y: 720 }] }
      ]
    },
    {
      id: "circuit-31",
      legendEntryId: "entry-31",
      name: "Retour auxiliaire",
      traces: [
        { id: "trace-31-1", pageId: "page-tutorial", points: [{ x: 160, y: 520 }, { x: 300, y: 520 }] },
        { id: "trace-31-2", pageId: "page-tutorial", points: [{ x: 420, y: 520 }, { x: 600, y: 520 }] }
      ]
    },
    {
      id: "circuit-g-y",
      legendEntryId: "entry-g-y",
      name: "Bus de masse",
      traces: [{ id: "trace-g-y-1", pageId: "page-tutorial", points: [{ x: 160, y: 720 }, { x: 1370, y: 720 }] }]
    }
  ]
};

const sourceBytes = new Uint8Array(await fs.readFile(sourcePath));
const archive = createEseArchive(project, new Map([[archivePath, sourceBytes]]));
await fs.writeFile(outputPath, archive);
console.log(outputPath);
