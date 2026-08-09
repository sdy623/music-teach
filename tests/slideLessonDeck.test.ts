import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeJPWABC } from "../src/core/decode";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildLessonDeck } from "../src/slide/buildLessonDeck";
import { layoutPhrase } from "../src/slide/layoutPhrase";

function loadFixture(name: string) {
  const buffer = readFileSync(`public/fixtures/${name}`);
  return parseJPWABC(decodeJPWABC(new Uint8Array(buffer).buffer)).value;
}

describe("teaching slide lesson deck", () => {
  it("builds phrases from the public-domain Sakura fixture", () => {
    const score = loadFixture("sakura.jpwabc");
    const deck = buildLessonDeck(score);

    expect(deck.title).toBe("さくら");
    expect(deck.phrases.length).toBeGreaterThan(0);
    expect(deck.phrases[0]?.normalizedText).toContain("さくら");
    expect(deck.phrases[0]?.sourceAnchor.startMeasure).toBe(1);
    expect(score.semantic.readingOverrides).toHaveLength(1);
  });

  it("aligns lyric extenders without adding them to normalized text", () => {
    const score = parseJPWABC(`
.Voice
1 2 3 |
.Words
W1@1,1:
あーい
`).value;
    const phrase = buildLessonDeck(score).phrases[0]!;
    const extension = phrase.lyricCells.find((cell) => cell.kind === "extension");

    expect(phrase.normalizedText).toBe("あい");
    expect(extension?.eventId).toBeTruthy();
    expect(extension?.inheritedTokenId).toBeTruthy();
  });

  it("uses JPW lyric jump marks as explicit empty score slots", () => {
    const withoutJump = buildLessonDeck(
      parseJPWABC(`
.Voice
(5 5) 6 |
.Words
W1@1,1:
あい
`).value
    ).phrases[0]!;
    const withJump = buildLessonDeck(
      parseJPWABC(`
.Voice
(5 5) 6 |
.Words
W1@1,1:
あ/い
`).value,
      { softBreakMode: "linguistic" }
    ).phrases[0]!;

    expect(withoutJump.slots.map((slot) => slot.lyricCell?.display)).toEqual(["あ", "い"]);
    expect(withJump.slots.map((slot) => slot.lyricCell?.display)).toEqual(["あ", undefined, "い"]);
  });

  it("projects attachment key changes into anchored phrases", () => {
    const score = parseJPWABC(`
.Title
Title = {Key change test}
KeyAndMeters = {1=C,4/4}
.Voice
1 2 | 3 4 |
.Words
W1@1,1:
あいうえ
.Attachments
Text@2,1(0.65,-2.07) = AttachText1, 转{1=E},{0.8,0.8}
`).value;
    const deck = buildLessonDeck(score);
    const changePhrase = deck.phrases.find((phrase) => phrase.keyChanges.length > 0);

    expect(changePhrase?.keyChanges[0]).toMatchObject({ keyOfOne: "E", measure: 2, noteIndex: 1 });
    expect(layoutPhrase(changePhrase!).keyChanges[0]?.change.keyOfOne).toBe("E");
  });

  it("keeps reduction beams inside their beat", () => {
    const deck = buildLessonDeck(loadFixture("notation-reference.jpwabc"));
    const phrase = deck.phrases.find((candidate) =>
      candidate.slots.some((slot) => slot.underlines >= 2)
    );
    expect(phrase).toBeDefined();

    const geometry = layoutPhrase(phrase!);
    expect(geometry.beams.length).toBeGreaterThan(0);
    geometry.beams.forEach((beam) => {
      expect(
        geometry.beats.some(
          (beat) => beam.x1 >= beat.x - 0.001 && beam.x2 <= beat.x + beat.width + 0.001
        )
      ).toBe(true);
    });
  });

  it("keeps the title meter stable and renders temporary meters inline", () => {
    const score = parseJPWABC(`
.Title
Title = {Meter test}
KeyAndMeters = {1=C,4/4}
.Voice
4/4 | 1 2 | 2/4 3__ 4__ || 4/4 5 6 |
.Words
W1@1,1:
あいうえおか
`).value;
    const phrase = buildLessonDeck(score).phrases[0]!;

    expect(phrase.titleMeter).toEqual({ numerator: 4, denominator: 4 });
    expect(phrase.measures.some((measure) => measure.meterChanged && measure.numerator === 2)).toBe(true);
  });

  it("supports explicit phrase cuts by aligned music slot", () => {
    const score = parseJPWABC(`
.Voice
1 2 3 4 5 6 |
.Words
W1@1,1:
あいうえおか
`).value;
    const deck = buildLessonDeck(score, {
      splitPhrases: [{ text: "あいうえおか", afterSlots: [3] }]
    });

    expect(deck.phrases.map((phrase) => phrase.normalizedText)).toEqual(["あいう", "えおか"]);
  });
});
