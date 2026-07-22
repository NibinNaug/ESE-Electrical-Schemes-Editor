import type { HighlightStyle, Marking } from "./types";

export type OcrLine = {
  text: string;
  confidence: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

export type OcrProposal = {
  reference: string;
  name: string;
  confidence: number;
  sourceText: string;
  markings: Marking[];
  highlight: HighlightStyle;
  sourceBounds?: OcrLine["bbox"];
};

export type OcrRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BaseColor = {
  name: string;
  color: string;
};

export const automotiveColors: Record<string, BaseColor> = {
  O: { name: "Orange", color: "#f28c28" },
  GR: { name: "Vert", color: "#33924a" },
  B: { name: "Noir", color: "#202226" },
  BR: { name: "Marron", color: "#7a4b2c" },
  W: { name: "Blanc", color: "#f2f2ee" },
  G: { name: "Gris", color: "#858b92" },
  Y: { name: "Jaune", color: "#e8c91f" },
  BL: { name: "Bleu", color: "#3477d4" },
  R: { name: "Rouge", color: "#d83a3a" },
  P: { name: "Rose", color: "#e56c9f" },
  VI: { name: "Violet", color: "#7951b8" }
};

const normalizeReference = (value: string): string =>
  value
    .toUpperCase()
    .replaceAll("\\", "/")
    .replace(/[^A-Z0-9/.-]/g, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^[/.-]+|[/.-]+$/g, "");

const foldText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const colorWords: Array<{ code: string; words: string[] }> = [
  { code: "O", words: ["ORANGE", "ARANCIO", "NARANJA"] },
  { code: "GR", words: ["GRUN", "VERT", "GREEN", "VERDE"] },
  { code: "B", words: ["SCHWARZ", "NOIR", "BLACK", "NERO", "NEGRO"] },
  { code: "BR", words: ["BRAUN", "MARRON", "BROWN", "MARRONE"] },
  { code: "W", words: ["WEISS", "BLANC", "WHITE", "BIANCO", "BLANCO"] },
  { code: "G", words: ["GRAU", "GRIS", "GREY", "GRAY", "GRIGIO"] },
  { code: "Y", words: ["GELB", "JAUNE", "YELLOW", "GIALLO", "AMARILLO"] },
  { code: "BL", words: ["BLAU", "BLEU", "BLUE", "AZZURRO", "AZUL"] },
  { code: "R", words: ["ROT", "ROUGE", "RED", "ROSSO", "ROJO"] },
  { code: "P", words: ["ROSA", "ROSE", "PINK"] },
  { code: "VI", words: ["VIOLETT", "VIOLET", "PURPLE", "VIOLA"] }
];

// Les abréviations changent selon les constructeurs. On conserve toujours le
// repère réellement imprimé tout en lui associant la bonne couleur visuelle.
const alternativeColorCodes: Record<string, string> = {
  OG: "O", OR: "O", ORN: "O",
  GN: "GR", GRN: "GR",
  BK: "B", BLK: "B",
  BN: "BR", BRN: "BR",
  WH: "W", WHT: "W",
  GY: "G", GRY: "G",
  YE: "Y", YEL: "Y",
  BU: "BL", BLU: "BL",
  RD: "R", RED: "R",
  PK: "P", PNK: "P",
  VT: "VI", VIO: "VI"
};

type PreparedOcrLine = OcrLine & { sourceFragments: number };

type ProposalCandidate = {
  proposal: OcrProposal;
  kind: "color-bare" | "color-supported" | "color-inferred" | "numeric" | "labelled";
  colorEvidence: number;
  x: number | null;
};

const inferColorReference = (sourceText: string): string | null => {
  const words = new Set(foldText(sourceText).split(/[^A-Z]+/).filter(Boolean));
  const matches = colorWords.filter((candidate) => candidate.words.some((word) => words.has(word)));
  return matches.length === 1 ? matches[0].code : null;
};

const mentionedColorCodes = (sourceText: string): string[] => {
  const words = foldText(sourceText).split(/[^A-Z]+/).filter(Boolean);
  return words.flatMap((word) =>
    colorWords.filter((candidate) => candidate.words.includes(word)).map((candidate) => candidate.code)
  );
};

const semanticColorCodes = (reference: string): string[] | null => {
  const parts = reference.split("/");
  if (!parts.length) return null;
  const semantic = parts.map((part) => automotiveColors[part] ? part : alternativeColorCodes[part]);
  return semantic.every(Boolean) ? semantic as string[] : null;
};

const colorProposal = (
  reference: string,
  confidence: number,
  sourceText: string,
  semanticCodes = semanticColorCodes(reference),
  sourceBounds?: OcrLine["bbox"]
): OcrProposal | null => {
  if (!semanticCodes?.length) return null;
  const colors = semanticCodes.map((code) => automotiveColors[code]).filter(Boolean);
  if (colors.length !== semanticCodes.length) return null;
  return {
    reference,
    name: colors.map((color) => color.name).join(" / "),
    confidence,
    sourceText,
    sourceBounds,
    markings: [{ type: "color", code: reference, bands: colors.map((color) => color.color) }],
    highlight: {
      colors: colors.map((color) => color.color),
      pattern: colors.length > 1 ? "striped" : "solid"
    }
  };
};

const verticalOverlap = (first: NonNullable<OcrLine["bbox"]>, second: NonNullable<OcrLine["bbox"]>): number =>
  Math.max(0, Math.min(first.y1, second.y1) - Math.max(first.y0, second.y0));

/**
 * Le mode texte épars de Tesseract sépare souvent chaque cellule d'une même
 * rangée. Les coordonnées permettent de reconstituer la ligne logique avant
 * d'interpréter une légende.
 */
export const rowsFromOcrLines = (lines: OcrLine[]): PreparedOcrLine[] => {
  const cleaned = lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text);
  if (!cleaned.some((line) => line.bbox)) {
    return cleaned.map((line) => ({ ...line, sourceFragments: 1 }));
  }

  const positioned = cleaned.filter((line): line is OcrLine & { bbox: NonNullable<OcrLine["bbox"]> } => Boolean(line.bbox));
  const unpositioned = cleaned.filter((line) => !line.bbox).map((line) => ({ ...line, sourceFragments: 1 }));
  const groups: Array<Array<(typeof positioned)[number]>> = [];

  for (const line of positioned.sort((first, second) => {
    const vertical = first.bbox.y0 - second.bbox.y0;
    return Math.abs(vertical) > 2 ? vertical : first.bbox.x0 - second.bbox.x0;
  })) {
    const lineHeight = Math.max(1, line.bbox.y1 - line.bbox.y0);
    let bestGroup: Array<(typeof positioned)[number]> | null = null;
    let bestRatio = 0;
    for (const group of groups) {
      const anchor = group[0].bbox;
      const anchorHeight = Math.max(1, anchor.y1 - anchor.y0);
      const overlapRatio = verticalOverlap(anchor, line.bbox) / Math.min(anchorHeight, lineHeight);
      const centerDistance = Math.abs((anchor.y0 + anchor.y1) / 2 - (line.bbox.y0 + line.bbox.y1) / 2);
      if ((overlapRatio >= 0.45 || centerDistance <= Math.max(anchorHeight, lineHeight) * 0.35) && overlapRatio >= bestRatio) {
        bestGroup = group;
        bestRatio = overlapRatio;
      }
    }
    if (bestGroup) bestGroup.push(line);
    else groups.push([line]);
  }

  const rows = groups.map((group): PreparedOcrLine => {
    group.sort((first, second) => first.bbox.x0 - second.bbox.x0);
    const totalWeight = group.reduce((sum, line) => sum + Math.max(1, line.text.length), 0);
    return {
      text: group.map((line) => line.text).join(" "),
      confidence: group.reduce((sum, line) => sum + line.confidence * Math.max(1, line.text.length), 0) / totalWeight,
      bbox: {
        x0: Math.min(...group.map((line) => line.bbox.x0)),
        y0: Math.min(...group.map((line) => line.bbox.y0)),
        x1: Math.max(...group.map((line) => line.bbox.x1)),
        y1: Math.max(...group.map((line) => line.bbox.y1))
      },
      sourceFragments: group.length
    };
  });
  return [...rows, ...unpositioned].sort((first, second) =>
    (first.bbox?.y0 ?? Number.MAX_SAFE_INTEGER) - (second.bbox?.y0 ?? Number.MAX_SAFE_INTEGER)
  );
};

