import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { engravingStyle, octaveY, reductionY } from "../src/notation/engravingGeometry";
import { phraseDigitInk } from "../src/notation/notationProfiles";

const opentype = createRequire(import.meta.url)("opentype.js");
const bytes = readFileSync("public/sparks-core-resources/font/noto_sans_display_extra_bold/noto_sans_display_extra_bold.ttf");
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

describe("public phrase font calibration", () => {
  it.each([24, 43])("matches the shipped font ink at %s px and clears all octave dots/beams", (em) => {
    const style = engravingStyle(em);
    const x = 80;
    const baseline = 100;
    for (const digit of "01234567X") {
      const glyph = font.charToGlyph(digit);
      const advance = glyph.advanceWidth * em / font.unitsPerEm;
      const bounds = glyph.getPath(x - advance / 2, baseline, em).getBoundingBox();
      const ink = phraseDigitInk(digit, x, baseline, style);
      expect(ink.left).toBeCloseTo(bounds.x1, 5);
      expect(ink.right).toBeCloseTo(bounds.x2, 5);
      expect(ink.top).toBeCloseTo(bounds.y1, 5);
      expect(ink.bottom).toBeCloseTo(bounds.y2, 5);
      expect(octaveY(0, 1, 0, baseline, style) + style.dotRadius).toBeLessThan(ink.top);
      expect(reductionY(1, baseline, style) - style.lineWidth / 2).toBeGreaterThan(ink.bottom);
    }
  });
});
