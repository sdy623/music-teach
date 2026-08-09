import type { EquifieldSection } from "@sparks-notation/core/equifield/equifield";
import type { ScoreIR } from "../ir/score";
import { displayTitleText, parseKeyAndMeterMarks, parseTempoExpression } from "../parser/parseTitle";
import { JPW_ACCIDENTAL_GLYPHS, JPW_DIGIT_GLYPHS, type VectorGlyph } from "../render/glyphs/jpwScoreGlyphs";

const SPARKS_HEADER_LABELS = new Set(["top", "author", "topMargin"]);
const SVG_NS = "http://www.w3.org/2000/svg";

export function isSparksHeaderField(field: EquifieldSection): boolean {
  return Boolean(field.label && SPARKS_HEADER_LABELS.has(field.label));
}

export function createJPWHeaderField(score: ScoreIR): EquifieldSection {
  const element = document.createElement("div");
  element.className = "jpw-header-field";

  appendText(element, "jpw-header-intro", displayTitleText(score.title.intro));
  appendText(element, "jpw-header-title", displayTitleText(score.title.title) || "Untitled");
  appendText(element, "jpw-header-subtitle", [displayTitleText(score.title.subTitle), displayTitleText(score.title.subTitle2)].filter(Boolean).join("\n"));
  appendText(element, "jpw-header-caption", displayTitleText(score.title.wordsByAndMusicBy));
  appendKeyAndMeter(element, score);
  appendExpression(element, score);

  return {
    element,
    height: 30,
    label: "jpwHeader",
    localeLabel: "JPW 表头"
  };
}

function appendText(parent: HTMLElement, className: string, text: string): void {
  if (!text.trim()) return;
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  parent.appendChild(node);
}

function appendKeyAndMeter(parent: HTMLElement, score: ScoreIR): void {
  const mark = parseKeyAndMeterMarks(score.title.keyAndMeters).find((candidate) => candidate.keyOfOne || candidate.numerator);
  if (!mark?.keyOfOne && !mark?.numerator) return;

  const row = document.createElement("div");
  row.className = "jpw-header-key-meter";

  if (mark?.keyOfOne) {
    row.appendChild(createKeyMark(mark.keyOfOne));
  }

  if (mark?.numerator && mark.denominator) {
    row.appendChild(createMeterFraction(mark.numerator, mark.denominator));
  }

  parent.appendChild(row);
}

function appendExpression(parent: HTMLElement, score: ScoreIR): void {
  const tempo = parseTempoExpression(score.title.expression);
  const expressionText = tempo ? [`=${tempo.bpm}`, tempo.expressionText].filter(Boolean).join(" ") : displayTitleText(score.title.expression);
  if (!expressionText.trim()) return;

  const row = document.createElement("div");
  row.className = "jpw-header-expression";
  if (tempo) row.appendChild(createTempoQuarterNote());
  const text = document.createElement("span");
  text.className = "jpw-header-expression-text";
  text.textContent = expressionText;
  row.appendChild(text);
  parent.appendChild(row);
}

function createKeyMark(keyOfOne: string): HTMLElement {
  const mark = document.createElement("span");
  mark.className = "jpw-header-key";
  mark.appendChild(createDigitGlyph(1, "jpw-header-key-digit"));
  appendPlainText(mark, "=");

  const accidental = keyOfOne.match(/^[#bn]/i)?.[0]?.toLowerCase();
  const letter = keyOfOne.replace(/^[#bn]/i, "");
  const accidentalGlyph = accidental ? accidentalGlyphFromKey(accidental) : undefined;
  if (accidentalGlyph) mark.appendChild(createVectorGlyph(accidentalGlyph, "jpw-header-key-accidental"));
  appendPlainText(mark, letter || keyOfOne);
  return mark;
}

function createMeterFraction(numeratorValue: number, denominatorValue: number): Element {
  const meter = document.createElement("span");
  meter.className = "jpw-header-meter";
  const numerator = createDigitRun(numeratorValue, "jpw-header-meter-digit");
  const line = document.createElement("span");
  line.className = "jpw-header-meter-line";
  const denominator = createDigitRun(denominatorValue, "jpw-header-meter-digit");
  meter.append(numerator, line, denominator);
  return meter;
}

function createDigitRun(value: number, className: string): HTMLElement {
  const run = document.createElement("span");
  run.className = "jpw-header-digit-run";
  String(value)
    .split("")
    .forEach((digit) => {
      const glyph = createDigitGlyph(Number(digit), className);
      if (glyph) run.appendChild(glyph);
    });
  return run;
}

function createDigitGlyph(digit: number, className: string): SVGSVGElement {
  return createVectorGlyph(JPW_DIGIT_GLYPHS[digit] ?? JPW_DIGIT_GLYPHS[0]!, className);
}

function accidentalGlyphFromKey(accidental: string): VectorGlyph | undefined {
  if (accidental === "#") return JPW_ACCIDENTAL_GLYPHS.sharp;
  if (accidental === "b") return JPW_ACCIDENTAL_GLYPHS.flat;
  if (accidental === "n") return JPW_ACCIDENTAL_GLYPHS.natural;
  return undefined;
}

function createVectorGlyph(glyph: VectorGlyph, className: string): SVGSVGElement {
  const padding = 0.28;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("jpw-header-vector-glyph", className);
  svg.setAttribute("viewBox", `${-glyph.width / 2 - padding} ${-glyph.height - padding} ${glyph.width + padding * 2} ${glyph.height + padding * 2}`);
  svg.setAttribute("aria-hidden", "true");
  svg.style.setProperty("--jpw-glyph-ratio", String(glyph.width / glyph.height));

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", glyph.d);
  path.setAttribute("fill", "currentColor");
  path.setAttribute("fill-rule", "evenodd");
  svg.appendChild(path);
  return svg;
}

function createTempoQuarterNote(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("jpw-header-tempo-note");
  svg.setAttribute("viewBox", "0 -12 7 12.6");
  svg.setAttribute("aria-hidden", "true");

  const head = document.createElementNS(SVG_NS, "ellipse");
  head.setAttribute("cx", "2.22");
  head.setAttribute("cy", "-1.62");
  head.setAttribute("rx", "1.56");
  head.setAttribute("ry", "1.08");
  head.setAttribute("transform", "rotate(-18 2.22 -1.62)");
  head.setAttribute("fill", "currentColor");

  const stem = document.createElementNS(SVG_NS, "line");
  stem.setAttribute("x1", "3.55");
  stem.setAttribute("x2", "3.55");
  stem.setAttribute("y1", "-1.88");
  stem.setAttribute("y2", "-10.8");
  stem.setAttribute("stroke", "currentColor");
  stem.setAttribute("stroke-width", "0.82");
  stem.setAttribute("stroke-linecap", "round");

  svg.append(head, stem);
  return svg;
}

function appendPlainText(parent: HTMLElement, text: string): void {
  const span = document.createElement("span");
  span.textContent = text;
  parent.appendChild(span);
}
