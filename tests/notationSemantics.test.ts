import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildPhraseJPWABC } from "../src/teaching/lesson";
import { buildLessonDeck, buildInstrumentalMeasureFrame } from "../src/slide/buildLessonDeck";
import { buildEventTiming } from "../src/notation/eventTiming";
import { buildPrintLayout } from "../src/layout/printLayout";
import { layoutPhrase } from "../src/slide/layoutPhrase";
import { noteDecorations } from "../src/notation/noteDecorations";
import { formatInstrumentalRunCaption } from "../src/slide/teachingPresentation";
import { projectInstrumentalRunCaption } from "../src/project/projectPhraseSemantics";
import { convertParsedScoreToTeachingProject } from "../src/project/jpwabcProject";
import { createProjectPhrase, createTeachingProject } from "../src/project/projectBuilder";
import JianpuPhraseNotation from "../src/slide/JianpuPhraseNotation.vue";
import SvgPage from "../src/render/SvgPage.vue";

function score(voice: string, words = "", expression = "J=120") {
  return parseJPWABC(buildPhraseJPWABC({ title: "Notation semantics", keyAndMeters: "1=C,4/4", expression, voice, words })).value;
}

describe("jpeditor notation semantics", () => {
  it("enriches older saved notation without changing note IDs or the saved snapshot", () => {
    const parsed = score("{57}1_ {(3}2_ 3_ 4_) |", "あいうえ");
    const voice = parsed.voices[0]!;
    const main = voice.events.find(event => event.kind === "note")!;
    if (main.kind !== "note") throw new Error("Expected note");
    delete main.graceNotes;
    main.raw = "1_";
    const legacyPrefix = { id: "old-grace", kind: "unknown" as const, position: 0, measure: 1, raw: "{57}", reason: "Unsupported brace construct" };
    voice.events.unshift(legacyPrefix);
    voice.measures[0]!.events.unshift(legacyPrefix);
    parsed.semantic.slurs = [];
    const before = JSON.stringify(parsed);
    const frame = buildLessonDeck(parsed).phrases[0]!;
    expect(frame.slots[0]?.sourceEventId).toBe(main.id);
    expect(frame.slots[0]?.graceNotes?.map(note => note.degree)).toEqual([5, 7]);
    expect(frame.curves.some(curve => curve.type === "tuplet")).toBe(true);
    expect(buildPrintLayout(parsed).pages[0]!.items.some(item => item.kind === "note" && item.graceNotes?.length === 2)).toBe(true);
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it("parses grace groups and articulations without consuming time or lyric anchors", () => {
    const parsed = score("{YanYin,ZhongYin}{#4d57g}1_ {BoYin}2_ {DunYin}3 4 |", "あいうえ");
    expect(parsed.diagnostics).toHaveLength(0);
    const notes = parsed.voices[0]!.events.filter(event => event.kind === "note");
    expect(notes).toHaveLength(4);
    expect(notes[0]).toMatchObject({ noteIndex: 1, degree: 1, ornaments: ["fermata", "accent"],
      graceNotes: [{ degree: 4, octave: -1, accidental: "sharp" }, { degree: 5 }, { degree: 7, octave: 1 }] });
    expect(parsed.lyricAlignments.map(alignment => alignment.noteIndex)).toEqual([1, 2, 3, 4]);
    expect([...buildEventTiming(parsed.voices[0]!.events, parsed).values()].reduce((sum, timing) => sum + timing.durationQuarters, 0)).toBe(3);
    const frame = buildLessonDeck(parsed).phrases[0]!;
    expect(frame.slots[0]?.graceNotes).toHaveLength(3);
    const before = JSON.stringify(parsed);
    const phrase = mount(JianpuPhraseNotation, { props: { phrase: frame } });
    const print = mount(SvgPage, { props: { page: buildPrintLayout(parsed).pages[0]! } });
    for (const wrapper of [phrase, print]) {
      expect(wrapper.findAll(".grace-note")).toHaveLength(3);
      expect(wrapper.find(".grace-hook").exists()).toBe(true);
      for (const name of ["fermata", "accent", "mordent", "staccato"]) expect(wrapper.find(`.ornament-${name}`).exists()).toBe(true);
      wrapper.unmount();
    }
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it("keeps unknown and unattached decorations visible in diagnostics", () => {
    const parsed = score("{UnknownOrnament}1 {56}| 2");
    expect(parsed.voices[0]!.events.filter(event => event.kind === "unknown").map(event => event.raw)).toEqual(["{UnknownOrnament}", "{56}"]);
    expect(parsed.diagnostics).toHaveLength(2);
  });

  it.each(["{5g}6g--- |", "{567g}6g--- |"])("renders JPW grace notes with two continuous beams in both views: %s", voice => {
    const parsed = score(voice, "あ");
    const frame = buildLessonDeck(parsed).phrases[0]!;
    const phrase = mount(JianpuPhraseNotation, { props: { phrase: frame } });
    const print = mount(SvgPage, { props: { page: buildPrintLayout(parsed).pages[0]! } });
    for (const wrapper of [phrase, print]) {
      const beams = wrapper.findAll(".grace-beam");
      expect(beams).toHaveLength(2);
      expect(beams[1]!.attributes("x")).toBe(beams[0]!.attributes("x"));
      expect(beams[1]!.attributes("width")).toBe(beams[0]!.attributes("width"));
      const lowerY = Number(beams[1]!.attributes("y"));
      expect(lowerY).toBeGreaterThan(Number(beams[0]!.attributes("y")) + Number(beams[0]!.attributes("height")));
      const hookStart = wrapper.find(".grace-hook").attributes("d")!.match(/^M\s+[\d.-]+\s+([\d.-]+)/)!;
      expect(Number(hookStart[1])).toBeGreaterThanOrEqual(lowerY);
      wrapper.unmount();
    }
    expect([...buildEventTiming(parsed.voices[0]!.events, parsed).values()].reduce((sum, event) => sum + event.durationQuarters, 0)).toBe(4);
  });

  it.each(["{(3}1_ 2_ 3_)", "{(3}1 2 3)", "{(3}1__ 2__ 3__)"])("shares correct tuplet duration for %s", voice => {
    const parsed = score(`${voice} 4 |`, "あいうえ");
    const frame = buildLessonDeck(parsed).phrases[0]!;
    const scale = voice.includes("__") ? 0.5 : voice.includes("_") ? 1 : 2;
    expect(frame.slots[3]?.measureOffsetQuarter).toBeCloseTo(scale);
    expect(parsed.semantic.slurs.find(curve => curve.type === "tuplet")?.endEventId).toBe(frame.slots[2]?.sourceEventId);
    const print = mount(SvgPage, { props: { page: buildPrintLayout(parsed).pages[0]! } });
    const phrase = mount(JianpuPhraseNotation, { props: { phrase: frame } });
    for (const wrapper of [phrase, print]) {
      expect(wrapper.find(".tuplet-arc").attributes("d")).toContain(" C ");
      expect(wrapper.find(".tuplet-arc").attributes("d")).not.toMatch(/\b[HV]\b/);
      expect(wrapper.find(".tuplet-label").exists()).toBe(true);
      wrapper.unmount();
    }
  });

  it("keeps slur closure inside a tuplet from ending its rhythm early", () => {
    const parsed = score("{(3}(1_ 2_) 3_) 4 |", "あいうえ");
    const frame = buildLessonDeck(parsed).phrases[0]!;
    expect(frame.curves.map(curve => curve.type).sort()).toEqual(["slur", "tuplet"]);
    expect(frame.slots[3]?.measureOffsetQuarter).toBeCloseTo(1);
    const geometry = layoutPhrase(frame);
    expect(geometry.curves.find(curve => curve.curve.type === "tuplet")!.baseY)
      .toBeLessThan(geometry.curves.find(curve => curve.curve.type === "slur")!.apexY);
  });

  it("places tuplets above interior accidentals, ornaments and grace notes", () => {
    const parsed = score("{(3}1_ {YanYin}{6g}#2g_ 3_) |", "あいう");
    const frame = buildLessonDeck(parsed).phrases[0]!;
    const geometry = layoutPhrase(frame);
    const middle = geometry.slots[1]!;
    expect(geometry.curves[0]!.baseY).toBeLessThan(noteDecorations(middle.slot, middle.symbolX, geometry.noteY, geometry.engraving).top);
  });

  it("recognizes complete-measure parentheses while preserving cross-bar note slurs", () => {
    const interlude = score("(1 2 | 3 4 |) 5 6 |", "あい");
    expect(interlude.semantic.slurs).toHaveLength(0);
    expect(interlude.lyricAlignments.map(alignment => alignment.measure)).toEqual([3, 3]);
    expect(buildLessonDeck(interlude).phrases.map(frame => frame.kind ?? "vocal")).toEqual(["instrumental", "vocal"]);
    const slur = score("(1 2 | 3 4) |", "あいうえ");
    expect(slur.semantic.slurs.map(curve => curve.type)).toEqual(["slur"]);
    expect(buildLessonDeck(slur).phrases.every(frame => frame.kind !== "instrumental")).toBe(true);
  });

  it("preserves nested slurs and tuplets within a bar-delimited instrumental section", () => {
    const parsed = score("( | {(3}(1_ 2_) 3_) 4 | 5--- | ) 6 7 |", "あい");
    const frames = buildLessonDeck(parsed).phrases;
    expect(frames[0]?.kind).toBe("instrumental");
    expect(frames[0]?.curves.map(curve => curve.type).sort()).toEqual(["slur", "tuplet"]);
    expect(parsed.diagnostics).toHaveLength(0);
    expect(frames[1]?.sourceAnchor.startMeasure).toBe(3);
  });

  it("ignores layout controls at section barlines and keeps inner tuplets independent", () => {
    const parsed = score("( 1--- | {C:1.2} {(3}2_ 3_ 4_) 5 |{C:1.4} ) 6 7 |", "あい");
    const frames = buildLessonDeck(parsed).phrases;
    expect(frames[0]?.kind).toBe("instrumental");
    expect(frames[0]?.curves.map(curve => curve.type)).toEqual(["tuplet"]);
    expect(frames[1]?.sourceAnchor.startMeasure).toBe(3);
  });

  it("keeps an earlier note slur independent of a later instrumental section", () => {
    const parsed = score("( {(3}1_ 2_ 3_) ) | ( 4--- | ) 5 6 |", "あいうえお");
    const notes = parsed.voices[0]!.events.filter(event => event.kind === "note");
    expect(notes.slice(0, 3).every(note => !note.instrumental)).toBe(true);
    expect(notes[3]?.instrumental).toBe(true);
    expect(parsed.semantic.slurs.find(curve => curve.type === "slur")).toMatchObject({
      startEventId: notes[0]!.id, endEventId: notes[2]!.id
    });
    expect(parsed.diagnostics).toHaveLength(0);
  });

  it("does not turn repeated pitches separated by a rest into a tie", () => {
    const parsed = score("(1 0 1) |", "あい");
    expect(parsed.semantic.slurs[0]?.type).toBe("slur");
    expect(parsed.voices[0]!.events.filter(event => event.kind === "note").every(event => event.attack)).toBe(true);
  });

  it("splits long accompaniment for display and sums the entire run on every page", () => {
    const parsed = score(`1 2 | ( ${"3--- | ".repeat(9)}) 4 5 |`, "あいうえ");
    const frames = buildLessonDeck(parsed).phrases;
    expect(frames.map(frame => frame.kind ?? "vocal")).toEqual(["vocal", "instrumental", "instrumental", "instrumental", "vocal"]);
    for (const index of [1, 2, 3]) expect(formatInstrumentalRunCaption(frames, index)).toBe("伴奏 18 秒 · 9 小节");
    expect(formatInstrumentalRunCaption(frames, 0)).toBe("");
    const project = convertParsedScoreToTeachingProject(parsed).project;
    expect(projectInstrumentalRunCaption(project, 2)).toBe("伴奏 18 秒 · 9 小节");
  });

  it("sums different tempos once and stops at vocal and blank project pages", () => {
    const a = buildInstrumentalMeasureFrame(score("1--- |", "", "J=127"), 1, 1, 0)!;
    const b = { ...a, tempo: "60" };
    expect(formatInstrumentalRunCaption([a, b], 1)).toBe("伴奏 5.9 秒 · 2 小节");
    expect(formatInstrumentalRunCaption([a, undefined, b], 0)).toBe("伴奏 1.9 秒 · 1 小节");
    const project = createTeachingProject("Manual", "");
    project.expression = "J=120";
    project.phrases = Array.from({ length: 3 }, (_, i) => ({ ...createProjectPhrase("", i), kind: "instrumental", voiceLine: "1--- |" }));
    expect(projectInstrumentalRunCaption(project, 1)).toBe("伴奏 6 秒 · 3 小节");
    project.phrases[1]!.kind = "blank";
    expect(projectInstrumentalRunCaption(project, 2)).toBe("伴奏 2 秒 · 1 小节");
  });
});
