import { describe, expect, it } from "vitest";
import { normalizeLyricForNLP, parseLyricCells, parseWords } from "../src/parser/wordsParser";

describe("words parser", () => {
  it("treats Japanese extension mark as melisma extender", () => {
    const cells = parseLyricCells("まちあかりーてらーーしたー");
    expect(cells.filter((cell) => cell.kind === "extension")).toHaveLength(4);
    expect(normalizeLyricForNLP(cells)).toBe("まちあかりてらした");
  });

  it("parses Wn@measure,note blocks", () => {
    const result = parseWords("W1@7,2:\n{きっ}とー//会える\nW2@8,1: また");
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.anchor).toEqual({ measure: 7, note: 2 });
    expect(result.value[0]?.cells[0]?.kind).toBe("multiChar");
    expect(result.value[0]?.cells.find((cell) => cell.kind === "separator")).toMatchObject({
      raw: "//",
      skipSlots: 2,
      consumesNoteSlot: false
    });
  });

  it("accepts JPW show-number flags without swallowing the next lyric track", () => {
    const result = parseWords(
      "W1(True)@14,1:\nはかなく\nW2(True)@14,1:\nすきになる"
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toHaveLength(2);
    expect(result.value.map((block) => block.track)).toEqual([1, 2]);
    expect(result.value.map((block) => block.showNumber)).toEqual([true, true]);
    expect(result.value.map((block) => block.anchor.measure)).toEqual([14, 14]);
  });

  it("uses JPW braces and unspaced Latin text as one lyric slot", () => {
    const cells = parseLyricCells("うた{おう}na na na！");
    const aligned = cells.filter((cell) => cell.consumesNoteSlot);

    expect(aligned.map((cell) => cell.display)).toEqual([
      "う",
      "た",
      "おう",
      "na",
      "na",
      "na！"
    ]);
    expect(aligned.map((cell) => cell.kind)).toEqual([
      "syllable",
      "syllable",
      "multiChar",
      "syllable",
      "syllable",
      "syllable"
    ]);
  });

  it("attaches punctuation to the preceding Japanese or braced cell", () => {
    const japanese = parseLyricCells("歌う！");
    const braced = parseLyricCells("{しょう}！");

    expect(japanese.filter((cell) => cell.consumesNoteSlot).map((cell) => cell.display)).toEqual([
      "歌",
      "う！"
    ]);
    expect(braced).toHaveLength(1);
    expect(braced[0]).toMatchObject({
      kind: "multiChar",
      raw: "{しょう}！",
      display: "しょう！",
      consumesNoteSlot: true
    });
  });
});
