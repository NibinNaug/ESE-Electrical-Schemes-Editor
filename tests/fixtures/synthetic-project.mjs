export const imageBytes = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
));

export const project = {
  format: "ese-project",
  formatVersion: 1,
  projectId: "ese-synthetic-test-project",
  title: "Banc de test ESE",
  createdAt: "2026-07-22T00:00:00.000Z",
  modifiedAt: "2026-07-22T00:00:00.000Z",
  sources: [{
    id: "source-test",
    name: "schema-test.png",
    originalName: "schema-test.png",
    mime: "image/png",
    originalPath: "sources/test/schema-test.png",
    pageIds: ["page-test"]
  }],
  pages: [{
    id: "page-test",
    sourceId: "source-test",
    name: "Schéma synthétique",
    width: 1200,
    height: 800,
    rendition: { kind: "image", mime: "image/png", archivePath: "sources/test/schema-test.png" }
  }],
  legends: [{ id: "legend-test", name: "Repères de test", scope: "project" }],
  legendEntries: [
    {
      id: "entry-r",
      legendId: "legend-test",
      reference: "R",
      name: "Rouge",
      markings: [{ type: "color", code: "R", bands: ["#dc2626"] }],
      highlight: { colors: ["#dc2626"], pattern: "solid" }
    },
    {
      id: "entry-y-gr",
      legendId: "legend-test",
      reference: "Y/GR",
      name: "Jaune / vert",
      markings: [{ type: "color", code: "Y/GR", bands: ["#facc15", "#16a34a"] }],
      highlight: { colors: ["#facc15", "#16a34a"], pattern: "striped" }
    },
    {
      id: "entry-15",
      legendId: "legend-test",
      reference: "15",
      name: "Après contact",
      markings: [{ type: "number", value: "15" }],
      highlight: { colors: ["#2563eb"], pattern: "solid" }
    }
  ],
  circuits: [
    {
      id: "circuit-red",
      legendEntryId: "entry-r",
      name: "Circuit R",
      traces: [
        { id: "trace-r-1", pageId: "page-test", points: [{ x: 100, y: 180 }, { x: 520, y: 180 }] },
        { id: "trace-r-2", pageId: "page-test", points: [{ x: 620, y: 180 }, { x: 1080, y: 180 }] }
      ]
    },
    {
      id: "circuit-ygr-1",
      legendEntryId: "entry-y-gr",
      name: "Circuit Y/GR 1",
      traces: [
        { id: "trace-ygr-1", pageId: "page-test", points: [{ x: 100, y: 360 }, { x: 520, y: 360 }] },
        { id: "trace-ygr-2", pageId: "page-test", points: [{ x: 520, y: 360 }, { x: 520, y: 620 }] }
      ]
    },
    {
      id: "circuit-ygr-2",
      legendEntryId: "entry-y-gr",
      name: "Circuit Y/GR 2",
      traces: [
        { id: "trace-ygr-3", pageId: "page-test", points: [{ x: 680, y: 360 }, { x: 1080, y: 360 }] }
      ]
    },
    {
      id: "circuit-15",
      legendEntryId: "entry-15",
      name: "Circuit 15",
      traces: [
        { id: "trace-15-1", pageId: "page-test", points: [{ x: 100, y: 560 }, { x: 1080, y: 560 }] }
      ]
    }
  ]
};

export const page = project.pages[0];
export const imageDataUrl = `data:image/png;base64,${Buffer.from(imageBytes).toString("base64")}`;
