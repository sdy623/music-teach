import { describe, expect, it } from "vitest";
import type { ScoreIR } from "../../src/ir/score";
import type { NoteEvent } from "../../src/ir/voice";
import {
  buildStableAnchorIndex as buildAnchorIndex,
  fingerprintScoreIR,
  fingerprintVoiceEvent,
  fingerprintVoiceIR,
  rebaseStableAnchor,
  type EventStableAnchor
} from "../../src/neo/anchors";
import { parseJPWABC } from "../../src/parser/parseJPWABC";

const PROJECT_ID = "anchor-test-project";

function parseScore(voice: string, words = "あいう"): ScoreIR {
  return parseJPWABC(`
.Title
Title = Anchor Test
KeyAndMeters = 1=C,4/4
.Voice
${voice}
.Words
W1@1,1:
${words}
`).value;
}

function buildStableAnchorIndex(
  score: ScoreIR,
  revisions: {
    projectId?: string;
    sourceRevision: string;
    scoreRevision: string;
  }
) {
  return buildAnchorIndex(score, {
    projectId: revisions.projectId ?? PROJECT_ID,
    sourceRevision: revisions.sourceRevision,
    scoreRevision: revisions.scoreRevision
  });
}

function scoreWithVoices(...voiceSources: string[]): ScoreIR {
  const score = parseScore(voiceSources[0] ?? "1 |", "");
  score.voices = voiceSources.map((voiceSource, index) => {
    const voice = parseScore(voiceSource, "").voices[0]!;
    voice.id = `durable-voice-${index + 1}`;
    return voice;
  });
  score.lyrics = [];
  score.lyricLayers = [];
  score.lyricAlignments = [];
  score.semantic.slurs = [];
  return score;
}

function scoreState(score: ScoreIR): string {
  return JSON.stringify(score, (_key, value: unknown) =>
    value instanceof Map ? [...value.entries()] : value
  );
}

function note(score: ScoreIR, degree: number, occurrence = 0): NoteEvent {
  const notes = score.voices[0]!.events.filter(
    (event): event is NoteEvent => event.kind === "note" && event.degree === degree
  );
  const target = notes[occurrence];
  if (!target) throw new Error(`Missing note ${degree} occurrence ${occurrence}`);
  return target;
}

function eventAnchor(score: ScoreIR, degree: number): EventStableAnchor {
  const target = note(score, degree);
  const index = buildStableAnchorIndex(score, {
    sourceRevision: "source-1",
    scoreRevision: "score-1"
  });
  const anchor = index.events.find((entry) => entry.parserIdHint === target.id);
  if (!anchor) throw new Error(`Missing anchor for ${target.id}`);
  return anchor;
}