const genericProposal = (
  reference: string,
  name: string,
  confidence: number,
  sourceText: string,
  sourceBounds?: OcrLine["bbox"]
): OcrProposal => {
  const numeric = /^\d+[A-Z]?$/.test(reference);
  return {
    reference,
    name: name.trim() || reference,
    confidence,
    sourceText,
    sourceBounds,
    markings: [{ type: numeric ? "number" : "text", value: reference }],
    highlight: { colors: ["#e93478"], pattern: "solid" }
  };
};

const proposalFromLine = (line: PreparedOcrLine): ProposalCandidate | null => {
  const sourceText = line.text.replace(/\s+/g, " ").trim();
  if (!sourceText) return null;
  const tokens = sourceText.split(" ");
  const inferredColorReference = inferColorReference(sourceText);
  const mentionedColors = mentionedColorCodes(sourceText);

  const firstReference = normalizeReference(tokens[0]);
  const lastReference = normalizeReference(tokens.at(-1) || "");
  const firstLooksLikeCode = Boolean(automotiveColors[firstReference]) || firstReference.includes("/") || tokens[0] === tokens[0].toUpperCase();
  const lastToken = tokens.at(-1) || "";
  const lastLooksLikeCode = Boolean(automotiveColors[lastReference]) || lastReference.includes("/") || lastToken === lastToken.toUpperCase();
  const firstColor = firstLooksLikeCode ? colorProposal(firstReference, line.confidence, sourceText, undefined, line.bbox) : null;
  if (firstColor) return {
    proposal: firstColor,
    kind: semanticColorCodes(firstReference)?.every((code) => mentionedColors.includes(code))
      ? "color-supported"
      : "color-bare",
    colorEvidence: mentionedColors.length,
    x: line.bbox?.x0 ?? null
  };
  const lastColor = lastLooksLikeCode ? colorProposal(lastReference, line.confidence, sourceText, undefined, line.bbox) : null;
  if (lastColor) return {
    proposal: lastColor,
    kind: semanticColorCodes(lastReference)?.every((code) => mentionedColors.includes(code))
      ? "color-supported"
      : "color-bare",
    colorEvidence: mentionedColors.length,
    x: line.bbox?.x0 ?? null
  };

  if (inferredColorReference) {
    const proposal = colorProposal(inferredColorReference, Math.max(0, line.confidence - 5), sourceText, undefined, line.bbox);
    if (proposal) return {
      proposal,
      kind: "color-inferred",
      colorEvidence: mentionedColors.length,
      x: line.bbox?.x0 ?? null
    };
  }

  const numericName = tokens.slice(1).join(" ").trim();
  if (/^\d+[A-Z]?$/.test(firstReference) && /[A-ZÀ-ÖØ-Þ]{2}/i.test(numericName)) {
    return {
      proposal: genericProposal(firstReference, numericName, line.confidence, sourceText, line.bbox),
      kind: "numeric",
      colorEvidence: 0,
      x: line.bbox?.x0 ?? null
    };
  }

  const labelled = sourceText.match(/^([A-Z0-9]{1,8}(?:\/[A-Z0-9]{1,8})?)(?:\s+[-\u2013\u2014]\s*|\s*[:=]\s*)(.+)$/i);
  if (labelled) {
    const reference = normalizeReference(labelled[1]);
    const rawReference = labelled[1];
    const codeLike = /\d/.test(rawReference) || rawReference === rawReference.toUpperCase();
    if (reference && codeLike && /[A-ZÀ-ÖØ-Þ]{2}/i.test(labelled[2])) return {
      proposal: genericProposal(reference, labelled[2], line.confidence, sourceText, line.bbox),
      kind: "labelled",
      colorEvidence: 0,
      x: line.bbox?.x0 ?? null
    };
  }
  return null;
};

