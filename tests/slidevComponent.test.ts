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
        section: "Verse",
        annotation: "两小节后进入演唱"
      }
    });

    expect(wrapper.find("svg").exists()).toBe(true);
    expect(wrapper.text()).toContain("Verse");
    expect(wrapper.text()).toContain("さくら");
    expect(wrapper.text()).toContain("两小节后进入演唱");
  });
});
