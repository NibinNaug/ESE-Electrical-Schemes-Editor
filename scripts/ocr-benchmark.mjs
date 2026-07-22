import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createWorker, OEM, PSM } from "tesseract.js";

import { mergeOcrProposalPasses, numericLegendRegion, proposalsFromOcrLines } from "../src/ocr.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "ocr");
const outputRoot = path.join(root, "tmp", "ocr-benchmark");
const requestedCases = new Set(process.argv.slice(2));
const requestedPsmEnvironment = process.env.ESE_OCR_PSM;
const requestedPsms = (requestedPsmEnvironment ?? PSM.SPARSE_TEXT).split(",").map((value) => value.trim()).filter(Boolean);
const adaptiveBlockPass = !requestedPsmEnvironment;

const publicCases = [
  {
    id: "loc-automotive-index",
    image: "public-domain/loc-automotive-index-page-0009.jpg",
    expectedReferences: [],
    purpose: "Dense index table: readable text must not become wire references."
  },
  {
    id: "loc-automotive-blueprint-0040",
    image: "public-domain/loc-automotive-blueprint-page-0040.jpg",
    expectedReferences: [],
    purpose: "Low-contrast blueprint with component names and incidental numbers."
  },
  {
    id: "loc-automotive-blueprint-0075",
    image: "public-domain/loc-automotive-blueprint-page-0075.jpg",
    expectedReferences: [],
    purpose: "Blueprint containing numbered spark plugs and switch terminals."
  },
  {
    id: "loc-automotive-blueprint-0150",
    image: "public-domain/loc-automotive-blueprint-page-0150.jpg",
    expectedReferences: [],
    purpose: "Automotive blueprint with voltage values and numbered plugs."
  },
  {
    id: "loc-automotive-blueprint-0500",
    image: "public-domain/loc-automotive-blueprint-page-0500.jpg",
    expectedReferences: [],
    purpose: "Dense truck wiring with labels close to circuit lines."
  },
  {
    id: "loc-automotive-blueprint-0650",
    image: "public-domain/loc-automotive-blueprint-page-0650.jpg",
    expectedReferences: [],
    purpose: "Mixed text orientations and wire-gauge annotations."
  },
  {
    id: "openclipart-utp-colours",
    image: "public-domain/openclipart-utp-cat5e-wiring.png",
    expectedReferences: [],
    purpose: "Coloured wires without a usable textual reference legend."
  }
];
const privateCasesPath = path.join(fixtureRoot, "local-private", "cases.json");
let privateCases = [];
try {
  privateCases = JSON.parse(await fs.readFile(privateCasesPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const cases = [...publicCases, ...privateCases];
const activeCases = requestedCases.size
  ? cases.filter((benchmarkCase) => requestedCases.has(benchmarkCase.id))
  : cases;

const linesFromResult = (data, offset = { x: 0, y: 0 }) => data.blocks?.flatMap((block) =>
  block.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => ({
    text: line.text,
    confidence: line.confidence,
    bbox: line.bbox ? {
      x0: offset.x + line.bbox.x0,
      y0: offset.y + line.bbox.y0,
      x1: offset.x + line.bbox.x1,
      y1: offset.y + line.bbox.y1
    } : undefined
  })))
) || data.text.split(/\r?\n/).map((text) => ({ text, confidence: data.confidence }));

const imageDimensions = async (imagePath) => {
  const bytes = await fs.readFile(imagePath);
  if (bytes.length >= 24 && bytes.subarray(1, 4).toString("ascii") === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  throw new Error(`Unsupported benchmark image: ${imagePath}`);
};

const ratio = (value) => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;

const scoreReferences = (expected, actual) => {
  const expectedSet = new Set(expected.map((value) => value.toUpperCase()));
  const actualSet = new Set(actual.map((value) => value.toUpperCase()));
  const truePositives = [...actualSet].filter((value) => expectedSet.has(value));
  const falsePositives = [...actualSet].filter((value) => !expectedSet.has(value));
  const falseNegatives = [...expectedSet].filter((value) => !actualSet.has(value));
  const precision = actualSet.size ? truePositives.length / actualSet.size : expectedSet.size ? 0 : 1;
  const recall = expectedSet.size ? truePositives.length / expectedSet.size : falsePositives.length ? 0 : 1;
  return {
    precision: ratio(precision),
    recall: ratio(recall),
    truePositives,
    falsePositives,
    falseNegatives
  };
};

await fs.mkdir(outputRoot, { recursive: true });

let currentProgress = "";
const worker = await createWorker("eng", OEM.LSTM_ONLY, {
  langPath: path.join(root, "public", "ocr"),
  cachePath: path.join(outputRoot, "cache"),
  logger: (message) => {
    const progress = `${message.status} ${Math.round((message.progress || 0) * 100)}%`;
    if (progress !== currentProgress) {
      currentProgress = progress;
      process.stdout.write(`\r${progress.padEnd(48)}`);
    }
  }
});

await worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "200" });