describe("stable music anchors", () => {
  it("is deterministic, Map-order stable, and ignores ephemeral event identity", () => {
    const score = parseScore("1 2 3 |", "あいう");
    const before = scoreState(score);
    const revisions = { sourceRevision: "source-1", scoreRevision: "score-1" };
    const first = buildStableAnchorIndex(score, revisions);
    const second = buildStableAnchorIndex(score, revisions);

    expect(second).toEqual(first);
    expect(scoreState(score)).toBe(before);

    const original = note(score, 2);
    const ephemeralVariant = { ...original };
    ephemeralVariant.id = "renumbered-note-999";
    ephemeralVariant.position += 500;
    ephemeralVariant.measure = 99;
    ephemeralVariant.noteIndex = 77;
    expect(fingerprintVoiceEvent(ephemeralVariant)).toBe(
      fingerprintVoiceEvent(original)
    );

    const musicalVariant = { ...original, degree: 7 as const, pitchKey: "7@0" };
    expect(fingerprintVoiceEvent(musicalVariant)).not.toBe(
      fingerprintVoiceEvent(original)
    );

    const reordered = structuredClone(score);
    const reorderedVoice = reordered.voices[0]!;
    reorderedVoice.anchors = new Map([...reorderedVoice.anchors.entries()].reverse());
    expect(fingerprintVoiceIR(reorderedVoice)).toBe(
      fingerprintVoiceIR(score.voices[0]!)
    );

    const rekeyed = structuredClone(score);
    const rekeyedVoice = rekeyed.voices[0]!;
    rekeyedVoice.anchors = new Map(
      [...rekeyedVoice.anchors.values()].map((eventId, index) => [
        `renumbered:${index + 100}`,
        eventId
      ])
    );
    expect(fingerprintVoiceIR(rekeyedVoice)).toBe(
      fingerprintVoiceIR(score.voices[0]!)
    );
  });

  it("reports unchanged for an exact anchor and rebased after a distinct prepend", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const sourceAnchor = eventAnchor(source, 2);

    const unchanged = rebaseStableAnchor(sourceAnchor, sourceIndex);
    expect(unchanged.status).toBe("unchanged");
    expect(unchanged.anchor?.id).toBe(sourceAnchor.id);

    const target = parseScore("7 1 2 3 |", "うあいう");
    const targetIndex = buildStableAnchorIndex(target, {
      sourceRevision: "source-2",
      scoreRevision: "score-2"
    });
    const rebased = rebaseStableAnchor(sourceAnchor, targetIndex);
    const expectedTarget = note(target, 2);

    expect(rebased.status).toBe("rebased");
    expect(rebased.anchor?.kind).toBe("event");
    if (rebased.anchor?.kind === "event") {
      expect(rebased.anchor.parserIdHint).toBe(expectedTarget.id);
      expect(rebased.anchor.ordinalHint).not.toBe(sourceAnchor.ordinalHint);
      expect(rebased.anchor.structuralFingerprint).toBe(
        sourceAnchor.structuralFingerprint
      );
    }
  });

  it("rejects rebasing across project lineage even when parser identities match", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const unrelated = parseScore("7 6 5 |", "かきく");
    const unrelatedIndex = buildStableAnchorIndex(unrelated, {
      projectId: "unrelated-project",
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });

    for (const sourceAnchor of [sourceIndex.score, sourceIndex.voices[0]!]) {
      expect(rebaseStableAnchor(sourceAnchor, unrelatedIndex)).toMatchObject({
        status: "missing",
        reason: "project-lineage-mismatch",
        anchor: null
      });
    }
  });

  it("fails closed instead of retargeting a uniquely matching note elsewhere", () => {
    const source = parseScore("1 2 3 | 4 5 6 |", "あいうえおか");
    const sourceAnchor = eventAnchor(source, 2);
    const movedElsewhere = parseScore("1 3 | 4 2 6 |", "あいうえお");
    const result = rebaseStableAnchor(
      sourceAnchor,
      buildStableAnchorIndex(movedElsewhere, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("rejects a one-sided event-context impostor", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const sourceAnchor = eventAnchor(source, 2);
    const oneSided = parseScore("4 2 3 |", "えいう");
    const result = rebaseStableAnchor(
      sourceAnchor,
      buildStableAnchorIndex(oneSided, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("fails closed for a context-free changed voice but rebases an interior measure", () => {
    const source = parseScore("1 | 2 | 3 |", "あいう");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const changed = parseScore("1 | 7 2 | 3 |", "あえいう");
    const targetIndex = buildStableAnchorIndex(changed, {
      sourceRevision: "source-2",
      scoreRevision: "score-2"
    });

    const voiceResult = rebaseStableAnchor(sourceIndex.voices[0]!, targetIndex);
    expect(voiceResult).toMatchObject({
      status: "missing",
      reason: "changed-structure-without-context",
      anchor: null
    });

    const measureResult = rebaseStableAnchor(sourceIndex.measures[1]!, targetIndex);
    expect(measureResult).toMatchObject({
      status: "rebased",
      reason: "unique-changed-structure-context-match"
    });
    expect(measureResult.anchor?.kind).toBe("measure");
    expect(measureResult.anchor?.ordinalHint).toBe(1);
  });

  it("rebases a changed voice only when both neighboring voices identify it", () => {
    const source = scoreWithVoices("1 |", "2 |", "3 |");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const changed = scoreWithVoices("1 |", "7 2 |", "3 |");
    const targetIndex = buildStableAnchorIndex(changed, {
      sourceRevision: "source-2",
      scoreRevision: "score-2"
    });
    const result = rebaseStableAnchor(sourceIndex.voices[1]!, targetIndex);

    expect(result).toMatchObject({
      status: "rebased",
      reason: "unique-changed-structure-context-match"
    });
    expect(result.anchor?.kind).toBe("voice");
    expect(result.anchor?.ordinalHint).toBe(1);
  });

  it("does not retarget a removed repeated measure to another occurrence", () => {
    const source = parseScore("1 | 2 | 3 | 2 | 4 |", "あいうえお");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const removedFirstOccurrence = parseScore("1 | 3 | 2 | 4 |", "あいうえ");
    const result = rebaseStableAnchor(
      sourceIndex.measures[1]!,
      buildStableAnchorIndex(removedFirstOccurrence, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("does not retarget an event inside a removed duplicate measure", () => {
    const source = parseScore("1 2 3 | 1 2 3 | 4 |", "あいうえおかき");
    const sourceAnchor = eventAnchor(source, 2);
    const removedFirstMeasure = parseScore("1 2 3 | 4 |", "あいうえ");
    const result = rebaseStableAnchor(
      sourceAnchor,
      buildStableAnchorIndex(removedFirstMeasure, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("does not use a duplicated A-X-B measure context to select an event", () => {
    const source = parseScore(
      "1 | 2 | 3 | 1 | 2 | 3 | 4 |",
      "あいうえおかき"
    );
    const sourceAnchor = eventAnchor(source, 2);
    const removedFirstContext = parseScore("1 | 2 | 3 | 4 |", "あいうえ");
    const result = rebaseStableAnchor(
      sourceAnchor,
      buildStableAnchorIndex(removedFirstContext, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("returns ambiguous with no winner when structural and contextual matches tie", () => {
    const source = parseScore("1 2 1 |", "あいう");
    const sourceAnchor = eventAnchor(source, 2);
    const duplicated = parseScore("1 2 1 2 1 |", "あいうえお");
    const result = rebaseStableAnchor(
      sourceAnchor,
      buildStableAnchorIndex(duplicated, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result.status).toBe("ambiguous");
    expect(result.anchor).toBeNull();
    expect(result.candidateIds).toHaveLength(2);
  });

  it("returns missing when the target musical fact is removed", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const sourceAnchor = eventAnchor(source, 2);
    const removed = parseScore("1 3 |", "あい");
    const result = rebaseStableAnchor(
      sourceAnchor,
      buildStableAnchorIndex(removed, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "no-structural-match",
      anchor: null
    });
  });

  it("keeps lyric tracks distinct and explicitly rebases a prepended cell", () => {
    const multitrack = parseJPWABC(`
.Voice
1 2 |
.Words
W1@1,1:
あ
W2@1,1:
あ
`).value;
    const multitrackIndex = buildStableAnchorIndex(multitrack, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const matchingCells = multitrackIndex.lyricCells.filter(
      (anchor) => anchor.structuralFingerprint === multitrackIndex.lyricCells[0]?.structuralFingerprint
    );
    expect(matchingCells.map((anchor) => anchor.track)).toEqual([1, 2]);
    expect(new Set(matchingCells.map((anchor) => anchor.id)).size).toBe(2);

    const source = parseScore("1 2 |", "あい");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const sourceCell = sourceIndex.lyricCells.find((anchor) => anchor.cellIdHint === "cell-1")
      ?? sourceIndex.lyricCells[0]!;
    const target = parseScore("7 1 2 |", "うあい");
    const targetIndex = buildStableAnchorIndex(target, {
      sourceRevision: "source-2",
      scoreRevision: "score-2"
    });
    const rebased = rebaseStableAnchor(sourceCell, targetIndex);

    expect(rebased.status).toBe("rebased");
    expect(rebased.anchor?.kind).toBe("lyric-cell");
    if (rebased.anchor?.kind === "lyric-cell") {
      expect(rebased.anchor.track).toBe(1);
      expect(rebased.anchor.ordinalHint).toBe(1);
    }
  });

  it("returns ambiguous for duplicate lyric cells with identical context", () => {
    const source = parseScore("1 2 3 |", "かあか");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const sourceCell = sourceIndex.lyricCells[1]!;
    const duplicated = parseScore("1 2 1 2 1 |", "かあかあか");
    const result = rebaseStableAnchor(
      sourceCell,
      buildStableAnchorIndex(duplicated, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result.status).toBe("ambiguous");
    expect(result.anchor).toBeNull();
  });

  it("rejects a lyric-cell match supported by only one neighboring cell", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const oneSided = parseScore("4 5 3 |", "えいう");
    const result = rebaseStableAnchor(
      sourceIndex.lyricCells[1]!,
      buildStableAnchorIndex(oneSided, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("does not retarget a cell inside a removed duplicate lyric block", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const originalBlock = source.lyrics[0]!;
    source.lyrics = [originalBlock, structuredClone(originalBlock)];
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const sourceCell = sourceIndex.lyricCells.find(
      (anchor) => anchor.blockOrdinalHint === 0 && anchor.ordinalHint === 1
    )!;
    const removedFirstBlock = structuredClone(source);
    removedFirstBlock.lyrics = removedFirstBlock.lyrics.slice(1);
    const result = rebaseStableAnchor(
      sourceCell,
      buildStableAnchorIndex(removedFirstBlock, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("does not use a duplicated A-X-B lyric-block context to select a cell", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const blockA = structuredClone(parseScore("1 2 3 |", "かきく").lyrics[0]!);
    const blockX = structuredClone(parseScore("1 2 3 |", "あいう").lyrics[0]!);
    const blockB = structuredClone(parseScore("1 2 3 |", "さしす").lyrics[0]!);
    source.lyrics = [
      blockA,
      blockX,
      blockB,
      structuredClone(blockA),
      structuredClone(blockX),
      structuredClone(blockB)
    ];
    source.lyricLayers = [];
    source.lyricAlignments = [];
    const sourceIndex = buildStableAnchorIndex(source, {
      sourceRevision: "source-1",
      scoreRevision: "score-1"
    });
    const sourceCell = sourceIndex.lyricCells.find(
      (anchor) => anchor.blockOrdinalHint === 1 && anchor.ordinalHint === 1
    )!;
    const removedFirstContext = structuredClone(source);
    removedFirstContext.lyrics = removedFirstContext.lyrics.slice(3);
    const result = rebaseStableAnchor(
      sourceCell,
      buildStableAnchorIndex(removedFirstContext, {
        sourceRevision: "source-2",
        scoreRevision: "score-2"
      })
    );

    expect(result).toMatchObject({
      status: "missing",
      reason: "structural-match-without-context",
      anchor: null
    });
  });

  it("includes lyric-layer semantics in the score fingerprint", () => {
    const source = parseScore("1 2 3 |", "あいう");
    const changed = structuredClone(source);
    changed.lyricLayers[0]!.lang = "ja-romaji";

    expect(fingerprintScoreIR(changed)).not.toBe(fingerprintScoreIR(source));
  });
});
