import { describe, expect, it } from "vitest";
import { findNextPlayablePhraseIndex } from "../src/slide/playback";

describe("continuous phrase playback", () => {
  const phrases = [{ id: "a" }, { id: "interlude" }, { id: "b" }];

  it("advances through every phrase when omission is off", () => {
    expect(
      findNextPlayablePhraseIndex(
        phrases,
        0,
        false,
        (phrase) => phrase.id === "interlude"
      )
    ).toBe(1);
  });

  it("skips marked interludes and stops at the end", () => {
    const shouldSkip = (phrase: { id: string }) => phrase.id === "interlude";
    expect(findNextPlayablePhraseIndex(phrases, 0, true, shouldSkip)).toBe(2);
    expect(findNextPlayablePhraseIndex(phrases, 2, true, shouldSkip)).toBe(-1);
  });
});
