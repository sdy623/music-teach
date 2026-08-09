import { describe, expect, it } from "vitest";
import {
  highOctaveDotY,
  JIANPU_METRICS,
  lowOctaveDotY,
  meterBeatGroups,
  meterBeatPattern,
  underlineY
} from "../src/notation/jianpuRules";
import {
  accidentalGlyph,
  barlineGlyphGeometry,
  SMUFL_GLYPHS,
  splitKeyOfOne,
  timeSignatureText
} from "../src/notation/smufl";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildLessonDeck } from "../src/slide/buildLessonDeck";
import { layoutPhrase } from "../src/slide/layoutPhrase";

function phraseFrom(voice: string, words: string, meter = "4/4") {
  const score = parseJPWABC(`
.Title
Title = {Notation rules}
KeyAndMeters = {1=C,${meter}}
.Voice
${voice}
.Words
W1@1,1:
${words}
`).value;
  const phrase = buildLessonDeck(score).phrases[0];
  if (!phrase) throw new Error("Expected a lyric phrase");
  return phrase;
}

describe("Jianpu publishing rules", () => {
  it("uses compound and irregular beat groups from the publishing examples", () => {
    expect(meterBeatPattern(4, 4)).toEqual([1, 1, 1, 1]);
    expect(meterBeatPattern(3, 8)).toEqual([3]);
    expect(meterBeatPattern(6, 8)).toEqual([3, 3]);
    expect(meterBeatPattern(9, 8)).toEqual([3, 3, 3]);
    expect(meterBeatPattern(5, 8)).toEqual([2, 3]);
    expect(meterBeatPattern(5, 4)).toEqual([3, 2]);
    expect(meterBeatGroups(6, 8).map((group) => group.durationQuarters)).toEqual([1.5, 1.5]);
  });

  it("keeps every diminished-time level connected across one continuous beat", () => {
    const phrase = phraseFrom(
      "1___ 2___ 3___ 4___ 5___ 6___ 7___ 1g___ |",
      "あいうえおかきく"
    );
    const geometry = layoutPhrase(phrase);
    const counts = [1, 2, 3].map(
      (level) => geometry.beams.filter((beam) => beam.level === level).length
    );

    expect(counts).toEqual([1, 1, 1]);
    expect(geometry.beams.filter((beam) => beam.level === 1)[0]?.x1).toBeLessThan(
      geometry.beams.filter((beam) => beam.level === 1)[0]?.x2 ?? 0
    );
  });

  it("joins both diminished-time lines across four sixteenth notes in one beat", () => {
    const phrase = phraseFrom("1__ 2__ 3__ 4__ |", "ったえた");
    const geometry = layoutPhrase(phrase);
    const firstLevel = geometry.beams.filter((beam) => beam.level === 1);
    const secondLevel = geometry.beams.filter((beam) => beam.level === 2);

    expect(firstLevel).toHaveLength(1);
    expect(secondLevel).toHaveLength(1);
    expect(secondLevel[0]).toMatchObject({
      x1: firstLevel[0]?.x1,
      x2: firstLevel[0]?.x2
    });
  });

  it("joins eighth-note lines by dotted-quarter beat in 6/8", () => {
    const phrase = phraseFrom("1_ 2_ 3_ 4_ 5_ 6_ |", "あいうえおか", "6/8");
    const geometry = layoutPhrase(phrase);

    expect(phrase.measures[0]?.beats).toHaveLength(2);
    expect(phrase.measures[0]?.beats.map((beat) => beat.slots.length)).toEqual([3, 3]);
    expect(geometry.beams.filter((beam) => beam.level === 1)).toHaveLength(2);
  });

  it("never joins diminished-time lines across unit beats", () => {
    const phrase = phraseFrom("1_ 2_ 3_ 4_ 5_ 6_ 7_ 1g_ |", "あいうえおかきく");
    const geometry = layoutPhrase(phrase);
    const firstLevel = geometry.beams.filter((beam) => beam.level === 1);

    expect(firstLevel).toHaveLength(4);
    firstLevel.slice(1).forEach((beam, index) => {
      expect(beam.x1).toBeGreaterThan(firstLevel[index]!.x2);
    });
  });

  it("places low octave dots below every diminished-time line", () => {
    expect(highOctaveDotY(0)).toBeLessThan(126);
    expect(lowOctaveDotY(0, 0)).toBeGreaterThan(126);
    expect(lowOctaveDotY(0, 3)).toBeGreaterThan(underlineY(3));
    expect(
      lowOctaveDotY(0, 3) - underlineY(3)
    ).toBeGreaterThanOrEqual(JIANPU_METRICS.lowOctaveDotClearance);
  });

  it("keeps two-note triplets inside their structural boundary", () => {
    const phrase = phraseFrom("{(3}2_ 3 | 4_ 5_ |", "あいうえ");
    const tuplet = phrase.curves.find((curve) => curve.type === "tuplet");
    const endSlot = phrase.slots.find((slot) => slot.sourceEventId === tuplet?.endEventId);

    expect(tuplet).toBeDefined();
    expect(endSlot?.raw).toBe("3");
    expect(endSlot?.measure).toBe(1);
  });

  it("keeps slur endpoints clear of digits and octave dots", () => {
    const phrase = phraseFrom("(1g_ 2g_) |", "あい");
    const curve = layoutPhrase(phrase).curves[0];

    expect(curve).toBeDefined();
    expect(curve!.baseY).toBeLessThan(highOctaveDotY(0) - 7);
    expect(curve!.apexY).toBeLessThan(curve!.baseY);
  });

  it("uses the performed duration of a triplet for later note positions", () => {
    const phrase = phraseFrom("{(3}1_ 2_ 3_ 4 |", "あいうえ");
    const fourth = phrase.slots.find((slot) => slot.raw === "4");

    expect(fourth?.measureOffsetQuarter).toBeCloseTo(1, 6);
    expect(phrase.curves.find((curve) => curve.type === "tuplet")).toMatchObject({
      startEventId: phrase.slots[0]?.sourceEventId,
      endEventId: phrase.slots[2]?.sourceEventId
    });
  });

  it("reserves optical room for accidentals in dense beats", () => {
    const phrase = phraseFrom(
      "1___ b2___ 3___ 4___ 5___ n6___ 7___ #1g___ |",
      "あいうえおかきく"
    );
    const geometry = layoutPhrase(phrase);
    const slots = geometry.slots;

    for (let index = 1; index < slots.length; index += 1) {
      const previous = slots[index - 1]!;
      const current = slots[index]!;
      const previousRight = previous.x + 13;
      const currentLeft = current.x - 13 - (current.slot.accidental ? 14 : 0);
      expect(currentLeft).toBeGreaterThanOrEqual(previousRight + 3.9);
    }
  });

  it("uses SMuFL glyphs and correct repeat-bar stroke order", () => {
    expect(SMUFL_GLYPHS.accidentalFlat.codePointAt(0)).toBe(0xe260);
    expect(SMUFL_GLYPHS.metronomeQuarterUp.codePointAt(0)).toBe(0xeca5);
    expect(accidentalGlyph("natural")).toBe(SMUFL_GLYPHS.accidentalNatural);
    expect(splitKeyOfOne("bE")).toEqual({
      accidental: SMUFL_GLYPHS.accidentalFlat,
      letter: "E"
    });
    expect(timeSignatureText(24).split("").map((glyph) => glyph.codePointAt(0))).toEqual([
      0xe082,
      0xe084
    ]);
    expect(barlineGlyphGeometry("start-repeat")).toMatchObject({
      strokes: [{ width: 5.2 }, { width: 1.7 }],
      repeatDots: "right"
    });
    expect(barlineGlyphGeometry("end-repeat")).toMatchObject({
      strokes: [{ width: 1.7 }, { width: 5.2 }],
      repeatDots: "left"
    });
  });

  it("keeps double and final barline stroke semantics distinct", () => {
    const double = barlineGlyphGeometry("double");
    const final = barlineGlyphGeometry("end");

    expect(double.strokes).toHaveLength(2);
    expect(double.strokes[0]?.width).toBe(double.strokes[1]?.width);
    expect(final.strokes[0]!.dx).toBeLessThan(final.strokes[1]!.dx);
    expect(final.strokes[1]!.width / final.strokes[0]!.width).toBeGreaterThan(3);
    expect(final.repeatDots).toBeUndefined();
  });

  it("keeps start and end repeat barlines on opposite measure edges", () => {
    const phrase = phraseFrom("|: 1 2 :|", "あい");

    expect(phrase.measures[0]).toMatchObject({
      startingBarline: "start-repeat",
      endingBarline: "end-repeat"
    });
  });
});