export const proposalsFromOcrLines = (lines: OcrLine[]): OcrProposal[] => {
  const hasGeometry = lines.some((line) => Boolean(line.bbox));
  const rows = rowsFromOcrLines(lines);
  const candidates = rows.map(proposalFromLine).filter((candidate): candidate is ProposalCandidate => Boolean(candidate));
  const explicitColors = new Set(candidates
    .filter((candidate) => candidate.kind === "color-supported")
    .map((candidate) => candidate.proposal.reference));
  const colorLegendContext = explicitColors.size >= 3;

  const alignedNumericCandidates = new Set<ProposalCandidate>();
  const numeric = candidates.filter((candidate) => candidate.kind === "numeric");
  if (!hasGeometry) numeric.forEach((candidate) => alignedNumericCandidates.add(candidate));
  else {
    for (const candidate of numeric) {
      const peers = numeric.filter((other) =>
        candidate.x !== null && other.x !== null && Math.abs(candidate.x - other.x) <= 24
      );
      if (new Set(peers.map((peer) => peer.proposal.reference)).size >= 3) {
        peers.forEach((peer) => alignedNumericCandidates.add(peer));
      }
    }
  }

  const alignedLabelledCandidates = new Set<ProposalCandidate>();
  const labelled = candidates.filter((candidate) => candidate.kind === "labelled");
  if (!hasGeometry) labelled.forEach((candidate) => alignedLabelledCandidates.add(candidate));
  else {
    for (const candidate of labelled) {
      const peers = labelled.filter((other) =>
        candidate.x !== null && other.x !== null && Math.abs(candidate.x - other.x) <= 24
      );
      if (new Set(peers.map((peer) => peer.proposal.reference)).size >= 2) {
        peers.forEach((peer) => alignedLabelledCandidates.add(peer));
      }
    }
  }

  const proposals = new Map<string, OcrProposal>();
  for (const candidate of candidates) {
    const proposal = candidate.proposal;
    if (candidate.kind === "color-bare" && !colorLegendContext && !proposal.reference.includes("/")) continue;
    if (candidate.kind === "color-inferred" && candidate.colorEvidence < 2 && !colorLegendContext) continue;
    if (candidate.kind === "numeric" && !alignedNumericCandidates.has(candidate)) continue;
    if (candidate.kind === "labelled" && !alignedLabelledCandidates.has(candidate)) continue;
    const key = proposal.reference.toLocaleUpperCase();
    const previous = proposals.get(key);
    if (!previous || proposal.confidence > previous.confidence) proposals.set(key, proposal);
  }
  return [...proposals.values()].sort((first, second) =>
    first.reference.localeCompare(second.reference, undefined, { numeric: true })
  );
};

