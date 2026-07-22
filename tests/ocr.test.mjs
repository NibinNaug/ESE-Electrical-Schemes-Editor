import assert from "node:assert/strict";
import test from "node:test";

import { mergeOcrProposalPasses, numericLegendRegion, proposalsFromOcrLines } from "../src/ocr.ts";

test("la table automobile multilingue produit les couleurs et codes attendus", () => {
  const proposals = proposalsFromOcrLines([
    { text: "Orange Orange Orange Arancio Naranja O", confidence: 94 },
    { text: "Grün Vert Green Verde Verde GR", confidence: 91 },
    { text: "Schwarz Noir Black Nero Negro B", confidence: 93 },
    { text: "Gelb Jaune Yellow Giallo Amarillo Y", confidence: 90 },
    { text: "Blau Bleu Blue Azzurro Azul BL", confidence: 89 }
  ]);

  assert.deepEqual(proposals.map((proposal) => proposal.reference), ["B", "BL", "GR", "O", "Y"]);
  assert.equal(proposals.find((proposal) => proposal.reference === "GR").name, "Vert");
  assert.deepEqual(
    proposals.find((proposal) => proposal.reference === "Y").markings,
    [{ type: "color", code: "Y", bands: ["#e8c91f"] }]
  );
});

test("un repère composé reconstitue un surlignage rayé", () => {
  const [proposal] = proposalsFromOcrLines([
    { text: "Y/GR - Jaune et vert", confidence: 87 }
  ]);

  assert.equal(proposal.reference, "Y/GR");
  assert.equal(proposal.name, "Jaune / Vert");
  assert.equal(proposal.highlight.pattern, "striped");
  assert.equal(proposal.highlight.colors.length, 2);
});

test("une liste numérotée produit des repères éditables et dédoublonnés", () => {
  const proposals = proposalsFromOcrLines([
    { text: "12 AVERTISSEUR (CLAXON)", confidence: 82 },
    { text: "12 HORN", confidence: 64 },
    { text: "13 FUSIBLE 7.5 Amp.", confidence: 88 }
  ]);

  assert.deepEqual(proposals.map((proposal) => proposal.reference), ["12", "13"]);
  assert.equal(proposals[0].name, "AVERTISSEUR (CLAXON)");
  assert.deepEqual(proposals[0].markings, [{ type: "number", value: "12" }]);
});

test("les numéros isolés et les titres OCR ne deviennent pas de faux repères", () => {
  const proposals = proposalsFromOcrLines([
    { text: "110", confidence: 96 },
    { text: "23", confidence: 89 },
    { text: "REAR LEFT TURN INDICATOR", confidence: 81 },
    { text: "FT REAR LEFT TURN INDICATOR", confidence: 56 }
  ]);

  assert.deepEqual(proposals, []);
});

test("le nom multilingue rétablit un code couleur mal reconnu", () => {
  const proposals = proposalsFromOcrLines([
    { text: "Orange Orange Orange Arancio Naranja 0", confidence: 88 },
    { text: "Weiß Blanc White Bianco Blanco VV", confidence: 84 }
  ]);

  assert.deepEqual(proposals.map((proposal) => proposal.reference), ["O", "W"]);
  assert.equal(proposals[0].confidence, 83);
});

test("les abréviations constructeur sont conservées sans perdre leur couleur", () => {
  const proposals = proposalsFromOcrLines([
    { text: "BK - Black", confidence: 92 },
    { text: "YE - Yellow", confidence: 90 },
    { text: "BK/YE - Black and yellow", confidence: 88 }
  ]);

  assert.deepEqual(proposals.map((proposal) => proposal.reference), ["BK", "BK/YE", "YE"]);
  assert.deepEqual(proposals[0].highlight.colors, ["#202226"]);
  assert.deepEqual(proposals[1].highlight.colors, ["#202226", "#e8c91f"]);
});