const results = [];
try {
  for (const benchmarkCase of activeCases) {
    const imagePath = path.join(fixtureRoot, benchmarkCase.image);
    try {
      await fs.access(imagePath);
    } catch {
      results.push({ ...benchmarkCase, skipped: true, reason: "fixture missing" });
      continue;
    }

    process.stdout.write(`\n${benchmarkCase.id}\n`);
    const recognitions = [];
    for (const pageSegmentationMode of requestedPsms) {
      await worker.setParameters({ tessedit_pageseg_mode: pageSegmentationMode });
      recognitions.push({
        pageSegmentationMode,
        data: (await worker.recognize(imagePath, {}, { text: true, blocks: true })).data
      });
    }
    const proposalPasses = recognitions.map((recognition) => proposalsFromOcrLines(linesFromResult(recognition.data)));
    let proposals = proposalPasses.reduce((merged, pass) => mergeOcrProposalPasses(merged, pass), []);
    const numericProposalCount = proposals.filter((proposal) =>
      proposal.markings.some((marking) => marking.type === "number")
    ).length;
    if (adaptiveBlockPass && numericProposalCount >= 3) {
      const dimensions = await imageDimensions(imagePath);
      const region = numericLegendRegion(proposals, dimensions.width, dimensions.height);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const blockRecognition = {
        pageSegmentationMode: PSM.SINGLE_BLOCK,
        data: (await worker.recognize(
          imagePath,
          region ? { rectangle: { left: region.x, top: region.y, width: region.width, height: region.height } } : {},
          { text: true, blocks: true }
        )).data,
        offset: { x: 0, y: 0 }
      };
      recognitions.push(blockRecognition);
      proposals = mergeOcrProposalPasses(
        proposals,
        proposalsFromOcrLines(linesFromResult(blockRecognition.data, blockRecognition.offset))
      );
    }
    const lines = recognitions.flatMap((recognition) => linesFromResult(recognition.data, recognition.offset));
    const actualReferences = proposals.map((proposal) => proposal.reference);
    const score = scoreReferences(benchmarkCase.expectedReferences, actualReferences);
    const result = {
      ...benchmarkCase,
      skipped: false,
      ocrConfidence: ratio(recognitions.reduce((sum, recognition) => sum + recognition.data.confidence, 0) / recognitions.length / 100),
      actualReferences,
      ...score,
      lines,
      rawText: recognitions.map((recognition) => `[PSM ${recognition.pageSegmentationMode}]\n${recognition.data.text}`).join("\n\n"),
      proposals
    };
    results.push(result);
    console.log(`  precision=${score.precision} recall=${score.recall}`);
    console.log(`  proposals=${actualReferences.join(", ") || "none"}`);
    if (score.falsePositives.length) console.log(`  false positives=${score.falsePositives.join(", ")}`);
    if (score.falseNegatives.length) console.log(`  missing=${score.falseNegatives.join(", ")}`);
  }
} finally {
  await worker.terminate();
  process.stdout.write("\n");
}

const completed = results.filter((result) => !result.skipped);
const summary = {
  generatedAt: new Date().toISOString(),
  pageSegmentationModes: requestedPsms,
  completed: completed.length,
  skipped: results.length - completed.length,
  meanPrecision: ratio(completed.reduce((sum, result) => sum + result.precision, 0) / Math.max(1, completed.length)),
  meanRecall: ratio(completed.reduce((sum, result) => sum + result.recall, 0) / Math.max(1, completed.length))
};

await fs.writeFile(
  path.join(outputRoot, "results.json"),
  `${JSON.stringify({ summary, results }, null, 2)}\n`,
  "utf8"
);

console.log(`Completed: ${summary.completed}; skipped: ${summary.skipped}`);
console.log(`Mean precision: ${summary.meanPrecision}; mean recall: ${summary.meanRecall}`);
console.log(`Detailed results: ${path.join(outputRoot, "results.json")}`);
