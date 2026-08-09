import { describe, expect, it } from "vitest";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildPhraseJPWABC } from "../src/teaching/lesson";
import { displayTitleText } from "../src/parser/parseTitle";

describe("lesson phrase helpers", () => {
  it("builds a standalone phrase JPWABC document", () => {
    const source = buildPhraseJPWABC({
      title: "さくら lesson",
      keyAndMeters: "1=A,4/4",
      expression: "J=73",
      voice: "4/4 | 5 1g 2g 3g |",
      words: "さくらさく",
      wordsAnchor: { measure: 1, note: 1 }
    });

    const parsed = parseJPWABC(source).value;

    expect(displayTitleText(parsed.title.title)).toBe("さくら lesson");
    expect(parsed.voices[0]?.events.some((event) => event.kind === "note")).toBe(true);
    expect(parsed.lyrics[0]?.normalizedText).toBe("さくらさく");
  });

  it("keeps lyric phrases independent from original barline boundaries", () => {
    const source = buildPhraseJPWABC({
      title: "mid-measure lyric phrase",
      keyAndMeters: "1=A,4/4",
      voice: "5 6 | 1g 2g",
      words: "まだここ",
      lyricStart: "phrase-start",
      originalAnchor: {
        measure: 25,
        note: 3,
        startsInsideMeasure: true,
        endsInsideMeasure: true
      }
    });

    const parsed = parseJPWABC(source).value;

    expect(parsed.voices[0]?.measures).toHaveLength(2);
    expect(parsed.lyricAlignments).toHaveLength(4);
    expect(parsed.lyricAlignments.map((alignment) => alignment.measure)).toEqual([1, 1, 2, 2]);
  });
});
