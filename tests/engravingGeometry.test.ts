import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { augmentationStroke, engravedCurve, engravingStyle, octaveY, reductionY } from "../src/notation/engravingGeometry";
import { PHRASE_ENGRAVING, PRINT_ENGRAVING, printAugmentation } from "../src/notation/notationProfiles";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildPrintLayout } from "../src/layout/printLayout";
import { buildLessonDeck } from "../src/slide/buildLessonDeck";
import { layoutPhrase } from "../src/slide/layoutPhrase";
import SvgPage from "../src/render/SvgPage.vue";
import JianpuPhraseNotation from "../src/slide/JianpuPhraseNotation.vue";

function scoreFrom(voice: string, meter = "4/4", words = "あいうえおかきく") {
  return parseJPWABC(`.Title\nTitle = {Engraving regression}\nKeyAndMeters = {1=C,${meter}}\n.Voice\n${voice}\n.Words\nW1@1,1:\n${words}\n`).value;
}

function beamsFor(voice: string, meter = "4/4") {
  return buildPrintLayout(scoreFrom(voice, meter)).pages.flatMap(page => page.items).filter(item => item.kind === "beam");
}

describe("shared engraving geometry", () => {
  it("keeps short curves above the notes and closed, including very short spans", () => {
    for (const span of [0, 0.01, 4, 20, 80]) {
      const curve = engravedCurve(10, 10 + span, 100, PHRASE_ENGRAVING);
      expect(curve.apexY).toBeLessThan(curve.baseY);
      expect(curve.x2).toBeGreaterThan(curve.x1);
      expect(curve.d.endsWith("Z")).toBe(true);
      expect(curve.d).not.toMatch(/NaN|Infinity/);
    }
  });

  it("caps the height of long slurs and gives them a flat centre", () => {
    const near = engravedCurve(10, 226, 100, PHRASE_ENGRAVING);
    const far = engravedCurve(10, 1110, 100, PHRASE_ENGRAVING);
    expect(near.mode).toBe("flat");
    expect(far.mode).toBe("flat");
    expect(far.apexY).toBeCloseTo(near.apexY);
    expect(far.d).toContain(" L ");
    expect(engravedCurve(10, 130, 100, PHRASE_ENGRAVING, { noteCount: 6 }).mode).toBe("flat");
  });

  it("scales curve ink with the digit size, including the arc/flat transition", () => {
    for (const span of [25, 150, 600]) {
      const a = engravedCurve(10, 10 + span, 100, engravingStyle(43));
      const b = engravedCurve(20, 20 + span * 2, 200, engravingStyle(86));
      expect(b.mode).toBe(a.mode);
      expect(b.apexY).toBeCloseTo(a.apexY * 2);
      const aPoints = a.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const bPoints = b.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      bPoints.forEach((value, index) => expect(value).toBeCloseTo(aPoints[index]! * 2, 3));
    }
  });

  it("uses equal ink clearance from digit to beam and from the last beam to low dots", () => {
    for (const style of [PRINT_ENGRAVING, PHRASE_ENGRAVING, engravingStyle(24)]) {
      const firstGap = reductionY(1, 100, style) - style.lineWidth / 2 - (100 + style.digitBottom);
      for (const levels of [1, 2, 3]) {
        const lastBottom = reductionY(levels, 100, style) + style.lineWidth / 2;
        const dotTop = octaveY(0, -1, levels, 100, style) - style.dotRadius;
        expect(dotTop - lastBottom).toBeCloseTo(firstGap);
      }
    }
  });

  it("centres augmentation strokes on the digit ink and reserves one cell per dash", () => {
    const stroke = augmentationStroke(80, 100, PHRASE_ENGRAVING);
    expect((stroke.x1 + stroke.x2) / 2).toBe(80);
    expect(stroke.y).toBeCloseTo(100 + (PHRASE_ENGRAVING.digitTop + PHRASE_ENGRAVING.digitBottom) / 2);
    const dashes = [0, 1, 2].map(index => printAugmentation(20, 58, index, 1));
    expect(dashes[1]!.x1 - dashes[0]!.x1).toBeCloseTo(dashes[2]!.x1 - dashes[1]!.x1);
    expect(dashes[0]!.x2).toBeLessThan(dashes[1]!.x1);
  });
});

