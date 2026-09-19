/*!
 * Curve construction adapted from jpeditor, Copyright (c) 2026 lodebar2026.
 * MIT License; see THIRD_PARTY_NOTICES.md. Reference: 3e264a7b950d450ba920bb3989a5497de5fb8147.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/** All distances use the renderer's own coordinates; em is the digit font size. */
export interface EngravingStyle {
  em: number;
  digitTop: number;
  digitBottom: number;
  belowGap: number;
  aboveGap: number;
  beamGap: number;
  lineWidth: number;
  dotRadius: number;
}

export interface InkBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface EngravedLine {
  x1: number;
  x2: number;
  y: number;
  thickness: number;
  d: string;
}

export interface EngravedCurve {
  x1: number;
  x2: number;
  baseY: number;
  apexY: number;
  d: string;
  mode: "arc" | "flat";
}

export function engravingStyle(em: number, overrides: Partial<EngravingStyle> = {}): EngravingStyle {
  return {
    em,
    digitTop: -em * 0.724,
    digitBottom: em * 0.01,
    belowGap: em / 9,
    aboveGap: em / 6,
    beamGap: em * 7 / 60,
    lineWidth: em / 20,
    dotRadius: em / 15,
    ...overrides
  };
}

export const PHRASE_ENGRAVING = engravingStyle(43);

/** The first beam clears the digit's ink, subsequent levels share one baseline ladder. */
export function reductionY(level: number, baseline: number, style: EngravingStyle): number {
  return baseline + style.digitBottom + style.belowGap + style.lineWidth / 2 + (level - 1) * style.beamGap;
}

export function octaveY(index: number, octave: number, underlines: number, baseline: number, style: EngravingStyle): number {
  if (octave > 0) {
    return baseline + style.digitTop - style.aboveGap - style.dotRadius - index * (style.aboveGap + 2 * style.dotRadius);
  }
  const bottom = underlines > 0
    ? reductionY(underlines, baseline, style) + style.lineWidth / 2
    : baseline + style.digitBottom;
  return bottom + style.belowGap + style.dotRadius + index * (style.belowGap + 2 * style.dotRadius);
}

export function notationTop(octave: number, baseline: number, style: EngravingStyle): number {
  return octave > 0
    ? octaveY(octave - 1, octave, 0, baseline, style) - style.dotRadius
    : baseline + style.digitTop;
}

export function horizontalStroke(x1: number, x2: number, y: number, thickness: number): EngravedLine {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = y - thickness / 2;
  const bottom = y + thickness / 2;
  return { x1: left, x2: right, y, thickness,
    d: `M ${f(left)} ${f(top)} L ${f(right)} ${f(top)} L ${f(right)} ${f(bottom)} L ${f(left)} ${f(bottom)} Z` };
}

/** An extension is a separate beat cell, with its stroke centred on the digit's ink. */
export function augmentationStroke(centerX: number, baseline: number, style: EngravingStyle, width = style.em * 0.5): EngravedLine {
  // A duration dash needs numeral-like weight, independent of thin reduction beams.
  return horizontalStroke(centerX - width / 2, centerX + width / 2,
    baseline + (style.digitTop + style.digitBottom) / 2, style.em / 10);
}

/** Include zero-level entries: filtering them out first would bridge unrelated subdivisions. */
export function contiguousBeamRuns<T>(items: readonly T[], level: number, count: (item: T) => number): T[][] {
  const runs: T[][] = [];
  let run: T[] = [];
  for (const item of items) {
    if (count(item) < level) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(item);
  }
  if (run.length) runs.push(run);
  return runs;
}

/** jpeditor's bounded logarithmic rise, normalized to em before evaluating it. */
function arcRise(span: number, em: number): number {
  const normalizedSpan = Math.max(span * 28 / em, 1e-6);
  return Math.min(18, Math.max(10, Math.log10(normalizedSpan) * 17 - 16)) * em / 28;
}

export function engravedCurve(
  x1: number,
  x2: number,
  baseY: number,
  style: EngravingStyle,
  options: { type?: "slur" | "tie"; noteCount?: number; continuedLeft?: boolean; continuedRight?: boolean } = {}
): EngravedCurve {
  const span = Math.max(style.em * 0.05, x2 - x1);
  const end = x1 + span;
  const threshold = style.em * 5;
  const flat = span > threshold || (options.noteCount ?? 0) >= 6 || Boolean(options.continuedLeft || options.continuedRight);
  const h = arcRise(flat ? Math.min(span, threshold) : span, style.em);
  const rise = h * 0.75;
  const top = baseY - rise;
  const thickness = style.em * (options.type === "tie" ? 0.075 : 0.065);
  let d: string;
  if (flat) {
    const hx = Math.min(span * 0.12, rise * 2.5);
    const leftShoulder = x1 + (options.continuedLeft ? 0 : hx);
    const rightShoulder = end - (options.continuedRight ? 0 : hx);
    const leftTip = options.continuedLeft ? top : baseY;
    const rightTip = options.continuedRight ? top : baseY;
    const parts = [`M ${f(x1)} ${f(leftTip)}`];
    if (!options.continuedLeft) parts.push(`C ${f(x1 + hx * 0.15)} ${f(baseY - rise * 0.55)} ${f(x1 + hx * 0.45)} ${f(top)} ${f(leftShoulder)} ${f(top)}`);
    parts.push(`L ${f(rightShoulder)} ${f(top)}`);
    if (!options.continuedRight) {
      parts.push(`C ${f(end - hx * 0.45)} ${f(top)} ${f(end - hx * 0.15)} ${f(baseY - rise * 0.55)} ${f(end)} ${f(rightTip)}`);
      parts.push(`C ${f(end - hx * 0.15)} ${f(baseY - rise * 0.55 + thickness)} ${f(end - hx * 0.45)} ${f(top + thickness)} ${f(rightShoulder)} ${f(top + thickness)}`);
    } else parts.push(`L ${f(end)} ${f(top + thickness)}`);
    parts.push(`L ${f(leftShoulder)} ${f(top + thickness)}`);
    if (!options.continuedLeft) parts.push(`C ${f(x1 + hx * 0.45)} ${f(top + thickness)} ${f(x1 + hx * 0.15)} ${f(baseY - rise * 0.55 + thickness)} ${f(x1)} ${f(baseY)}`);
    parts.push("Z");
    d = parts.join(" ");
  } else {
    const shoulder = Math.min(span * 0.04 + style.em * 10 / 28, span * 0.25);
    // Both ends coincide; the return control points create thickness only inside the curve.
    const innerY = baseY - h + thickness / 0.75;
    d = `M ${f(x1)} ${f(baseY)} C ${f(x1 + shoulder)} ${f(baseY - h)} ${f(end - shoulder)} ${f(baseY - h)} ${f(end)} ${f(baseY)} C ${f(end - shoulder)} ${f(innerY)} ${f(x1 + shoulder)} ${f(innerY)} ${f(x1)} ${f(baseY)} Z`;
  }
  return { x1, x2: end, baseY, apexY: top, d, mode: flat ? "flat" : "arc" };
}

function f(value: number): string {
  return Number(value.toFixed(4)).toString();
}
