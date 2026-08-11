import { describe, expect, it } from "vitest";
import {
  findNextPlayablePhraseIndex,
  firstPerformedSlotIndex,
  nextPerformedSlotIndex,
  nextPlaybackDeadline,
  playbackDelayMilliseconds,
  slotDurationMilliseconds
} from "../src/slide/playback";

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

  it("keeps context visible while excluding it from the performance cursor", () => {
    const slots = [
      { id: "lead", context: true },
      { id: "first" },
      { id: "inside-rest", kind: "rest" },
      { id: "second" },
      {
        id: "phrase-end-tie",
        context: true,
        contextRole: "after" as const,
        tieGhost: true
      },
      { id: "tail", context: true }
    ];

    expect(firstPerformedSlotIndex(slots)).toBe(1);
    expect(nextPerformedSlotIndex(slots, 1)).toBe(2);
    expect(nextPerformedSlotIndex(slots, 2)).toBe(3);
    expect(nextPerformedSlotIndex(slots, 3)).toBe(4);
    expect(nextPerformedSlotIndex(slots, 4)).toBe(-1);
    expect(firstPerformedSlotIndex([{ context: true }])).toBe(-1);
  });

  it("keeps a sixteenth note at its exact 127 BPM duration", () => {
    const duration = slotDurationMilliseconds({ durationQuarters: 0.25 }, 127);

    expect(duration).toBeCloseTo(118.1102, 3);
    expect(duration).toBeLessThan(150);
  });

  it("does not truncate long notes", () => {
    expect(slotDurationMilliseconds({ durationQuarters: 4 }, 127)).toBeCloseTo(
      1889.7638,
      3
    );
  });

  it("uses an absolute deadline so delayed callbacks catch up", () => {
    const firstDeadline = nextPlaybackDeadline(undefined, 1000, 118.11);
    const secondDeadline = nextPlaybackDeadline(firstDeadline, 1130, 118.11);

    expect(firstDeadline).toBeCloseTo(1118.11, 5);
    expect(secondDeadline).toBeCloseTo(1236.22, 5);
    expect(playbackDelayMilliseconds(secondDeadline, 1150)).toBeCloseTo(86.22, 5);
  });
});
