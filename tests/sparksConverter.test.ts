import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SparksNMN } from "@sparks-notation/core";
import { decodeJPWABC } from "../src/core/decode";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { eventToSparksToken, scoreIRToSparksNMN } from "../src/sparks/jpwabcToSparks";

describe("JPW-ABC to Sparks NMN conversion", () => {
  it("keeps JPW title and converts key, meter, tempo into Sparks header lines", () => {
    const parsed = parseJPWABC(`
.Title
Title = {さくら}
SubTitle = TV size
KeyAndMeters = {1=bF,6/8}
Expression = {J=132}
WordsByAndMusicBy = 日本古謡\\n採譜
.Voice
1 2 3 |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("Dt: さくら");
    expect(converted).toContain("Ds: TV size");
    expect(converted).toContain("Da: 日本古謡");
    expect(converted).toContain("P: 1=bF 6/8 qpm=132");
    expect(converted).toContain("Rp: page_margin_x=8,8 font_lyrics=CommonLight/700 sectionorder=paren grayout=true");
    expect(converted).toContain("N: 1 2 3 |");
  });

  it("maps JPW note syntax into Sparks note tokens", () => {
    const parsed = parseJPWABC(`
.Voice
#5g_. #b3g__ b3d__ 0_ X. 1--- |
`);
    const timedEvents = parsed.value.voices[0]!.events.filter(
      (event) => event.kind === "note" || event.kind === "rest" || event.kind === "rhythm"
    );
    expect(timedEvents.map((event) => eventToSparksToken(event))).toEqual(["(#5e.)", "((=3e))", "((b3d))", "(0)", "X.", "1 - - -"]);
  });

  it("does not add numeric lyric labels", () => {
    const parsed = parseJPWABC(`
.Voice
1 2 3 |
.Words
W1@1,1:
さくら
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("Lc: さくら");
    expect(converted).not.toContain("Lc[1.]");
  });

  it("aligns JPW lyrics from their W anchor instead of starting every block at the first note", () => {
    const parsed = parseJPWABC(`
.Voice
0 0 | 1 2 3 4 |
.Words
W1@2,2:
あーい
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("Lc: %あ_い");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
  });

  it("treats out-of-measure JPW lyric anchors as global slots and auto-skips rests", () => {
    const parsed = parseJPWABC(`
.Voice
1 2 | 0 3 4 |
.Words
W1@1,4:
ら
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("Lc: %{2}ら");
  });

  it("merges same-track JPW lyric blocks into one aligned lyric line", () => {
    const parsed = parseJPWABC(`
.Voice
1 2 3 4 5 |
.Words
W1@1,1:
あ
W1@1,4:
い
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted.match(/^Lc:/gm)).toHaveLength(1);
    expect(converted).toContain("Lc: あ%{2}い");
  });

  it("maps JPW slurs and tie ghosts into Sparks connector suffixes", () => {
    const parsed = parseJPWABC(`
.Voice
(6 4) | (5 5) |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: 6^ 4^ | 5~ 5 |");

    const conventional = scoreIRToSparksNMN(parsed.value, { teachingGhost: false }).source;
    expect(conventional).toContain("N: 6^ 4^ | 5^ 5^ |");
    expect(conventional).not.toContain("grayout=true");
  });

  it("skips tie continuation notes when aligning lyrics in teaching ghost mode", () => {
    const parsed = parseJPWABC(`
.Voice
(5 5) 6 |
.Words
W1@1,1:
あい
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: 5~ 5 6 |");
    expect(converted).toContain("Lc: あい");
  });

  it("consumes lyric extension marks that land on tie ghost continuation notes", () => {
    const parsed = parseJPWABC(`
.Voice
(5 5) 6 |
.Words
W1@1,1:
あーい
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: 5~ 5 6 |");
    expect(converted).toContain("Lc: あい");
    expect(converted).not.toContain("Lc: あ_い");

    const conventional = scoreIRToSparksNMN(parsed.value, { teachingGhost: false }).source;
    expect(conventional).toContain("N: 5^ 5^ 6 |");
    expect(conventional).toContain("Lc: あ_い");
  });

  it("keeps long cross-bar JPW phrase parentheses as instrumental phrase inserts", () => {
    const parsed = parseJPWABC(`
.Voice
| ( 5 6 | 7 1 ) | (2 3) |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: &lpr; 5 6 | 7 1 &rpr; | 2^ 3^ |");
    expect(converted).not.toContain("5^ 6");
    expect(converted).not.toContain("1^ |");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
    expect(sparks.issues.filter((issue: { key?: string }) => issue.key === "invalid_begin_separator")).toEqual([]);
  });

  it("treats JPW return markers as soft line hints for dynamic line breaking", () => {
    const parsed = parseJPWABC(`
.Voice
1 2 | $
3 4 | 5 6 |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: 1 2 | 3 4 | 5 6 |");
    expect(converted).not.toContain("---");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
  });

  it("emits Sparks connector syntax that the Sparks parser accepts", () => {
    const parsed = parseJPWABC(`
.Voice
(6 4) | (5 5) |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
  });

  it("groups reduction underlines by beat instead of wrapping every note alone", () => {
    const parsed = parseJPWABC(`
.Title
KeyAndMeters = {1=C,4/4}
.Voice
5_ 6_ 7__ 1__ 2__ 3__ |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: (5 6) ((7 1 2 3)) |");
    expect(converted).not.toContain("(5) (6)");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
  });

  it("respects the current meter denominator when grouping reductions into beats", () => {
    const parsed = parseJPWABC(`
.Title
KeyAndMeters = {1=C,6/8}
.Voice
5__ 6__ 7__ 1__ |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: ((5 6)) ((7 1)) |");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
  });

  it("keeps temporary voice meters in the Sparks note stream", () => {
    const parsed = parseJPWABC(`
.Title
KeyAndMeters = {1=C,4/4}
.Voice
| 1 2 | 2/4 3__ 4__ | 4/4 5 6 |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: 1 2 |{2/4}");
    expect(converted).toContain("{2/4}");
    expect(converted).toContain("{4/4}");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
    expect(sparks.issues.filter((issue: { key?: string }) => issue.key === "invalid_begin_separator")).toEqual([]);
  });

  it("keeps temporary meter double bars as double bars, not repeat markers", () => {
    const parsed = parseJPWABC(`
.Title
KeyAndMeters = {1=C,4/4}
.Voice
1 2 || 2/4 3__ 4__ || 4/4 5 6 |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("1 2 ||{2/4}");
    expect(converted).toContain("||{4/4}");
    expect(converted).not.toContain("||:");
    expect(converted).not.toContain(":||");
  });

  it("renders JPW text attachment key changes as native Sparks annotations", () => {
    const parsed = parseJPWABC(`
.Title
KeyAndMeters = {1=C,4/4}
.Voice
1 2 | 3 4 |
.Attachments
Text@2,1(0.65,-2.07) = AttachText1, 转{1=E},{0.8,0.8}
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(parsed.value.semantic.keyChanges.map((change) => change.keyOfOne)).toEqual(["E"]);
    expect(converted).toContain('A: 0 | "转1=E" |');
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { severity?: string }) => issue.severity === "error")).toEqual([]);
  });

  it("renders JPW tuplet markers over three notes or two-note triplet groups", () => {
    const parsed = parseJPWABC(`
.Voice
| {(3}5_6_5_ | {(3}2_3 | {(3}5_6_ |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("T(5 6 5)");
    expect(converted).toContain("T(2 3 -)");
    expect(converted).toContain("T(5 6)");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
  });

  it("covers temporary meters, natural #b, and tuplets from the notation fixture", () => {
    const buffer = readFileSync("public/fixtures/notation-reference.jpwabc");
    const parsed = parseJPWABC(decodeJPWABC(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("P: 1=bE 6/8");
    expect(converted).toContain("{4/4}");
    expect(converted).toContain("=3");
    expect(converted).toContain("T(");
    expect(converted).not.toContain("Unknown JPW token kept out of Sparks source: #b");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { level?: string }) => issue.level === "error")).toEqual([]);
    expect(sparks.issues.filter((issue: { key?: string }) => issue.key === "invalid_begin_separator")).toEqual([]);
  });

  it("drops harmless leading simple barlines before sending a line to Sparks", () => {
    const parsed = parseJPWABC(`
.Voice
| 1 2 |
`);
    const converted = scoreIRToSparksNMN(parsed.value).source;
    expect(converted).toContain("N: 1 2 |");
    expect(converted).not.toContain("N: | 1");
    const sparks = SparksNMN.parse(converted);
    expect(sparks.issues.filter((issue: { key?: string }) => issue.key === "invalid_begin_separator")).toEqual([]);
  });
});
