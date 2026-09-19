import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildPhraseJPWABC } from "../src/teaching/lesson";
import { buildInstrumentalMeasureFrame } from "../src/slide/buildLessonDeck";
import { formatInstrumentalCaption } from "../src/slide/teachingPresentation";
import SlidevJianpuPhrase from "../src/project/SlidevJianpuPhrase.vue";
import JianpuLessonSlide from "../src/slide/JianpuLessonSlide.vue";

function instrumental(voice: string, endMeasure: number, expression = "J=120", keyAndMeters = "1=C,4/4") {
  const score = parseJPWABC(buildPhraseJPWABC({
    title: "Caption example", voice, expression, keyAndMeters, words: ""
  })).value;
  const frame = buildInstrumentalMeasureFrame(score, 1, endMeasure, 0);
  if (!frame) throw new Error("Instrumental fixture did not produce a frame");
  return frame;
}

describe("instrumental accompaniment caption", () => {
  it("counts rests and augmentation strokes once in the performed duration", () => {
    const frame = instrumental("| 1 2 0 4 | 5--- |", 2);
    expect(formatInstrumentalCaption(frame)).toBe("伴奏 4 秒 · 2 小节");
  });

  it("uses actual quarter-note durations across a meter change", () => {
    const frame = instrumental("| 1 2 3 | 6/8 1_ 2_ 3_ 4_ 5_ 6_ |", 2, "J=90", "1=C,3/4");
    expect(frame.measures.map(measure => measure.denominator)).toEqual([4, 8]);
    expect(formatInstrumentalCaption(frame)).toBe("伴奏 4 秒 · 2 小节");
  });

  it("excludes visual context but includes a performed trailing tie", () => {
    const frame = instrumental("| 1 2 3 4 |", 1);
    const sample = frame.slots[0]!;
    frame.slots = [
      { ...sample, measure: 0, context: true, contextRole: "before", durationQuarters: 10 },
      ...frame.slots,
      { ...sample, measure: 2, context: true, contextRole: "after", tieGhost: true, durationQuarters: 1 },
      { ...sample, measure: 3, context: true, contextRole: "after", durationQuarters: 10 }
    ];
    expect(formatInstrumentalCaption(frame)).toBe("伴奏 2.5 秒 · 2 小节");
  });

  it("rounds to tenths and shares the player's tempo fallback", () => {
    const frame = instrumental("| 1 2 3 4 |", 1, "J=127");
    expect(formatInstrumentalCaption(frame)).toBe("伴奏 1.9 秒 · 1 小节");
    expect(formatInstrumentalCaption({ ...frame, tempo: undefined })).toBe("伴奏 3.3 秒 · 1 小节");
  });

  it("shows the caption only on instrumental slides and updates with tempo", async () => {
    const phrase = instrumental("| 1 2 0 4 | 5--- |", 2);
    const wrapper = mount(JianpuLessonSlide, { props: { phrase, annotation: "下一句进入" } });
    expect(wrapper.get(".lesson-interlude-caption").text()).toBe("伴奏 4 秒 · 2 小节");
    expect(wrapper.get(".lesson-interlude-band").text()).toContain("下一句进入");
    await wrapper.setProps({ phrase: { ...phrase, tempo: "60" } });
    expect(wrapper.get(".lesson-interlude-caption").text()).toBe("伴奏 8 秒 · 2 小节");
    await wrapper.setProps({ phrase: { ...phrase, kind: "vocal" } });
    expect(wrapper.find(".lesson-interlude-caption").exists()).toBe(false);
    expect(wrapper.find(".lesson-language-band").exists()).toBe(true);
    wrapper.unmount();
  });
});

it("honors the editable instrumental kind in project previews and players", async () => {
  const wrapper = mount(SlidevJianpuPhrase, {
    props: { voiceLine: "| 1 2 3 4 |", expression: "J=120", kind: "instrumental" }
  });
  expect(wrapper.get(".lesson-interlude-caption").text()).toBe("伴奏 2 秒 · 1 小节");
  await wrapper.setProps({ kind: "vocal" });
  expect(wrapper.find(".lesson-interlude-caption").exists()).toBe(false);
  await wrapper.setProps({ kind: "blank" });
  expect(wrapper.find(".slidev-jianpu-blank").exists()).toBe(true);
  wrapper.unmount();
});
