import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeJPWABC } from "../src/core/decode";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildPrintLayout } from "../src/layout/printLayout";

function readFixture(name: string): string {
  const buffer = readFileSync(`public/fixtures/${name}`);
  const arrayBuffer = new Uint8Array(buffer).buffer;
  return decodeJPWABC(arrayBuffer);
}

describe("layout smoke", () => {
  it("renders Sakura to an A4 SVG page model with reading override", () => {
    const parsed = parseJPWABC(readFixture("sakura.jpwabc"));
    const layout = buildPrintLayout(parsed.value, { teachingGhost: true });
    expect(layout.pages[0]?.width).toBe(210);
    expect(layout.pages[0]?.height).toBe(297);
    expect(layout.pages[0]?.items.some((item) => item.kind === "note")).toBe(true);
    expect(parsed.value.semantic.readingOverrides).toHaveLength(1);
  });

  it("lays out synthetic attachment key changes", () => {
    const parsed = parseJPWABC(`
.Title
KeyAndMeters = {1=C,4/4}
.Voice
1 2 | 3 4 | 5 6 |
.Attachments
Text@1,1(0.65,-2.07) = AttachText1, 转{1=E},{0.8,0.8}
Text@2,1(0.65,-2.07) = AttachText1, 转{1=D},{0.8,0.8}
Text@3,1(0.65,-2.07) = AttachText1, 转{1=G},{0.8,0.8}
`);
    const layout = buildPrintLayout(parsed.value, { showKeyChanges: true });
    expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    expect(parsed.value.semantic.keyChanges.map((event) => event.keyOfOne)).toEqual(["E", "D", "G"]);
    const keyChangeItems = layout.pages.flatMap((page) => page.items).filter((item) => item.kind === "attachment" && item.className === "key-change");
    expect(keyChangeItems).toHaveLength(3);
  });

  it("groups underlined subdivisions into beat beams", () => {
    const parsed = parseJPWABC(readFixture("notation-reference.jpwabc"));
    const layout = buildPrintLayout(parsed.value, { teachingGhost: true });
    const beams = layout.pages.flatMap((page) => page.items).filter((item) => item.kind === "beam");
    expect(beams.length).toBeGreaterThan(0);
    const beamedNotes = layout.pages
      .flatMap((page) => page.items)
      .filter((item) => (item.kind === "note" || item.kind === "rest" || item.kind === "rhythm") && (item.beamedUnderlineLevels?.length ?? 0) > 0);
    expect(beamedNotes.length).toBeGreaterThan(0);
  });

  it("uses smooth slur paths with ordered control points", () => {
    const parsed = parseJPWABC(readFixture("notation-reference.jpwabc"));
    const layout = buildPrintLayout(parsed.value, { teachingGhost: true });
    const slur = layout.pages.flatMap((page) => page.items).find((item) => item.kind === "path");
    expect(slur?.kind).toBe("path");
    if (slur?.kind === "path") {
      const numbers = slur.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const [startX, , c1x, , c2x, , endX] = numbers;
      expect(c1x).toBeGreaterThan(startX ?? 0);
      expect(c2x).toBeGreaterThan(c1x ?? 0);
      expect(endX).toBeGreaterThan(c2x ?? 0);
    }
  });
});