test("les cellules OCR géométriquement alignées sont réunies par rangée", () => {
  const proposals = proposalsFromOcrLines([
    { text: "Orange", confidence: 94, bbox: { x0: 10, y0: 10, x1: 90, y1: 30 } },
    { text: "Orange", confidence: 92, bbox: { x0: 110, y0: 11, x1: 190, y1: 31 } },
    { text: "O", confidence: 96, bbox: { x0: 210, y0: 10, x1: 225, y1: 30 } },
    { text: "Green", confidence: 91, bbox: { x0: 10, y0: 45, x1: 75, y1: 65 } },
    { text: "Vert", confidence: 89, bbox: { x0: 110, y0: 46, x1: 155, y1: 66 } },
    { text: "GR", confidence: 95, bbox: { x0: 210, y0: 45, x1: 235, y1: 65 } },
    { text: "Black", confidence: 93, bbox: { x0: 10, y0: 80, x1: 65, y1: 100 } },
    { text: "Noir", confidence: 92, bbox: { x0: 110, y0: 81, x1: 150, y1: 101 } },
    { text: "B", confidence: 95, bbox: { x0: 210, y0: 80, x1: 225, y1: 100 } }
  ]);

  assert.deepEqual(proposals.map((proposal) => proposal.reference), ["B", "GR", "O"]);
});

test("un code couleur isolé dans un schéma ne suffit pas à inventer une légende", () => {
  const proposals = proposalsFromOcrLines([
    { text: "B", confidence: 95, bbox: { x0: 10, y0: 10, x1: 20, y1: 30 } },
    { text: "VI", confidence: 90, bbox: { x0: 300, y0: 250, x1: 330, y1: 270 } },
    { text: "LIGHTS-TURN INDICATORS", confidence: 86, bbox: { x0: 40, y0: 80, x1: 280, y1: 100 } }
  ]);

  assert.deepEqual(proposals, []);
});

test("une seconde lecture complète les petits numéros sans dupliquer un repère mal lu", () => {
  const primary = proposalsFromOcrLines([
    { text: "10 STOPLIGHT SWITCH", confidence: 95, bbox: { x0: 16, y0: 100, x1: 440, y1: 124 } },
    { text: "11A ENGINE SWITCH", confidence: 91, bbox: { x0: 16, y0: 140, x1: 380, y1: 164 } },
    { text: "12 LIGHTS CONTROL", confidence: 94, bbox: { x0: 16, y0: 180, x1: 450, y1: 204 } }
  ]);
  const secondary = proposalsFromOcrLines([
    { text: "1 HEADLAMP ASSEMBLY", confidence: 93, bbox: { x0: 16, y0: 20, x1: 450, y1: 44 } },
    { text: "114 ENGINE SWITCH", confidence: 86, bbox: { x0: 16, y0: 140, x1: 380, y1: 164 } },
    { text: "12 LIGHTS CONTROL", confidence: 92, bbox: { x0: 16, y0: 180, x1: 450, y1: 204 } }
  ]);

  const proposals = mergeOcrProposalPasses(primary, secondary);
  assert.deepEqual(proposals.map((proposal) => proposal.reference), ["1", "10", "11A", "12"]);
});

test("la colonne numérotée dominante est isolée des colonnes voisines", () => {
  const proposals = proposalsFromOcrLines([
    { text: "10 STOPLIGHT SWITCH", confidence: 95, bbox: { x0: 430, y0: 760, x1: 790, y1: 780 } },
    { text: "11 ENGINE SWITCH", confidence: 93, bbox: { x0: 432, y0: 800, x1: 750, y1: 820 } },
    { text: "12 LIGHTS CONTROL", confidence: 94, bbox: { x0: 428, y0: 840, x1: 800, y1: 860 } },
    { text: "20 MOTOR", confidence: 90, bbox: { x0: 925, y0: 760, x1: 1100, y1: 780 } }
  ]);

  assert.deepEqual(numericLegendRegion(proposals, 1600, 1200), {
    x: 402,
    y: 736,
    width: 368,
    height: 148
  });
});
