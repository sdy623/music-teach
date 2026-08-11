import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlidevJianpuPhrase from "../src/project/SlidevJianpuPhrase.vue";

describe("SlidevJianpuPhrase", () => {
  it("renders one JPWABC line as an importable 16:9 Vue slide", () => {
    const wrapper = mount(SlidevJianpuPhrase, {
      props: {
        voiceLine: "| 1_ 2_ 3_ 4_ | 5 6 5 3 |",
        lyricText: "さくらさくら",
        referenceReading: "さくらさくら",
        title: "さくら",
        credits: "山田太郎 词曲 · 教学合唱团 演唱",
        tags: ["LESSON", "FOLK"],
        section: "Verse",
        annotation: "两小节后进入演唱",
        phraseCount: 4,
        progressSections: [
          { id: "verse", label: "Verse", startPhrase: 0, endPhrase: 1 },
          { id: "chorus", label: "Chorus", startPhrase: 2, endPhrase: 3 }
        ],
        teachingMarks: [
          {
            id: "sakura-word",
            surface: "さくら",
            label: "語彙",
            explanation: "樱花",
            tone: "vocabulary"
          }
        ]
      }
    });

    expect(wrapper.find("svg").exists()).toBe(true);
    expect(wrapper.findAll(".phrase-score-lyric").length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("Verse");
    expect(wrapper.text()).toContain("さくら");
    expect(wrapper.text()).toContain("两小节后进入演唱");
    expect(wrapper.find(".lesson-header-credits").text()).toContain("教学合唱团 演唱");
    expect(wrapper.find(".lesson-song-tags").text()).toContain("LESSON");
    expect(wrapper.find(".lesson-song-heading").text()).not.toContain("[");
    expect(wrapper.find("[data-teaching-original]").text()).toBe("さくらさくら");
    expect(wrapper.find("[data-teaching-mark-id='sakura-word']").exists()).toBe(true);
    expect(wrapper.findAll(".lesson-song-progress-section")).toHaveLength(2);
  });

  it("restores exported mora positions and key changes by stable slot index", () => {
    const wrapper = mount(SlidevJianpuPhrase, {
      props: {
        voiceLine: "| 1 2 3 4 |",
        lyricText: "青い空",
        referenceReading: "あおいそら",
        lyricJpwabc: "{あお}いそー",
        lyricCells: [
          {
            id: "mora-1",
            kind: "multiChar",
            raw: "{あお}",
            display: "あお",
            normalizedText: "あお",
            slotIndex: 0
          },
          {
            id: "mora-2",
            kind: "syllable",
            raw: "い",
            display: "い",
            normalizedText: "い",
            slotIndex: 1
          },
          {
            id: "mora-3",
            kind: "syllable",
            raw: "そ",
            display: "そ",
            normalizedText: "そ",
            slotIndex: 2
          },
          {
            id: "mora-4",
            kind: "extension",
            raw: "ー",
            display: "ー",
            normalizedText: "",
            slotIndex: 3
          }
        ],
        keyOfOne: "D",
        keyChanges: [
          {
            id: "modulation-1",
            slotIndex: 2,
            keyOfOne: "♭E",
            display: "转1=♭E",
            semitoneShift: 1
          }
        ]
      }
    });

    expect(
      wrapper.findAll(".phrase-score-lyric").map((node) => node.text())
    ).toEqual(["あお", "い", "そ", "ー"]);
    expect(wrapper.find("[data-key-change-id='modulation-1']").exists()).toBe(true);
    expect(wrapper.find(".phrase-key-change-shift").text()).toBe("+1key");
    expect(wrapper.findAll("ruby.lesson-ruby-token").length).toBeGreaterThan(1);
    expect(wrapper.findAll("ruby.lesson-ruby-token rt").map((node) => node.text())).toEqual([
      "あお",
      "そら"
    ]);
    expect(wrapper.find(".lesson-reading").exists()).toBe(false);
    expect(wrapper.find(".lesson-coach-note").exists()).toBe(false);
    expect(wrapper.find(".lesson-language-notes").exists()).toBe(true);
    expect(wrapper.find(".lesson-language-notes-reserved").exists()).toBe(true);
  });

  it("renders compound-kanji ruby from an imported project's reference reading", () => {
    const wrapper = mount(SlidevJianpuPhrase, {
      props: {
        voiceLine: "| 1 2 3 4 |",
        lyricText: "教材音で伝える",
        referenceReading: "きょうざいおんでつたえる",
        morphology: [
          { id: "morph-1", surface: "教材音", reading: "教材音", needsReview: true },
          { id: "morph-2", surface: "で", reading: "で", needsReview: false },
          { id: "morph-3", surface: "伝える", reading: "伝える", needsReview: true },
        ]
      }
    });

    expect(
      wrapper.findAll("ruby.lesson-ruby-token").map((node) => node.find("span").text()).join("")
    ).toBe("教材音で伝える");
    expect(wrapper.findAll("ruby.lesson-ruby-token rt").map((node) => node.text())).toEqual([
      "きょうざいおん",
      "つた"
    ]);
  });
});
