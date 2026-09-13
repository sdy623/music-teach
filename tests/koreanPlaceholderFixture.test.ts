import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeJPWABCWithInfo } from "../src/core/decode";
import { findFixture } from "../src/demo/fixtures";
import { parseJPWABC } from "../src/parser/parseJPWABC";
import { buildLessonDeck } from "../src/slide/buildLessonDeck";

describe("Korean teaching fixture slot", () => {
  it("reserves a stable route without distributing song content", () => {
    const fixture = findFixture("im-eul-wihan-haengjingok");
    const buffer = readFileSync(
      "public/fixtures/im-eul-wihan-haengjingok-placeholder.jpwabc"
    );
    const decoded = decodeJPWABCWithInfo(new Uint8Array(buffer).buffer);
    const score = parseJPWABC(decoded.text).value;
    const deck = buildLessonDeck(score, { id: fixture.id, tags: fixture.tags });

    expect(fixture.path).toBe(
      "/fixtures/im-eul-wihan-haengjingok-placeholder.jpwabc"
    );
    expect(fixture.tags).toContain("PLACEHOLDER");
    expect(score.title.title).toBe("임을 위한 행진곡");
    expect(score.voices[0]?.events.some((event) => event.kind === "rhythm")).toBe(true);
    expect(deck.phrases).toHaveLength(1);
    expect(deck.phrases[0]?.lyricCells[0]).toMatchObject({
      kind: "multiChar",
      display: "준비중"
    });
  });
});
