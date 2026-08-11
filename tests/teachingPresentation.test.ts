import { describe, expect, it } from "vitest";
import {
  buildSongProgressSections,
  buildTeachingRubyTokens,
  buildTeachingTextSegments,
  teachingSentenceFontSize
} from "../src/slide/teachingPresentation";

describe("teaching slide presentation helpers", () => {
  it("highlights original-text grammar and vocabulary with configurable colors", () => {
    const segments = buildTeachingTextSegments(
      "青空を見上げた",
      [
        { id: "past", surface: "見上げた", label: "過去形", tone: "grammar" },
        { id: "sky", surface: "青空", label: "語彙", tone: "vocabulary" }
      ],
      { grammar: "#aa0000", vocabulary: "#007755" }
    );

    expect(segments.map((segment) => segment.text).join("")).toBe("青空を見上げた");
    expect(segments.find((segment) => segment.id === "past")?.color).toBe("#aa0000");
    expect(segments.find((segment) => segment.id === "sky")?.color).toBe("#007755");
  });

  it("builds full-song progress sections from phrase split points", () => {
    expect(
      buildSongProgressSections(
        ["p1", "p2", "p3", "p4", "p5"],
        { p1: "verse", p3: "chorus" },
        (section) => section.toUpperCase()
      )
    ).toEqual([
      { id: "verse", label: "VERSE", startPhrase: 0, endPhrase: 1 },
      { id: "chorus", label: "CHORUS", startPhrase: 2, endPhrase: 4 }
    ]);
  });

  it("builds verified word-level ruby instead of one sentence-wide reading", () => {
    const tokens = buildTeachingRubyTokens(
      "青い空　青い海",
      "あおいそらあおいうみ"
    );

    expect(tokens.map((token) => token.surface).join("")).toBe("青い空　青い海");
    expect(tokens.filter((token) => token.reading)).toEqual([
      expect.objectContaining({ surface: "青", reading: "あお" }),
      expect.objectContaining({ surface: "空", reading: "そら" }),
      expect.objectContaining({ surface: "青", reading: "あお" }),
      expect.objectContaining({ surface: "海", reading: "うみ" })
    ]);
  });

  it("does not confuse a kana anchor with the start of a kanji reading", () => {
    const tokens = buildTeachingRubyTokens(
      "教材音で伝える",
      "きょうざいおんでつたえる"
    );

    expect(tokens.filter((token) => token.reading)).toEqual([
      expect.objectContaining({ surface: "教材音", reading: "きょうざいおん" }),
      expect.objectContaining({ surface: "伝", reading: "つた" })
    ]);
  });

  it("aligns kanji groups separated only by lyric spacing", () => {
    const tokens = buildTeachingRubyTokens(
      "花を見る事　理由はいらない",
      "はなをみることりゆうはいらない"
    );

    expect(tokens.filter((token) => token.reading)).toEqual([
      expect.objectContaining({ surface: "花", reading: "はな" }),
      expect.objectContaining({ surface: "見", reading: "み" }),
      expect.objectContaining({ surface: "事", reading: "こと" }),
      expect.objectContaining({ surface: "理由", reading: "りゆう" })
    ]);
  });

  it("slightly reduces long original sentences from the 36px base size", () => {
    expect(teachingSentenceFontSize("花を見る事　理由はいらない")).toBe(36);
    expect(teachingSentenceFontSize("あ".repeat(21))).toBe(34);
    expect(teachingSentenceFontSize("あ".repeat(27))).toBe(32);
  });

  it("does not invent ruby when a mixed numeric reading cannot be verified", () => {
    const tokens = buildTeachingRubyTokens("第2章", "だいにしょう");
    expect(tokens).toEqual([expect.objectContaining({ surface: "第2章" })]);
    expect(tokens[0]).not.toHaveProperty("reading");
  });
});
