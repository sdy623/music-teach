import { JPW_DIGIT_GLYPHS, JPW_SCORE_GLYPH_HEIGHT } from "../render/glyphs/jpwScoreGlyphs";
import { augmentationStroke, engravingStyle, type EngravingStyle, type InkBox } from "./engravingGeometry";

export const PRINT_GLYPH_SCALE = 2.6 / JPW_SCORE_GLYPH_HEIGHT;
export const PRINT_DASH_ADVANCE = 3;
export const PRINT_ENGRAVING = engravingStyle(5.2, { digitTop: -2.6, digitBottom: 0, dotRadius: 0.28 });
export { PHRASE_ENGRAVING } from "./engravingGeometry";

// Ink bounds and advance measured from the bundled SIL OFL Noto Sans Display ExtraBold.
// Coordinates use 1000 units/em; SVG text-anchor centres the advance, not the ink.
const PHRASE_DIGITS: Record<string, [number, number, number, number, number]> = {
  "0": [34, 461, -724, 10, 495], "1": [40, 390, -714, 0, 495],
  "2": [21, 449, -724, 0, 495], "3": [31, 455, -724, 10, 495],
  "4": [16, 482, -715, 0, 495], "5": [47, 453, -714, 10, 495],
  "6": [32, 464, -724, 10, 495], "7": [35, 461, -714, 0, 495],
  "X": [0, 545, -714, 0, 546]
};

export function phraseDigitInk(digit: string, x: number, baseline: number, style: EngravingStyle): InkBox {
  const bounds = PHRASE_DIGITS[digit];
  if (!bounds) return { left: x - style.em * 0.3, right: x + style.em * 0.3,
    top: baseline + style.digitTop, bottom: baseline + style.digitBottom };
  return { left: x + (bounds[0] - bounds[4] / 2) * style.em / 1000,
    right: x + (bounds[1] - bounds[4] / 2) * style.em / 1000,
    top: baseline + bounds[2] * style.em / 1000, bottom: baseline + bounds[3] * style.em / 1000 };
}

export function printDigitInk(degree: number | undefined, x: number, baseline: number): InkBox {
  const width = (JPW_DIGIT_GLYPHS[degree ?? 0]?.width ?? JPW_SCORE_GLYPH_HEIGHT * 0.7) * PRINT_GLYPH_SCALE;
  return { left: x - width / 2, right: x + width / 2, top: baseline - 2.6, bottom: baseline };
}

export function printAugmentation(x: number, baseline: number, dash: number, dots = 0) {
  return augmentationStroke(x + PRINT_DASH_ADVANCE * (dash + 1) + dots * 0.95,
    baseline, PRINT_ENGRAVING, printDigitInk(0, x, baseline).right - printDigitInk(0, x, baseline).left);
}
