import { describe, expect, it } from "vitest";
import { graceGeometry, type GraceMetrics } from "../src/notation/graceGeometry";
import { noteDecorations, tupletArc } from "../src/notation/noteDecorations";
import { engravingStyle, notationTop } from "../src/notation/engravingGeometry";
import { PHRASE_ENGRAVING, PRINT_ENGRAVING, phraseDigitInk } from "../src/notation/notationProfiles";

// Independent reference: jpeditor's rendered default 28 pt SVG, plus the
// 64d4afa common/gracenote.ts model measured in 20 pt numeral ink.
const reference: GraceMetrics = { ink: 20, scale: 0.59, octaveUpY: -24.6666667,
  octaveDownY: 8.0266667, octaveDotGap: 8.0266667, octaveDotRadius: 1.68, underlineGap: 3.5 };

describe("JP-Word tuplet and jpeditor grace visual conformance", () => {
  it("matches the JP-Word curved, tapered form with its number centred in the crown gap", () => {
    const style = engravingStyle(17, { digitTop: -8.5, digitBottom: 0 });
    const arc = tupletArc(496.431, 524.444, 486.469, style);
    expect(arc.x1).toBeCloseTo(495.751, 3);
    expect(arc.x2).toBeCloseTo(525.124, 3);
    expect(arc.y).toBeCloseTo(481.9045, 3);
    expect(arc.top).toBeCloseTo(479.4565, 3);
    expect(arc.d.match(/ C /g)).toHaveLength(4);
    expect(arc.d.match(/ Z/g)).toHaveLength(2);
    expect(arc.d).not.toMatch(/\b[HV]\b/);
    expect(arc.strokeWidth).toBe(0);
  });

  it("matches the reference two-note grace beam and downward cubic hook", () => {
    const geometry = graceGeometry([{ digit: "5", octave: 0 }, { digit: "7", octave: 0 }], reference, 0, 0, -1, 28, 0);
    expect(geometry.digits.map(digit => digit.cx)).toEqual([-22.3, -13.3]);
    expect(geometry.beams[0]!.w).toBeCloseTo(16.76);
    expect(geometry.beams[0]!.h).toBeCloseTo(1.1);
    expect(geometry.hook!.m[0]).toBeCloseTo(-13.3);
    expect(geometry.hook!.c[5] - geometry.hook!.m[1]).toBeCloseTo(6.08);
    expect(geometry.hook!.c[4] - geometry.hook!.m[0]).toBeCloseTo(4.98);
  });

  it("keeps low dots and the hook on the same axis with a clear gap", () => {
    const geometry = graceGeometry([{ digit: "6", octave: -2 }], reference, 0, 0, -1, 28, 0);
    expect(geometry.dots.map(dot => dot.r)).toEqual([0.84, 0.84]);
    expect(geometry.dots[0]!.cy - geometry.dots[0]!.r - (geometry.beams[0]!.y + geometry.beams[0]!.h)).toBeCloseTo(2);
    expect(geometry.hook!.m[0]).toBe(geometry.dots[1]!.cx);
    expect(geometry.hook!.m[1] - (geometry.dots[1]!.cy + geometry.dots[1]!.r)).toBeCloseTo(2);
  });

  it.each([false, true])("places grace bottoms on the main octave stack without raising ornaments (print=%s)", print => {
    const style = print ? PRINT_ENGRAVING : PHRASE_ENGRAVING;
    const main = { octave: 1, ornaments: ["fermata" as const] };
    const plain = noteDecorations(main, 80, 100, style, print);
    const decorated = noteDecorations({ ...main, graceNotes: [{ raw: "6,", degree: 6, octave: -1 }] }, 80, 100, style, print);
    expect(decorated.ornaments).toEqual(plain.ornaments);
    expect(decorated.grace.hook!.c[5] + decorated.hookWidth / 2).toBeCloseTo(notationTop(1, 100, style));
    expect(decorated.hook).toContain(" C ");
  });

  it("centres each reduced numeral by its own ink, including a narrow 1", () => {
    const layout = noteDecorations({ graceNotes: [1, 6, 7].map(degree => ({ raw: String(degree), degree, octave: 0 })) }, 80, 100, PHRASE_ENGRAVING);
    for (const digit of layout.digits) {
      const ink = phraseDigitInk(String(digit.note.degree), digit.x, digit.y, layout.small);
      expect((ink.left + ink.right) / 2).toBeCloseTo(digit.cx);
      expect((ink.top + ink.bottom) / 2).toBeCloseTo(digit.cy);
    }
  });
});
