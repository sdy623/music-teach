import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deserializeTeachingProject,
  downloadTeachingProject,
  serializeTeachingProject
} from "../src/project/projectExport";
import { createTeachingProject } from "../src/project/projectBuilder";
import { convertParsedScoreToTeachingProject } from "../src/project/jpwabcProject";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildLessonDeck } from "../src/slide/buildLessonDeck";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("teaching project export", () => {
  it("serializes and downloads the complete project as JSON", () => {
    vi.useFakeTimers();
    const project = createTeachingProject("导出测试", "第一句");
    project.id = "export-test";
    project.artist = "教学合唱团";
    project.tags = ["LESSON"];
    project.phrases[0]!.voiceLine = "| 1 2 3 4 |";
    project.phrases[0]!.lyricJpwabc = "{第一}句ーー";
    project.phrases[0]!.lyricCells = [
      {
        id: "cell-1",
        kind: "multiChar",
        raw: "{第一}",
        display: "第一",
        normalizedText: "第一",
        slotIndex: 0
      },
      {
        id: "cell-2",
        kind: "extension",
        raw: "ー",
        display: "ー",
        normalizedText: "",
        slotIndex: 1
      }
    ];
    project.phrases[0]!.keyOfOne = "D";
    project.phrases[0]!.keyChanges = [
      {
        id: "key-1",
        slotIndex: 2,
        keyOfOne: "♭E",
        display: "转1=♭E",
        semitoneShift: 1
      }
    ];

    const restored = deserializeTeachingProject(serializeTeachingProject(project));
    expect(restored).toMatchObject({
      formatVersion: 3,
      id: "export-test",
      title: "导出测试",
      artist: "教学合唱团",
      tags: ["LESSON"],
      phrases: [
        expect.objectContaining({
          voiceLine: "| 1 2 3 4 |",
          lyricJpwabc: "{第一}句ーー",
          keyOfOne: "D",
          keyChanges: [expect.objectContaining({ slotIndex: 2, semitoneShift: 1 })]
        })
      ]
    });
    expect(restored.phrases[0]?.lyricCells).toEqual(project.phrases[0]?.lyricCells);

    const createObjectURL = vi.fn(() => "blob:teaching-project");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL }
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadTeachingProject(project);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="export-test.json"]')).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:teaching-project");
  });

  it("round-trips original text, readings, aligned cells and rendered frames", () => {
    const score = parseJPWABC(`
.Title
Title = 春の練習曲
KeyAndMeters = 1=D,4/4
.Voice
| 1 2 3 4 5 |
.Words
W1@1,1:
あおいそら
`).value;
    const deck = buildLessonDeck(score, { id: "round-trip", tags: ["LESSON"] });
    deck.phrases[0]!.teaching = {
      originalText: "青い空",
      reading: "あおいそら",
      rubyTokens: [
        { id: "ruby-blue", surface: "青", reading: "あお" },
        { id: "ruby-sky", surface: "空", reading: "そら" }
      ]
    };

    const converted = convertParsedScoreToTeachingProject(
      score,
      "round-trip",
      deck
    ).project;
    const restored = deserializeTeachingProject(serializeTeachingProject(converted));
    const phrase = restored.phrases[0]!;

    expect(restored.formatVersion).toBe(3);
    expect(restored.tags).toEqual(["LESSON"]);
    expect(phrase.lyricText).toBe("青い空");
    expect(phrase.referenceReading).toBe("あおいそら");
    expect(phrase.morphology).toEqual([
      expect.objectContaining({ surface: "青", reading: "あお" }),
      expect.objectContaining({ surface: "い", reading: "" }),
      expect.objectContaining({ surface: "空", reading: "そら" })
    ]);
    expect(phrase.lyricCells).toHaveLength(5);
    expect(phrase.lyricCells.map((cell) => cell.slotIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(phrase.frame).toEqual(converted.phrases[0]?.frame);
  });

  it("keeps explicit tie skips and one lyric over multiple mora slots", () => {
    const score = parseJPWABC(`
.Title
Title = 往返测试
.Voice
(5 5) 6 6 |
.Words
W1@1,1:
あ/いー
`).value;
    const deck = buildLessonDeck(score, { softBreakMode: "linguistic" });
    const converted = convertParsedScoreToTeachingProject(
      score,
      "mora-round-trip",
      deck
    ).project;
    const phrase = deserializeTeachingProject(
      serializeTeachingProject(converted)
    ).phrases[0]!;

    expect(phrase.lyricJpwabc).toBe("あいー");
    expect(phrase.frame?.slots.map((slot) => ({
      tieGhost: slot.tieGhost,
      lyric: slot.lyricCell?.display,
      lyricKind: slot.lyricCell?.kind
    }))).toEqual([
      { tieGhost: false, lyric: "あ", lyricKind: "syllable" },
      { tieGhost: true, lyric: undefined, lyricKind: undefined },
      { tieGhost: false, lyric: "い", lyricKind: "syllable" },
      { tieGhost: false, lyric: "ー", lyricKind: "extension" }
    ]);
    expect(phrase.lyricCells.at(-1)).toEqual(
      expect.objectContaining({
        kind: "extension",
        raw: "ー",
        inheritedTokenId: expect.any(String),
        slotIndex: 3
      })
    );
  });

  it("migrates older JSON to the automatic lyric fallback", () => {
    const restored = deserializeTeachingProject(JSON.stringify({
      id: "legacy-data",
      title: "旧工程",
      phrases: [
        {
          id: "legacy-phrase",
          lyricText: "学校",
          referenceReading: "がっこう",
          voiceLine: "| 1 2 3 4 |",
          kind: "vocal"
        }
      ]
    }));

    expect(restored.formatVersion).toBe(3);
    expect(restored.phrases[0]).toMatchObject({
      lyricJpwabc: "がっこう",
      lyricCells: [],
      keyChanges: []
    });
  });
});
