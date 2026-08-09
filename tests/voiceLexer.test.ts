import { describe, expect, it } from "vitest";
import { lexVoice } from "../src/parser/voiceLexer";

describe("lexVoice", () => {
  it("scans compact notes, slurs, tuplets, meters, and rhythm X", () => {
    const result = lexVoice('4/4 | (5__6_.)(2g__3g_.) {(3} X__ #5g_. #b3g__ "转{1=E}" $');
    const kinds = result.value.map((event) => event.kind);
    expect(kinds).toContain("meter");
    expect(kinds).toContain("barline");
    expect(kinds.filter((kind) => kind === "note").length).toBeGreaterThanOrEqual(5);
    expect(kinds).toContain("rhythm");
    expect(kinds).toContain("tupletMarker");
    expect(kinds).toContain("standardText");
    expect(kinds).toContain("return");
    const natural = result.value.find((event) => event.kind === "note" && event.raw === "#b3g__");
    expect(natural).toMatchObject({ accidental: "natural", degree: 3, octave: 1 });
  });

  it("keeps unknown tokens as diagnostics instead of throwing", () => {
    const result = lexVoice("[5,1b35]_ |");
    expect(result.value.some((event) => event.kind === "unknown")).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("recovers after one malformed token without swallowing later score events", () => {
    const result = lexVoice("?12|34 || 2/4 05");

    expect(
      result.value
        .filter((event) => event.kind === "note" || event.kind === "rest")
        .map((event) => event.raw)
    ).toEqual(["1", "2", "3", "4", "0", "5"]);
    expect(result.value.filter((event) => event.kind === "barline")).toHaveLength(2);
    expect(result.value.find((event) => event.kind === "meter")).toMatchObject({
      numerator: 2,
      denominator: 4
    });
  });

  it("parses first and second endings without treating them as chords", () => {
    const result = lexVoice("|[1. 1 2 :|[2. 3 4 |]");

    expect(result.diagnostics).toEqual([]);
    expect(
      result.value
        .filter((event) => event.kind === "voltaMarker")
        .map((event) => event.number)
    ).toEqual([1, 2]);
    expect(
      result.value
        .filter((event) => event.kind === "note")
        .map((event) => event.raw)
    ).toEqual(["1", "2", "3", "4"]);
  });

  it("limits unterminated constructs to a local recovery boundary", () => {
    const brace = lexVoice("{ 12|34");
    const text = lexVoice('"broken 12\n|34|');

    expect(
      brace.value
        .filter((event) => event.kind === "note")
        .map((event) => event.raw)
    ).toEqual(["1", "2", "3", "4"]);
    expect(brace.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "VOICE_UNTERMINATED_BRACE"
    );
    expect(
      text.value
        .filter((event) => event.kind === "note")
        .map((event) => event.raw)
    ).toEqual(["3", "4"]);
    expect(text.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "VOICE_UNTERMINATED_TEXT"
    );
  });
});