describe("print and phrase engraving integration", () => {
  it("splits secondary beams around an eighth note instead of bridging over it", () => {
    const score = scoreFrom("1__ 2_ 3__ |", "4/4", "あいう");
    const printed = buildPrintLayout(score).pages.flatMap(page => page.items).filter(item => item.kind === "beam");
    expect(printed.filter(item => item.level === 1)).toHaveLength(1);
    const secondary = printed.filter(item => item.level === 2);
    expect(secondary).toHaveLength(2);
    expect(secondary.map(item => item.eventIds?.length)).toEqual([1, 1]);
    const phrase = layoutPhrase(buildLessonDeck(score).phrases[0]!);
    expect(phrase.beams.filter(item => item.level === 1)).toHaveLength(1);
    const phraseSecondary = phrase.beams.filter(item => item.level === 2);
    expect(phraseSecondary).toHaveLength(2);
    expect(phraseSecondary[0]!.x2).toBeLessThan(phraseSecondary[1]!.x1);
  });

  it("uses the same compound and tuplet beats as the teaching view", () => {
    expect(beamsFor("1_ 2_ 3_ 4_ 5_ 6_ |", "6/8").map(item => item.eventIds?.length)).toEqual([3, 3]);
    expect(beamsFor("{(3}1_ 2_ 3_ 4_ 5_ |", "4/4").map(item => item.eventIds?.length)).toEqual([3, 2]);
  });

  it("keeps beam baselines level when low and high notes are in the same beat", () => {
    const beams = beamsFor("1dd__ 2__ 3g__ 4__ |");
    expect(beams).toHaveLength(2);
    expect(beams[1]!.y - beams[0]!.y).toBeCloseTo(PRINT_ENGRAVING.beamGap);
    const score = scoreFrom("1dd__ 2__ 3g__ 4__ |");
    const wrapper = mount(SvgPage, { props: { page: buildPrintLayout(score).pages[0]! } });
    const lowDots = wrapper.find("g.note").findAll(".octave-dot");
    expect(Number(lowDots[0]!.attributes("cy")) - PRINT_ENGRAVING.dotRadius)
      .toBeGreaterThan(beams[1]!.y + PRINT_ENGRAVING.lineWidth / 2);
    wrapper.unmount();
  });

  it("continues a slur on every crossed system and page", () => {
    const voice = `(${Array.from({ length: 140 }, (_, i) => i === 139 ? "1 2 3 4) |" : "1 2 3 4 |").join(" ")}`;
    const layout = buildPrintLayout(scoreFrom(voice));
    expect(layout.pages.length).toBeGreaterThan(1);
    const curves = layout.pages.flatMap(page => page.items).filter(item => item.kind === "path");
    const rows = layout.pages.flatMap(page => [...new Set(page.items.filter(item => item.kind === "note").map(item => item.y))]);
    expect(curves).toHaveLength(rows.length);
    expect(curves[0]).toMatchObject({ continuedLeft: false, continuedRight: true, filled: true });
    expect(curves.at(-1)).toMatchObject({ continuedLeft: true, continuedRight: false });
    curves.slice(1, -1).forEach(curve => expect(curve).toMatchObject({ continuedLeft: true, continuedRight: true }));
  });

  it("renders filled curves and duration strokes without modifying canonical score content", () => {
    const score = scoreFrom("(1g_ 2g_) 3-- |", "4/4", "あいうーー");
    const before = JSON.stringify(score);
    const print = mount(SvgPage, { props: { page: buildPrintLayout(score).pages[0]! } });
    expect(print.find("path.slur").attributes("fill")).toBe("currentColor");
    expect(print.findAll(".dash-path")).toHaveLength(2);
    expect(print.find(".dash-path").attributes("transform")).toBeUndefined();
    const phrase = mount(JianpuPhraseNotation, { props: { phrase: buildLessonDeck(score).phrases[0]! } });
    expect(phrase.find(".engraved-curve").attributes("d")).toMatch(/Z$/);
    expect(phrase.findAll(".phrase-augmentation-line")).toHaveLength(2);
    expect(phrase.find(".phrase-beams path").exists()).toBe(true);
    expect(JSON.stringify(score)).toBe(before);
    print.unmount();
    phrase.unmount();
  });
});
