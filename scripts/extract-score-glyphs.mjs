import opentype from "opentype.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = {
  out: "src/render/glyphs/jpwScoreGlyphs.ts",
  report: "output/glyph-style-report.json",
  digitFont: "public/sparks-core-resources/font/noto_sans_display_extra_bold/noto_sans_display_extra_bold.ttf",
  accidentalFont: "public/sparks-core-resources/font/bravura/bravura.otf",
  digitHeight: 8.5,
  accidentalHeight: 10.205,
  decimals: 3
};

const DIGIT_SPECS = Object.fromEntries("01234567".split("").map((digit) => [digit, { char: digit }]));
const ACCIDENTAL_SPECS = {
  sharp: { codePoint: 0xe262 },
  natural: { codePoint: 0xe261 },
  flat: { codePoint: 0xe260 }
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!(key in args)) throw new Error(`Unknown option: ${token}`);
    args[key] = key.endsWith("Height") || key === "decimals" ? Number(next) : next;
    index += 1;
  }
  return args;
}

async function loadFont(fontPath) {
  const absolutePath = path.resolve(repoRoot, fontPath);
  const bytes = await readFile(absolutePath);
  const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return { font, fontPath: path.relative(repoRoot, absolutePath).replaceAll("\\", "/") };
}

function extractGlyph(fontInfo, spec, targetHeight, decimals) {
  const char = spec.char ?? String.fromCodePoint(spec.codePoint);
  const glyph = fontInfo.font.charToGlyph(char);
  if (!glyph || glyph.index === 0 && !spec.allowNotdef) {
    throw new Error(`Glyph ${describeSpec(spec)} was not found in ${fontInfo.fontPath}`);
  }

  const sourceBox = glyph.getBoundingBox();
  const sourceHeight = sourceBox.y2 - sourceBox.y1;
  if (sourceHeight <= 0) {
    throw new Error(`Glyph ${describeSpec(spec)} in ${fontInfo.fontPath} has an empty outline`);
  }

  const fontSize = (targetHeight * fontInfo.font.unitsPerEm) / sourceHeight;
  const rawPath = glyph.getPath(0, 0, fontSize);
  const rawBox = rawPath.getBoundingBox();
  const centeredX = -((rawBox.x1 + rawBox.x2) / 2);
  const baselineY = -rawBox.y2;
  const path = glyph.getPath(centeredX, baselineY, fontSize);
  const box = path.getBoundingBox();
  const d = pathToCubicData(path.commands, decimals);
  const stats = summarizeCommands(path.commands, box, glyph);

  return {
    d,
    width: round(box.x2 - box.x1, decimals),
    height: round(box.y2 - box.y1, decimals),
    source: {
      fontPath: fontInfo.fontPath,
      glyphName: glyph.name ?? `glyph${glyph.index}`,
      unicode: spec.char ?? `U+${spec.codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
      index: glyph.index,
      targetHeight
    },
    stats
  };
}

function describeSpec(spec) {
  return spec.char ? JSON.stringify(spec.char) : `U+${spec.codePoint.toString(16).toUpperCase()}`;
}

function summarizeCommands(commands, box, glyph) {
  const counts = { move: 0, line: 0, quadratic: 0, cubic: 0, close: 0 };
  for (const command of commands) {
    if (command.type === "M") counts.move += 1;
    if (command.type === "L") counts.line += 1;
    if (command.type === "Q") counts.quadratic += 1;
    if (command.type === "C") counts.cubic += 1;
    if (command.type === "Z") counts.close += 1;
  }
  const width = box.x2 - box.x1;
  const height = box.y2 - box.y1;
  return {
    contours: counts.move,
    commandCount: commands.length,
    commands: counts,
    aspectRatio: round(width / height, 4),
    advanceWidth: glyph.advanceWidth ?? 0,
    leftSideBearing: glyph.leftSideBearing ?? 0
  };
}

function pathToCubicData(commands, decimals) {
  let current = { x: 0, y: 0 };
  let contourStart = { x: 0, y: 0 };
  const parts = [];

  for (const command of commands) {
    if (command.type === "M") {
      current = { x: command.x, y: command.y };
      contourStart = current;
      parts.push(`M${fmt(command.x, decimals)} ${fmt(command.y, decimals)}`);
      continue;
    }
    if (command.type === "L") {
      current = { x: command.x, y: command.y };
      parts.push(`L${fmt(command.x, decimals)} ${fmt(command.y, decimals)}`);
      continue;
    }
    if (command.type === "Q") {
      const c1 = {
        x: current.x + (2 / 3) * (command.x1 - current.x),
        y: current.y + (2 / 3) * (command.y1 - current.y)
      };
      const c2 = {
        x: command.x + (2 / 3) * (command.x1 - command.x),
        y: command.y + (2 / 3) * (command.y1 - command.y)
      };
      current = { x: command.x, y: command.y };
      parts.push(
        `C${fmt(c1.x, decimals)} ${fmt(c1.y, decimals)} ${fmt(c2.x, decimals)} ${fmt(c2.y, decimals)} ${fmt(command.x, decimals)} ${fmt(command.y, decimals)}`
      );
      continue;
    }
    if (command.type === "C") {
      current = { x: command.x, y: command.y };
      parts.push(
        `C${fmt(command.x1, decimals)} ${fmt(command.y1, decimals)} ${fmt(command.x2, decimals)} ${fmt(command.y2, decimals)} ${fmt(command.x, decimals)} ${fmt(command.y, decimals)}`
      );
      continue;
    }
    if (command.type === "Z") {
      current = contourStart;
      parts.push("Z");
    }
  }

  return parts.join(" ");
}

function buildStyleProfile(fontInfos, glyphGroups) {
  const glyphs = Object.values(glyphGroups).flatMap((group) => Object.values(group));
  const commandTotals = glyphs.reduce(
    (totals, glyph) => {
      totals.move += glyph.stats.commands.move;
      totals.line += glyph.stats.commands.line;
      totals.quadratic += glyph.stats.commands.quadratic;
      totals.cubic += glyph.stats.commands.cubic;
      totals.close += glyph.stats.commands.close;
      return totals;
    },
    { move: 0, line: 0, quadratic: 0, cubic: 0, close: 0 }
  );
  const drawnCommands = commandTotals.line + commandTotals.quadratic + commandTotals.cubic;
  const curveRatio = drawnCommands ? (commandTotals.quadratic + commandTotals.cubic) / drawnCommands : 0;
  const averageAspectRatio = average(glyphs.map((glyph) => glyph.stats.aspectRatio));
  const averageCommands = average(glyphs.map((glyph) => glyph.stats.commandCount));

  return {
    method: "OpenType outline parse -> baseline normalization -> SVG cubic path",
    parser: "opentype.js",
    fonts: fontInfos.map(({ font, fontPath }) => ({
      path: fontPath,
      family: bestName(font.names.fontFamily),
      subfamily: bestName(font.names.fontSubfamily),
      fullName: bestName(font.names.fullName),
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascender,
      descender: font.descender,
      glyphCount: font.glyphs.length,
      outlineFlavor: font.tables?.cff ? "CFF/PostScript" : "TrueType/glyf"
    })),
    glyphSet: {
      count: glyphs.length,
      commandTotals,
      curveRatio: round(curveRatio, 4),
      averageAspectRatio: round(averageAspectRatio, 4),
      averageCommandCount: round(averageCommands, 2),
      classification: classifyGlyphSet(curveRatio, averageAspectRatio, averageCommands)
    }
  };
}

function classifyGlyphSet(curveRatio, averageAspectRatio, averageCommands) {
  const curveText = curveRatio > 0.55 ? "curved" : curveRatio > 0.25 ? "mixed" : "linear";
  const widthText = averageAspectRatio > 0.58 ? "wide" : averageAspectRatio > 0.36 ? "balanced" : "narrow";
  const complexityText = averageCommands > 36 ? "detailed" : averageCommands > 18 ? "medium-detail" : "simple";
  return `${widthText} ${curveText} ${complexityText} score glyph profile`;
}

function bestName(nameRecord) {
  return nameRecord?.en ?? nameRecord?.zh ?? nameRecord?.ja ?? Object.values(nameRecord ?? {})[0] ?? "";
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function fmt(value, decimals) {
  return String(round(value, decimals));
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function primitiveGlyph(width, height, d) {
  return { width, height, d };
}

function renderTsFile(digitGlyphs, accidentalGlyphs, profile) {
  return `// Generated by npm run glyphs:extract.
// Edit scripts/extract-score-glyphs.mjs or the source font files, then regenerate.

export interface GlyphSource {
  fontPath: string;
  glyphName: string;
  unicode: string;
  index: number;
  targetHeight: number;
}

export interface GlyphOutlineStats {
  contours: number;
  commandCount: number;
  commands: {
    move: number;
    line: number;
    quadratic: number;
    cubic: number;
    close: number;
  };
  aspectRatio: number;
  advanceWidth: number;
  leftSideBearing: number;
}

export interface VectorGlyph {
  d: string;
  width: number;
  height: number;
  source?: GlyphSource;
  stats?: GlyphOutlineStats;
}

export const JPW_SCORE_GLYPH_HEIGHT = ${DEFAULTS.digitHeight};

export const JPW_GLYPH_STYLE_PROFILE = ${JSON.stringify(profile, null, 2)} as const;

export const JPW_DIGIT_GLYPHS: Record<number, VectorGlyph> = ${formatObjectWithNumericKeys(digitGlyphs)};

export const JPW_DURATION_GLYPHS = {
  dash: ${formatObject(primitiveGlyph(5.443, 1.276, "M-2.721 -1.276 L2.721 -1.276 L2.721 0 L-2.721 0 Z"))},
  underline: ${formatObject(primitiveGlyph(5.442, 0.595, "M-2.721 -0.595 L2.721 -0.595 L2.721 0 L-2.721 0 Z"))}
} as const satisfies Record<string, VectorGlyph>;

export const JPW_ACCIDENTAL_GLYPHS = ${formatObject(accidentalGlyphs)} as const satisfies Record<string, VectorGlyph>;
`;
}

function formatObjectWithNumericKeys(record) {
  const entries = Object.entries(record).map(([key, value]) => `  ${key}: ${formatObject(value, 2)}`);
  return `{\n${entries.join(",\n")}\n}`;
}

function formatObject(value, spaces = 2) {
  return JSON.stringify(value, null, spaces).replace(/"([A-Za-z_$][\w$]*)":/g, "$1:");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const digitFont = await loadFont(args.digitFont);
  const accidentalFont = await loadFont(args.accidentalFont);
  const digitGlyphs = Object.fromEntries(
    Object.entries(DIGIT_SPECS).map(([digit, spec]) => [digit, extractGlyph(digitFont, spec, args.digitHeight, args.decimals)])
  );
  const accidentalGlyphs = Object.fromEntries(
    Object.entries(ACCIDENTAL_SPECS).map(([name, spec]) => [name, extractGlyph(accidentalFont, spec, args.accidentalHeight, args.decimals)])
  );
  const profile = buildStyleProfile([digitFont, accidentalFont], {
    digits: digitGlyphs,
    accidentals: accidentalGlyphs
  });

  const outPath = path.resolve(repoRoot, args.out);
  const reportPath = path.resolve(repoRoot, args.report);
  await mkdir(path.dirname(outPath), { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(outPath, renderTsFile(digitGlyphs, accidentalGlyphs, profile));
  await writeFile(reportPath, `${JSON.stringify(profile, null, 2)}\n`);
  console.log(`Extracted ${Object.keys(digitGlyphs).length + Object.keys(accidentalGlyphs).length} glyphs`);
  console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, reportPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