const numericProposal = (proposal: OcrProposal): boolean =>
  proposal.markings.some((marking) => marking.type === "number");

const sameSourceRow = (first: OcrProposal, second: OcrProposal): boolean => {
  const firstBounds = first.sourceBounds;
  const secondBounds = second.sourceBounds;
  if (!firstBounds || !secondBounds) return false;
  const overlap = verticalOverlap(firstBounds, secondBounds);
  const minimumHeight = Math.max(1, Math.min(firstBounds.y1 - firstBounds.y0, secondBounds.y1 - secondBounds.y0));
  return overlap / minimumHeight >= 0.45 && Math.abs(firstBounds.x0 - secondBounds.x0) <= 32;
};

const comparableName = (value: string): string =>
  foldText(value).replace(/[^A-Z0-9]+/g, "");

/** Fusionne deux lectures du même cadrage sans conserver deux interprétations
 * concurrentes d'une même rangée (par exemple 11A et 114). */
export const mergeOcrProposalPasses = (
  primary: OcrProposal[],
  secondary: OcrProposal[]
): OcrProposal[] => {
  const merged = [...primary];
  for (const proposal of secondary) {
    const exactIndex = merged.findIndex((candidate) =>
      candidate.reference.toLocaleUpperCase() === proposal.reference.toLocaleUpperCase()
    );
    if (exactIndex >= 0) {
      if (proposal.confidence > merged[exactIndex].confidence) merged[exactIndex] = proposal;
      continue;
    }

    const conflictingIndex = numericProposal(proposal) ? merged.findIndex((candidate) => {
      if (!numericProposal(candidate) || !sameSourceRow(candidate, proposal)) return false;
      const firstName = comparableName(candidate.name);
      const secondName = comparableName(proposal.name);
      return firstName.length >= 4 && secondName.length >= 4 &&
        (firstName === secondName || firstName.includes(secondName) || secondName.includes(firstName));
    }) : -1;
    if (conflictingIndex >= 0) {
      if (proposal.confidence > merged[conflictingIndex].confidence) merged[conflictingIndex] = proposal;
      continue;
    }
    merged.push(proposal);
  }
  const confusableDigits: Record<string, string> = { O: "0", I: "1", L: "1", E: "3", H: "4", S: "5", B: "8" };
  const withoutConfusableDuplicates = merged.filter((proposal) => {
    if (!numericProposal(proposal) || !/[A-Z]/.test(proposal.reference) || proposal.reference.endsWith("A")) return true;
    const numericReading = proposal.reference.replace(/[OILEHSB]/g, (letter) => confusableDigits[letter]);
    return !merged.some((candidate) => numericProposal(candidate) && candidate.reference === numericReading);
  });
  return withoutConfusableDuplicates.sort((first, second) =>
    first.reference.localeCompare(second.reference, undefined, { numeric: true })
  );
};

