import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ScoreIR } from "../../src/ir/score";
import {
  LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY,
  adaptTeachingProjectV3,
  createScoreIRSnapshotV1
} from "../../src/neo/project";
import { parseJPWABC } from "../../src/parser/parseJPWABC";
import { createTeachingProject } from "../../src/project/projectBuilder";

const SCORE_SOURCE = `
.Title
Title = F0-A Golden
KeyAndMeters = 1=C,4/4
.Voice
1 2 3 |
.Words
W1@1,1:
あいう
`;

function fixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      "tests/fixtures/projects/teaching-project-v3-unknowns.json",
      "utf8"
    )
  ) as Record<string, unknown>;
}

function score(): ScoreIR {
  return parseJPWABC(SCORE_SOURCE).value;
}

function scoreState(value: ScoreIR): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry instanceof Map ? [...entry.entries()] : entry
  );
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
}

describe("TeachingProjectV3Adapter", () => {
  it("creates an explicit blocked candidate when canonical ScoreIR is unavailable", () => {
    const source = fixture();
    const result = adaptTeachingProjectV3(source);

    expect(result.candidate).not.toBeNull();
    expect(result.lifecycle).toMatchObject({
      state: "candidate",
      requiresExplicitCommit: true,
      overwriteAllowed: false,
      commitEligibility: "blocked"
    });
    expect(result.candidate?.id).not.toBe(source.id);
    expect(result.candidate?.score).toMatchObject({
      authority: "score-ir",
      availability: "unavailable",
      snapshot: null
    });
    expect(result.diagnostics.map((entry) => entry.code)).toContain(
      "MIGRATION_VERIFIED_SCORE_IR_REQUIRED"
    );
  });

  it("is deterministic, input-immutable, isolated, and JSON round-trippable", () => {
    const source = fixture();
    const before = structuredClone(source);
    const canonicalScore = score();
    const scoreBefore = scoreState(canonicalScore);
    deepFreeze(source);

    const options = {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true as const
      }
    };
    const first = adaptTeachingProjectV3(source, options);
    const second = adaptTeachingProjectV3(source, options);

    expect(first).toEqual(second);
    expect(source).toEqual(before);
    expect(scoreState(canonicalScore)).toBe(scoreBefore);
    expect(first.lifecycle.commitEligibility).toBe("eligible");
    expect(first.candidate).toMatchObject({
      schema: "music-teach/project",
      version: 1,
      revision: 0,
      createdAt: null,
      updatedAt: null,
      metadata: {
        title: "F0-A Golden",
        artist: "Fixture Singer"
      },
      score: {
        authority: "score-ir",
        availability: "available",
        revision: "score-revision-1"
      },
      assets: [],
      evidence: [],
      proposals: []
    });

    const parsed = JSON.parse(JSON.stringify(first.candidate)) as typeof first.candidate;
    expect(parsed).toEqual(first.candidate);
    expect(parsed?.score.snapshot?.value.voices[0]?.anchors).toEqual(
      [...canonicalScore.voices[0]!.anchors.entries()].sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0
      )
    );

    const extension = first.candidate?.extensions[
      LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY
    ] as {
      sourceSnapshot: Record<string, unknown>;
    };
    const clonedTop = extension.sourceSnapshot.futureTop as {
      nested: [string, { value: number }];
    };
    clonedTop.nested[1].value = 99;
    expect(
      ((source.futureTop as { nested: [string, { value: number }] }).nested[1]).value
    ).toBe(42);

    const candidateEvent = first.candidate?.score.snapshot?.value.voices[0]?.events[0];
    if (candidateEvent) candidateEvent.raw = "candidate-only-change";
    expect(canonicalScore.voices[0]?.events[0]?.raw).not.toBe("candidate-only-change");
  });

  it("fingerprints the complete revision payload, including canonical score source", () => {
    const source = fixture();
    const canonicalScore = score();
    const first = adaptTeachingProjectV3(source, {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true,
        source: {
          kind: "external-score-ir",
          id: "verified-score-source",
          revision: "source-revision-1",
          fingerprint: "verified-source-fingerprint",
          extensions: { edition: "a" }
        }
      }
    });
    const second = adaptTeachingProjectV3(source, {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true,
        source: {
          kind: "external-score-ir",
          id: "verified-score-source",
          revision: "source-revision-1",
          fingerprint: "verified-source-fingerprint",
          extensions: { edition: "b" }
        }
      }
    });

    expect(first.candidate?.id).toBe(second.candidate?.id);
    expect(first.candidate?.score.snapshotFingerprint).toBe(
      second.candidate?.score.snapshotFingerprint
    );
    expect(first.candidate?.revisionFingerprint).not.toBe(
      second.candidate?.revisionFingerprint
    );
  });

  it("keeps evidence and proposal registries isolated from canonical ScoreIR", () => {
    const canonicalScore = score();
    const originalScoreBefore = scoreState(canonicalScore);
    const result = adaptTeachingProjectV3(fixture(), {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true
      }
    });
    const project = result.candidate!;
    const snapshotBefore = JSON.stringify(project.score.snapshot);

    project.evidence.push({
      id: "evidence-1",
      kind: "test-evidence",
      scoreRevision: project.score.revision,
      status: "candidate",
      sourceFingerprint: "evidence-source",
      payload: { value: 1 },
      provenanceIds: [],
      extensions: {}
    });
    project.proposals.push({
      id: "proposal-1",
      kind: "test-proposal",
      scoreRevision: project.score.revision,
      status: "proposed",
      inputFingerprint: "proposal-input",
      provider: { id: "test-provider", version: "1" },
      payload: { value: 2 },
      provenanceIds: [],
      extensions: {}
    });

    expect(JSON.stringify(project.score.snapshot)).toBe(snapshotBefore);
    expect(scoreState(canonicalScore)).toBe(originalScoreBefore);
  });

  it("preserves known semantics and exact unknown subtrees with a report", () => {
    const source = fixture();
    const result = adaptTeachingProjectV3(source, {
      canonicalScore: {
        snapshot: score(),
        revision: "score-revision-1",
        verified: true
      }
    });
    const project = result.candidate!;
    const extension = project.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY] as {
      sourceSnapshot: Record<string, unknown>;
      unknownFields: Record<string, unknown>;
    };

    expect(project.metadata).toMatchObject({
      title: "F0-A Golden",
      tags: ["golden", "neo"],
      lyricist: "Fixture Lyricist",
      composer: "Fixture Composer",
      arranger: "Fixture Arranger",
      keyAndMeters: "1=C,4/4",
      expression: "J=96"
    });
    expect(project.lyricLayers).toHaveLength(2);
    expect(project.lyricLayers[0]).toMatchObject({
      kind: "legacy-source-lyrics",
      text: "あいう",
      anchorStatus: "unresolved"
    });
    expect(project.timeline).toMatchObject({
      status: "unresolved",
      clock: null,
      events: []
    });
    expect(project.provenance[0]).toMatchObject({
      kind: "migration",
      sourceFormat: "music-teach/teaching-project",
      sourceVersion: 3,
      sourceProjectId: "legacy-f0a-fixture",
      sourceFingerprint: result.sourceFingerprint,
      adapterId: "music-teach/teaching-project-v3-adapter",
      adapterVersion: "1.0.0",
      observedAt: null,
      sourceSnapshotExtensionKey: LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY
    });
    expect(project.provenance[0]?.adapterFingerprint).toMatch(
      /^fnv1a64-utf16-noncrypto:/
    );
    expect(project.lesson.phrases[0]).toMatchObject({
      sourcePhraseId: "legacy-phrase-1",
      kind: "vocal",
      annotation: "Golden annotation",
      showMetronome: true,
      skipDuringPlayback: false
    });
    expect(project.lesson.sectionBreaks).toEqual(source.sectionBreaks);
    expect(project.lesson.customSections).toEqual(source.customSections);
    const legacyFrame = project.lesson.phrases[0]!.legacyProjection.frame as {
      measures: Array<{ tuplet: { count: number } }>;
      slots: Array<{ kind: string; tieGhost?: boolean }>;
      vendorFrame: { nested: { keep: string } };
    };
    expect(legacyFrame.vendorFrame.nested.keep).toBe("exactly");
    expect(legacyFrame.measures[0]?.tuplet.count).toBe(3);
    expect(legacyFrame.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "note", tieGhost: true }),
        expect.objectContaining({ kind: "rest" })
      ])
    );

    expect(extension.unknownFields).toMatchObject({
      "/futureTop": { nested: ["keep", { value: 42 }] },
      "/phrases/0/futurePhrase": { nested: ["keep", 42] },
      "/phrases/0/morphology/0/futureMorph": { confidence: 0.75 },
      "/phrases/0/lyricCells/0/futureCell": { source: "golden" },
      "/phrases/0/keyChanges/0/futureKeyChange": { notation: "keep" },
      "/sectionBreaks/0/futureBreak": { color: "blue" },
      "/customSections/0/futureSection": 7
    });
    expect(extension.sourceSnapshot).toEqual(source);
    for (const path of Object.keys(extension.unknownFields)) {
      expect(
        result.preservation.entries.some(
          (entry) => entry.path === path && entry.disposition === "preserved"
        )
      ).toBe(true);
    }
    expect(
      result.preservation.entries.some(
        (entry) =>
          entry.path === "/phrases/0/frame" &&
          entry.disposition === "preserved"
      )
    ).toBe(true);
  });

  it("normalizes repository-produced undefined object properties with explicit traceability", () => {
    const source = createTeachingProject("Undefined Fixture", "あいう") as
      ReturnType<typeof createTeachingProject> & { futureUndefined?: undefined };
    source.futureUndefined = undefined;

    expect(Object.prototype.hasOwnProperty.call(source.phrases[0], "frame")).toBe(true);
    expect(source.phrases[0]?.frame).toBeUndefined();

    const result = adaptTeachingProjectV3(source, {
      canonicalScore: {
        snapshot: score(),
        revision: "score-revision-1",
        verified: true
      }
    });
    const extension = result.candidate?.extensions[
      LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY
    ] as {
      sourceSnapshot: {
        futureUndefined?: unknown;
        phrases: Array<{ frame?: unknown }>;
      };
      undefinedObjectPropertyPaths: string[];
    };

    expect(result.lifecycle.commitEligibility).toBe("eligible");
    expect(result.preservation.status).toBe("partial");
    expect(result.preservation.counts.approximated).toBe(2);
    expect(extension.undefinedObjectPropertyPaths).toEqual([
      "/futureUndefined",
      "/phrases/0/frame"
    ]);
    expect(Object.prototype.hasOwnProperty.call(extension.sourceSnapshot, "futureUndefined"))
      .toBe(false);
    expect(Object.prototype.hasOwnProperty.call(extension.sourceSnapshot.phrases[0], "frame"))
      .toBe(false);
    expect(result.preservation.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/futureUndefined",
          disposition: "approximated",
          code: "MIGRATION_UNDEFINED_OBJECT_PROPERTY_NORMALIZED"
        }),
        expect.objectContaining({
          path: "/phrases/0/frame",
          disposition: "approximated",
          code: "MIGRATION_UNDEFINED_OBJECT_PROPERTY_NORMALIZED"
        })
      ])
    );

    const jsonRoundTrippedSource = JSON.parse(JSON.stringify(source)) as unknown;
    const jsonRoundTrippedResult = adaptTeachingProjectV3(jsonRoundTrippedSource);
    expect(result.sourceFingerprint).not.toBe(jsonRoundTrippedResult.sourceFingerprint);
    expect(Object.prototype.hasOwnProperty.call(source, "futureUndefined")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(source.phrases[0], "frame")).toBe(true);
  });

  it("fails closed for malformed, cyclic, or non-JSON-safe input", () => {
    expect(adaptTeachingProjectV3(null)).toMatchObject({
      candidate: null,
      lifecycle: { commitEligibility: "blocked" }
    });
    const unsupportedVersion = adaptTeachingProjectV3({
      ...fixture(),
      formatVersion: 2
    });
    expect(unsupportedVersion.diagnostics.map((entry) => entry.code)).toContain(
      "MIGRATION_UNSUPPORTED_SOURCE_VERSION"
    );
    expect(unsupportedVersion.preservation.sourceVersion).toBe(2);

    const cyclic = fixture();
    cyclic.futureCycle = cyclic;
    const cyclicResult = adaptTeachingProjectV3(cyclic);
    expect(cyclicResult.candidate).toBeNull();
    expect(cyclicResult.diagnostics.map((entry) => entry.code)).toContain(
      "MIGRATION_SOURCE_NOT_JSON_SAFE"
    );

    const nonJson = { ...fixture(), futureFunction: () => "not-json" };
    expect(adaptTeachingProjectV3(nonJson).candidate).toBeNull();

    const undefinedArrayEntry = { ...fixture(), futureArray: [undefined] };
    const undefinedArrayResult = adaptTeachingProjectV3(undefinedArrayEntry);
    expect(undefinedArrayResult.candidate).toBeNull();
    expect(undefinedArrayResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MIGRATION_SOURCE_NOT_JSON_SAFE",
          path: "/futureArray/0"
        })
      ])
    );

    const negativeZero = { ...fixture(), futureNegativeZero: -0 };
    const negativeZeroResult = adaptTeachingProjectV3(negativeZero);
    expect(negativeZeroResult.candidate).toBeNull();
    expect(negativeZeroResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MIGRATION_SOURCE_NOT_JSON_SAFE",
          path: "/futureNegativeZero"
        })
      ])
    );
  });

  it("rejects hidden, symbol-keyed, or accessor source data without invoking accessors", () => {
    const hidden = fixture();
    Object.defineProperty(hidden, "futureHidden", {
      value: { mustNotDisappear: true },
      enumerable: false
    });

    const symbolKeyed = fixture();
    Object.defineProperty(symbolKeyed, Symbol("futureSymbol"), {
      value: { mustNotDisappear: true },
      enumerable: true
    });

    const withToJSON = fixture();
    Object.defineProperty(withToJSON, "toJSON", {
      value: () => ({ replaced: true }),
      enumerable: false
    });

    let getterCalls = 0;
    const accessor = fixture();
    Object.defineProperty(accessor, "futureAccessor", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return { mustNotDisappear: true };
      }
    });

    for (const source of [hidden, symbolKeyed, withToJSON, accessor]) {
      const result = adaptTeachingProjectV3(source);
      expect(result.candidate).toBeNull();
      expect(result.diagnostics.map((entry) => entry.code)).toContain(
        "MIGRATION_SOURCE_NOT_JSON_SAFE"
      );
    }
    expect(getterCalls).toBe(0);
  });

  it("blocks a verified ScoreIR that JSON serialization would alter", () => {
    const canonicalScore = score();
    const scoreEvent = canonicalScore.voices[0]?.events.find(
      (event) => event.kind === "note"
    );
    if (!scoreEvent || scoreEvent.kind !== "note") {
      throw new Error("Expected a note in the canonical score fixture");
    }
    scoreEvent.duration.underlines = Number.NaN;

    const result = adaptTeachingProjectV3(fixture(), {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true
      }
    });

    expect(result.lifecycle.commitEligibility).toBe("blocked");
    expect(result.candidate?.score).toMatchObject({
      authority: "score-ir",
      availability: "unavailable",
      snapshot: null
    });
    expect(result.diagnostics.map((entry) => entry.code)).toContain(
      "MIGRATION_SCORE_SNAPSHOT_NOT_SERIALIZABLE"
    );
  });

  it("blocks negative zero before score snapshot serialization can normalize it", () => {
    const canonicalScore = score();
    const scoreEvent = canonicalScore.voices[0]?.events.find(
      (event) => event.kind === "note"
    );
    if (!scoreEvent || scoreEvent.kind !== "note") {
      throw new Error("Expected a note in the canonical score fixture");
    }
    scoreEvent.duration.underlines = -0;

    const result = adaptTeachingProjectV3(fixture(), {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true
      }
    });

    expect(result.lifecycle.commitEligibility).toBe("blocked");
    expect(result.candidate?.score.snapshot).toBeNull();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MIGRATION_SCORE_SNAPSHOT_NOT_SERIALIZABLE"
        })
      ])
    );
  });

  it("rejects hidden, symbol-keyed, or accessor ScoreIR data without invoking accessors", () => {
    const scoreWithProperty = (
      configure: (event: Record<PropertyKey, unknown>) => void
    ) => {
      const canonicalScore = score();
      const event = canonicalScore.voices[0]?.events[0];
      if (!event) throw new Error("Expected an event in the canonical score fixture");
      configure(event as unknown as Record<PropertyKey, unknown>);
      return canonicalScore;
    };

    const hidden = scoreWithProperty((event) => {
      Object.defineProperty(event, "futureHidden", {
        value: { mustNotDisappear: true },
        enumerable: false
      });
    });
    const symbolKeyed = scoreWithProperty((event) => {
      Object.defineProperty(event, Symbol("futureSymbol"), {
        value: { mustNotDisappear: true },
        enumerable: true
      });
    });
    const withToJSON = scoreWithProperty((event) => {
      Object.defineProperty(event, "toJSON", {
        value: () => ({ replaced: true }),
        enumerable: false
      });
    });
    let getterCalls = 0;
    const accessor = scoreWithProperty((event) => {
      Object.defineProperty(event, "futureAccessor", {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return { mustNotDisappear: true };
        }
      });
    });

    for (const canonicalScore of [hidden, symbolKeyed, withToJSON, accessor]) {
      const result = adaptTeachingProjectV3(fixture(), {
        canonicalScore: {
          snapshot: canonicalScore,
          revision: "score-revision-1",
          verified: true
        }
      });
      expect(result.lifecycle.commitEligibility).toBe("blocked");
      expect(result.candidate?.score.snapshot).toBeNull();
      expect(result.diagnostics.map((entry) => entry.code)).toContain(
        "MIGRATION_SCORE_SNAPSHOT_NOT_SERIALIZABLE"
      );
    }
    expect(getterCalls).toBe(0);
  });

  it("blocks sparse ScoreIR arrays instead of converting holes to null", () => {
    const canonicalScore = score();
    canonicalScore.voices[0]!.events.length += 1;

    const result = adaptTeachingProjectV3(fixture(), {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true
      }
    });

    expect(result.lifecycle.commitEligibility).toBe("blocked");
    expect(result.candidate?.score.snapshot).toBeNull();
    expect(result.diagnostics.map((entry) => entry.code)).toContain(
      "MIGRATION_SCORE_SNAPSHOT_NOT_SERIALIZABLE"
    );
  });

  it("rejects named array properties that JSON serialization would discard", () => {
    const legacySource = fixture();
    const phrases = legacySource.phrases as unknown[] & { vendorMeta?: unknown };
    phrases.vendorMeta = { mustNotDisappear: true };
    const legacyResult = adaptTeachingProjectV3(legacySource);
    expect(legacyResult.candidate).toBeNull();
    expect(legacyResult.diagnostics.map((entry) => entry.code)).toContain(
      "MIGRATION_SOURCE_NOT_JSON_SAFE"
    );

    const canonicalScore = score();
    const voices = canonicalScore.voices as ScoreIR["voices"] & { vendorMeta?: unknown };
    voices.vendorMeta = { mustNotDisappear: true };
    const scoreResult = adaptTeachingProjectV3(fixture(), {
      canonicalScore: {
        snapshot: canonicalScore,
        revision: "score-revision-1",
        verified: true
      }
    });
    expect(scoreResult.lifecycle.commitEligibility).toBe("blocked");
    expect(scoreResult.candidate?.score.snapshot).toBeNull();
    expect(scoreResult.diagnostics.map((entry) => entry.code)).toContain(
      "MIGRATION_SCORE_SNAPSHOT_NOT_SERIALIZABLE"
    );
  });

  it("does not consult clocks, randomness, or browser storage", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now must not be used");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not be used");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage must not be read");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage must not be written");
    });

    try {
      const result = adaptTeachingProjectV3(fixture(), {
        canonicalScore: {
          snapshot: score(),
          revision: "score-revision-1",
          verified: true
        }
      });
      expect(result.lifecycle.commitEligibility).toBe("eligible");
      expect(now).not.toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      random.mockRestore();
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("serializes runtime VoiceIR anchor Maps as stable entry arrays", () => {
    const canonicalScore = score();
    const originalEntries = [...canonicalScore.voices[0]!.anchors.entries()];
    const originalNote = canonicalScore.voices[0]!.events.find(
      (event) => event.kind === "note"
    );
    expect(originalNote && Object.prototype.hasOwnProperty.call(originalNote, "accidental"))
      .toBe(true);
    expect(originalNote?.kind === "note" ? originalNote.accidental : null).toBeUndefined();
    const snapshot = createScoreIRSnapshotV1(canonicalScore);
    const roundTrip = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;

    expect(roundTrip).toEqual(snapshot);
    expect(roundTrip.value.voices[0]?.anchors).toEqual(
      originalEntries.sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0
      )
    );
    expect(roundTrip.value.voices[0]?.anchors).not.toEqual({});
    const snapshotNote = roundTrip.value.voices[0]?.events.find(
      (event) => event.kind === "note"
    );
    expect(snapshotNote && Object.prototype.hasOwnProperty.call(snapshotNote, "accidental"))
      .toBe(false);
  });
});
