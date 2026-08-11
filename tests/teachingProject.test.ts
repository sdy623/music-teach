import { describe, expect, it } from "vitest";
import {
  analyzeJapaneseReference,
  createTeachingProject,
  formatProjectCredits,
  removeSectionBreak,
  resolvePhraseSection,
  setSectionBreak,
  splitLyricsOnBlankLines,
  splitProjectPhrase
} from "../src/project/projectBuilder";

describe("teaching project builder", () => {
  it("uses blank lines as phrase boundaries", () => {
    expect(
      splitLyricsOnBlankLines(
        "街明かり\n照らした\n\nにぎやかな笑い声と\n\n\n路地裏の足跡"
      )
    ).toEqual([
      "街明かり照らした",
      "にぎやかな笑い声と",
      "路地裏の足跡"
    ]);
  });

  it("provides editable morphology and hiragana reference output", () => {
    const result = analyzeJapaneseReference("サクラと青い空");

    expect(result.referenceReading).toContain("さくら");
    expect(result.tokens.some((token) => token.needsReview)).toBe(true);
  });

  it("creates phrases and supports a manual character cut", () => {
    const project = createTeachingProject(
      "さくら lesson",
      "はじまりのあいずならせば\nうたおう"
    );
    const split = splitProjectPhrase(project.phrases[0]!, 8, 0);

    expect(project.phrases).toHaveLength(1);
    expect(split?.map((phrase) => phrase.lyricText)).toEqual([
      "はじまりのあいず",
      "ならせばうたおう"
    ]);
    expect(split?.[0].voiceLine).toBe(project.phrases[0]?.voiceLine);
  });

  it("assigns sections from timeline split points", () => {
    const base = createTeachingProject(
      "段落测试",
      "第一句\n\n第二句\n\n第三句\n\n第四句"
    );
    const withChorus = setSectionBreak(
      base,
      base.phrases[2]!.id,
      "chorus"
    );

    expect(withChorus.sectionBreaks).toHaveLength(2);
    expect(resolvePhraseSection(withChorus, 0)).toBe("verse");
    expect(resolvePhraseSection(withChorus, 1)).toBe("verse");
    expect(resolvePhraseSection(withChorus, 2)).toBe("chorus");
    expect(resolvePhraseSection(withChorus, 3)).toBe("chorus");

    const withoutChorus = removeSectionBreak(
      withChorus,
      base.phrases[2]!.id
    );
    expect(resolvePhraseSection(withoutChorus, 3)).toBe("verse");
  });

  it("combines matching lyricist and composer as a suffix credit", () => {
    expect(
      formatProjectCredits({
        lyricist: "山田太郎",
        composer: "山田太郎",
        arranger: "",
        otherCredits: "{山田太郎}词曲,{教学合唱团}演唱"
      })
    ).toBe("山田太郎 词曲 · 教学合唱团 演唱");

    expect(
      formatProjectCredits({
        lyricist: "作词者",
        composer: "作曲者",
        arranger: "编曲者",
        otherCredits: ""
      })
    ).toBe("作词 作词者 · 作曲 作曲者 · 编曲 编曲者");
  });
});