/** Localise la colonne numérotée la plus cohérente afin qu'une seconde lecture
 * puisse l'agrandir sans mélanger les légendes voisines. */
export const numericLegendRegion = (
  proposals: OcrProposal[],
  sourceWidth: number,
  sourceHeight: number
): OcrRegion | null => {
  const numeric = proposals.filter((proposal) => numericProposal(proposal) && proposal.sourceBounds);
  if (numeric.length < 3 || sourceWidth <= 0 || sourceHeight <= 0) return null;

  const columns: OcrProposal[][] = [];
  for (const proposal of numeric.sort((first, second) =>
    first.sourceBounds!.x0 - second.sourceBounds!.x0
  )) {
    const column = columns.find((candidate) =>
      Math.abs(candidate[0].sourceBounds!.x0 - proposal.sourceBounds!.x0) <= 48
    );
    if (column) column.push(proposal);
    else columns.push([proposal]);
  }
  const viableColumns = columns.filter((column) =>
    new Set(column.map((proposal) => proposal.reference)).size >= 3
  );
  if (!viableColumns.length) return null;
  viableColumns.sort((first, second) => second.length - first.length);
  const selected = viableColumns[0];
  const columnX = selected.reduce((sum, proposal) => sum + proposal.sourceBounds!.x0, 0) / selected.length;
  const otherColumnStarts = columns
    .map((column) => column.reduce((sum, proposal) => sum + proposal.sourceBounds!.x0, 0) / column.length)
    .filter((x) => x > columnX + 80)
    .sort((first, second) => first - second);

  const left = Math.max(0, Math.floor(columnX - 28));
  const right = Math.min(
    sourceWidth,
    Math.ceil(otherColumnStarts.length
      ? otherColumnStarts[0] - 28
      : left <= sourceWidth * 0.1
        ? sourceWidth
        : left + Math.max(360, sourceWidth * 0.23))
  );
  const topDetected = Math.min(...selected.map((proposal) => proposal.sourceBounds!.y0));
  const bottomDetected = Math.max(...selected.map((proposal) => proposal.sourceBounds!.y1));
  const verticalPadding = Math.max(24, (bottomDetected - topDetected) * 0.1);
  const alreadyColumnCropped = left <= sourceWidth * 0.1;
  const top = alreadyColumnCropped ? 0 : Math.max(0, Math.floor(topDetected - verticalPadding));
  const bottom = alreadyColumnCropped ? sourceHeight : Math.min(sourceHeight, Math.ceil(bottomDetected + verticalPadding));
  if (right - left < 120 || bottom - top < 80) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const ocrStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    "loading tesseract core": "Chargement du moteur OCR",
    "initializing tesseract": "Initialisation du moteur OCR",
    "loading language traineddata": "Chargement du modèle de reconnaissance",
    "initializing api": "Préparation de la reconnaissance",
    "recognizing text": "Reconnaissance du texte"
  };
  return labels[status] || status;
};
