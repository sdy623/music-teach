import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildLessonDeck } from "../src/slide/buildLessonDeck";
import JianpuTitleSlide from "../src/slide/JianpuTitleSlide.vue";

describe("JianpuTitleSlide", () => {
  it("renders structured JPW credits and genre tags on the title page", () => {
    const score = parseJPWABC(`
.Title
Title = 春の練習曲
KeyAndMeters = {1=F,4/4}
WordsByAndMusicBy = {{山田太郎}词曲,{教学合唱团}演唱}
Expression = {J=96}
.Voice
| 1 2 3 4 |
.Words
W1@1,1:
あいうえ
`).value;
    const deck = buildLessonDeck(score, { tags: ["FOLK", "LESSON"] });
    const wrapper = mount(JianpuTitleSlide, {
      props: {
        phrase: deck.phrases[0]!,
        artist: deck.artist,
        credits: deck.credits,
        tags: deck.tags
      }
    });

    expect(wrapper.find(".title-slide-topline").text()).toContain("山田太郎 词曲");
    expect(wrapper.find(".title-slide-topline").text()).toContain("教学合唱团 演唱");
    expect(wrapper.findAll(".title-genre-tags li").map((item) => item.text())).toEqual([
      "FOLK",
      "LESSON"
    ]);
  });
});
