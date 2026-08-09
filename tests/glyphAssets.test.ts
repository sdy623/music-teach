import { describe, expect, it } from "vitest";
import {
  JPW_ACCIDENTAL_GLYPHS,
  JPW_DIGIT_GLYPHS,
  JPW_DURATION_GLYPHS,
  JPW_GLYPH_STYLE_PROFILE
} from "../src/render/glyphs/jpwScoreGlyphs";

describe("JPW vector glyph assets", () => {
  it("contains OTF/TTF extracted score digits 0-7", () => {
    for (const degree of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(JPW_DIGIT_GLYPHS[degree]?.d.startsWith("M")).toBe(true);
      expect(JPW_DIGIT_GLYPHS[degree]?.height).toBeGreaterThan(8);
      expect(JPW_DIGIT_GLYPHS[degree]?.source?.fontPath).toContain("noto_sans_display_extra_bold.ttf");
      expect(JPW_DIGIT_GLYPHS[degree]?.stats?.contours).toBeGreaterThan(0);
    }
  });

  it("contains extracted duration line glyphs", () => {
    expect(JPW_DURATION_GLYPHS.dash.height).toBeGreaterThan(JPW_DURATION_GLYPHS.underline.height);
    expect(JPW_DURATION_GLYPHS.underline.d).toContain("L2.721");
  });

  it("contains extracted accidentals", () => {
    expect(JPW_ACCIDENTAL_GLYPHS.sharp.source?.unicode).toBe("U+E262");
    expect(JPW_ACCIDENTAL_GLYPHS.flat.source?.unicode).toBe("U+E260");
    expect(JPW_ACCIDENTAL_GLYPHS.natural.source?.unicode).toBe("U+E261");
    expect(JPW_ACCIDENTAL_GLYPHS.sharp.source?.fontPath).toContain("bravura.otf");
    expect(JPW_ACCIDENTAL_GLYPHS.flat.height).toBeCloseTo(10.205, 3);
  });

  it("records a style fingerprint for the generated glyph set", () => {
    expect(JPW_GLYPH_STYLE_PROFILE.parser).toBe("opentype.js");
    expect(JPW_GLYPH_STYLE_PROFILE.glyphSet.count).toBe(11);
    expect(JPW_GLYPH_STYLE_PROFILE.glyphSet.curveRatio).toBeGreaterThan(0.25);
    expect(JPW_GLYPH_STYLE_PROFILE.glyphSet.classification).toContain("score glyph profile");
  });
});
