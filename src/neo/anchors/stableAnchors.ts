import type { LyricBlock, LyricCell, LyricCellKind } from "../../ir/lyric";
import type { ScoreIR } from "../../ir/score";
import type { MeasureIR, VoiceEvent, VoiceIR } from "../../ir/voice";

export type StableAnchorKind = "score" | "voice" | "measure" | "event" | "lyric-cell";

export type StableAnchorTargetKind =
  | "score"
  | "voice"
  | "measure"
  | VoiceEvent["kind"]
  | LyricCellKind;

export interface StableAnchorRevisions {
  /** Stable project lineage; revisions may change but this identifier must not. */
  projectId: string;
  sourceRevision: string;
  scoreRevision: string;
}

export interface VoiceIdentity {
  sourceId: string;
  structuralFingerprint: string;
  structuralOccurrenceCount: number;
  neighborContextOccurrenceCount: number;
  ordinalHint: number;
  previousStructuralFingerprint?: string;
  nextStructuralFingerprint?: string;
}

export interface MeasureIdentity {
  structuralFingerprint: string;
  structuralOccurrenceCount: number;
  neighborContextOccurrenceCount: number;
  ordinalHint: number;
  sourceNumberHint: number;
  previousStructuralFingerprint?: string;
  nextStructuralFingerprint?: string;
}

interface StableAnchorBase<K extends StableAnchorKind, T extends StableAnchorTargetKind> {
  anchorVersion: 1;
  id: string;
  kind: K;
  targetKind: T;
  projectId: string;
  sourceRevision: string;
  scoreRevision: string;
  scoreFingerprint: string;
  structuralFingerprint: string;
  structuralOccurrenceCount: number;
  neighborContextOccurrenceCount: number;
  ordinalHint: number;
  previousStructuralFingerprint?: string;
  nextStructuralFingerprint?: string;
}

export interface ScoreStableAnchor extends StableAnchorBase<"score", "score"> {}

export interface VoiceStableAnchor extends StableAnchorBase<"voice", "voice"> {
  voice: VoiceIdentity;
}

export interface MeasureStableAnchor extends StableAnchorBase<"measure", "measure"> {
  voice: VoiceIdentity;
  measure: MeasureIdentity;
}

export interface EventStableAnchor extends StableAnchorBase<"event", VoiceEvent["kind"]> {
  voice: VoiceIdentity;
  measure: MeasureIdentity;
  parserIdHint: string;
}

export interface LyricCellStableAnchor extends StableAnchorBase<"lyric-cell", LyricCellKind> {
  track: number;
  blockFingerprint: string;
  blockOccurrenceCount: number;
  blockNeighborContextOccurrenceCount: number;
  blockOrdinalHint: number;
  cellIdHint: string;
  previousBlockFingerprint?: string;
  nextBlockFingerprint?: string;
  alignedEventFingerprint?: string;
}

export type StableAnchor =
  | ScoreStableAnchor
  | VoiceStableAnchor
  | MeasureStableAnchor
  | EventStableAnchor
  | LyricCellStableAnchor;

export interface StableAnchorIndex {
  anchorVersion: 1;
  projectId: string;
  sourceRevision: string;
  scoreRevision: string;
  scoreFingerprint: string;
  score: ScoreStableAnchor;
  voices: readonly VoiceStableAnchor[];
  measures: readonly MeasureStableAnchor[];
  events: readonly EventStableAnchor[];
  lyricCells: readonly LyricCellStableAnchor[];
  anchors: readonly StableAnchor[];
}

export type AnchorRebaseStatus = "unchanged" | "rebased" | "ambiguous" | "missing";

export type AnchorRebaseReason =
  | "exact-anchor-id"
  | "unique-structural-match"
  | "unique-contextual-match"
  | "unique-domain-match"
  | "unique-changed-structure-context-match"
  | "duplicate-anchor-id"
  | "multiple-structural-matches"
  | "multiple-changed-structure-matches"
  | "project-lineage-mismatch"
  | "structural-match-outside-domain"
  | "structural-match-without-context"
  | "changed-structure-without-context"
  | "no-structural-match";

interface AnchorRebaseResultBase<S extends AnchorRebaseStatus> {
  status: S;
  reason: AnchorRebaseReason;
  confidence: number;
  sourceAnchorId: string;
  targetSourceRevision: string;
  targetScoreRevision: string;
  candidateIds: readonly string[];
}

export interface AnchorRebaseSuccess
  extends AnchorRebaseResultBase<"unchanged" | "rebased"> {
  anchor: StableAnchor;
}

export interface AnchorRebaseFailure
  extends AnchorRebaseResultBase<"ambiguous" | "missing"> {
  anchor: null;
}

export type AnchorRebaseResult = AnchorRebaseSuccess | AnchorRebaseFailure;

/**
 * Builds all fact anchors without mutating ScoreIR or consulting process state.
 * Revisions participate in anchor IDs, but structural rebase deliberately ignores
 * revision equality so an anchor can be reviewed across score/source revisions.
 */
export function buildStableAnchorIndex(
  score: ScoreIR,
  revisions: StableAnchorRevisions
): StableAnchorIndex {
  assertRevision("projectId", revisions.projectId);
  assertRevision("sourceRevision", revisions.sourceRevision);
  assertRevision("scoreRevision", revisions.scoreRevision);

  const scoreFingerprint = fingerprintScoreIR(score);
  const voiceFingerprints = score.voices.map(fingerprintVoiceIR);
  const voices: VoiceStableAnchor[] = [];
  const measures: MeasureStableAnchor[] = [];
  const events: EventStableAnchor[] = [];

  const scoreAnchor: ScoreStableAnchor = {
    anchorVersion: 1,
    id: anchorId("score", revisions, scoreFingerprint, { scoreFingerprint }),
    kind: "score",
    targetKind: "score",
    projectId: revisions.projectId,
    sourceRevision: revisions.sourceRevision,
    scoreRevision: revisions.scoreRevision,
    scoreFingerprint,
    structuralFingerprint: scoreFingerprint,
    structuralOccurrenceCount: 1,
    neighborContextOccurrenceCount: 1,
    ordinalHint: 0
  };

  score.voices.forEach((voice, voiceOrdinal) => {
    const voiceIdentity = buildVoiceIdentity(voice, voiceOrdinal, voiceFingerprints);
    const voiceAnchor: VoiceStableAnchor = {
      anchorVersion: 1,
      id: anchorId("voice", revisions, scoreFingerprint, {
        voice: voiceIdentity,
        ordinalHint: voiceOrdinal
      }),
      kind: "voice",
      targetKind: "voice",
      projectId: revisions.projectId,
      sourceRevision: revisions.sourceRevision,
      scoreRevision: revisions.scoreRevision,
      scoreFingerprint,
      structuralFingerprint: voiceIdentity.structuralFingerprint,
      structuralOccurrenceCount: voiceIdentity.structuralOccurrenceCount,
      neighborContextOccurrenceCount: voiceIdentity.neighborContextOccurrenceCount,
      ordinalHint: voiceOrdinal,
      previousStructuralFingerprint: voiceIdentity.previousStructuralFingerprint,
      nextStructuralFingerprint: voiceIdentity.nextStructuralFingerprint,
      voice: voiceIdentity
    };
    voices.push(voiceAnchor);

    const measureFingerprints = voice.measures.map(fingerprintMeasureIR);
    voice.measures.forEach((measure, measureOrdinal) => {
      const measureIdentity = buildMeasureIdentity(measure, measureOrdinal, measureFingerprints);
      const measureAnchor: MeasureStableAnchor = {
        anchorVersion: 1,
        id: anchorId("measure", revisions, scoreFingerprint, {
          voice: voiceIdentity,
          measure: measureIdentity,
          ordinalHint: measureOrdinal
        }),
        kind: "measure",
        targetKind: "measure",
        projectId: revisions.projectId,
        sourceRevision: revisions.sourceRevision,
        scoreRevision: revisions.scoreRevision,
        scoreFingerprint,
        structuralFingerprint: measureIdentity.structuralFingerprint,
        structuralOccurrenceCount: measureIdentity.structuralOccurrenceCount,
        neighborContextOccurrenceCount: measureIdentity.neighborContextOccurrenceCount,
        ordinalHint: measureOrdinal,
        previousStructuralFingerprint: measureIdentity.previousStructuralFingerprint,
        nextStructuralFingerprint: measureIdentity.nextStructuralFingerprint,
        voice: voiceIdentity,
        measure: measureIdentity
      };
      measures.push(measureAnchor);

      const eventFingerprints = measure.events.map(fingerprintVoiceEvent);
      measure.events.forEach((event, eventOrdinal) => {
        const structuralFingerprint = eventFingerprints[eventOrdinal];
        if (!structuralFingerprint) return;
        const structuralOccurrenceCount = occurrenceCount(
          eventFingerprints,
          structuralFingerprint
        );
        const neighborContextCount = neighborContextOccurrenceCount(
          eventFingerprints,
          eventOrdinal
        );
        events.push({
          anchorVersion: 1,
          id: anchorId("event", revisions, scoreFingerprint, {
            voice: voiceIdentity,
            measure: measureIdentity,
            targetKind: event.kind,
            structuralFingerprint,
            structuralOccurrenceCount,
            neighborContextOccurrenceCount: neighborContextCount,
            previousStructuralFingerprint: eventFingerprints[eventOrdinal - 1],
            nextStructuralFingerprint: eventFingerprints[eventOrdinal + 1],
            ordinalHint: eventOrdinal
          }),
          kind: "event",
          targetKind: event.kind,
          projectId: revisions.projectId,
          sourceRevision: revisions.sourceRevision,
          scoreRevision: revisions.scoreRevision,
          scoreFingerprint,
          structuralFingerprint,
          structuralOccurrenceCount,
          neighborContextOccurrenceCount: neighborContextCount,
          ordinalHint: eventOrdinal,
          previousStructuralFingerprint: eventFingerprints[eventOrdinal - 1],
          nextStructuralFingerprint: eventFingerprints[eventOrdinal + 1],
          voice: voiceIdentity,
          measure: measureIdentity,
          parserIdHint: event.id
        });
      });
    });
  });

  const lyricCells = buildLyricCellAnchors(score, revisions, scoreFingerprint, events);
  const anchors: StableAnchor[] = [scoreAnchor, ...voices, ...measures, ...events, ...lyricCells];

  return {
    anchorVersion: 1,
    projectId: revisions.projectId,
    sourceRevision: revisions.sourceRevision,
    scoreRevision: revisions.scoreRevision,
    scoreFingerprint,
    score: scoreAnchor,
    voices,
    measures,
    events,
    lyricCells,
    anchors
  };
}

/**
 * Resolves an old anchor against a freshly-built index. Ambiguous and missing
 * results always carry `anchor: null`; callers cannot accidentally consume a
 * guessed target.
 */
export function rebaseStableAnchor(
  source: StableAnchor,
  target: StableAnchorIndex
): AnchorRebaseResult {
  if (source.projectId !== target.projectId) {
    return failureResult(
      "missing",
      "project-lineage-mismatch",
      source,
      target,
      []
    );
  }

  const exact = target.anchors.filter(
    (candidate) => candidate.kind === source.kind && candidate.id === source.id
  );
  if (exact.length === 1) {
    return successResult("unchanged", "exact-anchor-id", 1, source, target, exact[0]);
  }
  if (exact.length > 1) {
    return failureResult(
      "ambiguous",
      "duplicate-anchor-id",
      source,
      target,
      exact.map((candidate) => candidate.id)
    );
  }

  const structuralCandidates = target.anchors.filter(
    (candidate) =>
      candidate.kind === source.kind &&
      candidate.targetKind === source.targetKind &&
      candidate.structuralFingerprint === source.structuralFingerprint
  );
  if (structuralCandidates.length === 0) {
    const changedStructureResult = rebaseChangedStructure(source, target);
    if (changedStructureResult) return changedStructureResult;
    return failureResult("missing", "no-structural-match", source, target, []);
  }
  const domainCandidates = structuralCandidates.filter((candidate) =>
    isSameAnchorDomain(source, candidate)
  );
  if (domainCandidates.length === 0) {
    return failureResult(
      "missing",
      "structural-match-outside-domain",
      source,
      target,
      structuralCandidates.map((candidate) => candidate.id)
    );
  }
  if (domainCandidates.length === 1) {
    const candidate = domainCandidates[0];
    const evidence = contextualEvidence(source, candidate);
    if (!hasRequiredContext(source, candidate)) {
      return failureResult(
        "missing",
        "structural-match-without-context",
        source,
        target,
        domainCandidates.map((candidate) => candidate.id)
      );
    }
    return successResult(
      "rebased",
      "unique-structural-match",
      contextualConfidence(evidence),
      source,
      target,
      candidate
    );
  }

  const scored = domainCandidates.map((candidate) => ({
    candidate,
    evidence: contextualEvidence(source, candidate)
  }));
  const bestEvidence = Math.max(...scored.map(({ evidence }) => evidence));
  const best = scored.filter(({ evidence }) => evidence === bestEvidence);

  // Ordinals, parser IDs and source measure numbers are intentionally excluded
  // from evidence scoring. They may guide a UI, but never select a target.
  if (best.length === 1 && hasRequiredContext(source, best[0].candidate)) {
    return successResult(
      "rebased",
      "unique-contextual-match",
      contextualConfidence(bestEvidence),
      source,
      target,
      best[0].candidate
    );
  }

  return failureResult(
    "ambiguous",
    "multiple-structural-matches",
    source,
    target,
    domainCandidates.map((candidate) => candidate.id)
  );
}

export function fingerprintScoreIR(score: ScoreIR): string {
  const eventFingerprintById = new Map<string, string>();
  for (const voice of score.voices) {
    for (const event of voice.events) {
      eventFingerprintById.set(event.id, fingerprintVoiceEvent(event));
    }
  }

  const cellFingerprintById = new Map<string, string>();
  for (const block of score.lyrics) {
    for (const cell of block.cells) {
      cellFingerprintById.set(cell.id, fingerprintLyricCell(cell));
    }
  }

  return deterministicFingerprint("score-ir/v1", {
    title: score.title,
    options: score.options,
    fonts: score.fonts,
    page: score.page,
    voices: score.voices.map((voice) => ({
      sourceId: voice.id,
      structuralFingerprint: fingerprintVoiceIR(voice)
    })),
    lyrics: score.lyrics.map(fingerprintLyricBlock),
    lyricLayers: score.lyricLayers.map((layer) => ({
      lang: layer.lang,
      source: layer.source,
      cells: layer.cells.map(fingerprintLyricCell),
      alignments: layer.alignments.map((alignment) => ({
        cellFingerprint: cellFingerprintById.get(alignment.cellId) ?? "unresolved-cell",
        eventFingerprint: eventFingerprintById.get(alignment.eventId) ?? "unresolved-event"
      }))
    })),
    lyricAlignments: score.lyricAlignments.map((alignment) => ({
      cellFingerprint: cellFingerprintById.get(alignment.cellId) ?? "unresolved-cell",
      eventFingerprint: eventFingerprintById.get(alignment.eventId) ?? "unresolved-event"
    })),
    attachments: score.attachments.map((attachment) =>
      attachment.type === "text"
        ? {
            type: attachment.type,
            anchor: attachment.anchor,
            dx: attachment.dx,
            dy: attachment.dy,
            fontRef: attachment.fontRef,
            contentRaw: attachment.contentRaw,
            contentDisplay: attachment.contentDisplay,
            scaleX: attachment.scaleX,
            scaleY: attachment.scaleY,
            occupyRaw: attachment.occupyRaw
          }
        : { type: attachment.type, raw: attachment.raw }
    ),
    semantic: {
      slurs: score.semantic.slurs.map((slur) => ({
        type: slur.type,
        startEventFingerprint: eventFingerprintById.get(slur.startEventId) ?? "unresolved-event",
        endEventFingerprint: eventFingerprintById.get(slur.endEventId) ?? "unresolved-event"
      })),
      keyChanges: score.semantic.keyChanges.map((change) => ({
        source: change.source,
        keyOfOne: change.keyOfOne,
        anchor: change.anchor,
        display: change.display
      })),
      readingOverrides: score.semantic.readingOverrides
    }
  });
}

export function fingerprintVoiceIR(voice: VoiceIR): string {
  return deterministicFingerprint("voice-ir/v1", {
    sourceId: voice.id,
    measures: voice.measures.map(fingerprintMeasureIR),
    events: voice.events.map(fingerprintVoiceEvent)
  });
}

export function fingerprintMeasureIR(measure: MeasureIR): string {
  return deterministicFingerprint("measure-ir/v1", {
    events: measure.events.map(fingerprintVoiceEvent)
  });
}

export function fingerprintVoiceEvent(event: VoiceEvent): string {
  return deterministicFingerprint("voice-event/v1", structuralVoiceEvent(event));
}

export function fingerprintLyricBlock(block: LyricBlock): string {
  return deterministicFingerprint("lyric-block/v1", {
    track: block.track,
    repeat: block.repeat,
    showNumber: block.showNumber,
    rawText: block.rawText,
    normalizedText: block.normalizedText,
    cells: block.cells.map(fingerprintLyricCell)
  });
}

export function fingerprintLyricCell(cell: LyricCell): string {
  return deterministicFingerprint("lyric-cell/v1", {
    kind: cell.kind,
    raw: cell.raw,
    display: cell.display,
    consumesNoteSlot: cell.consumesNoteSlot,
    skipSlots: cell.skipSlots,
    normalizedText: cell.normalizedText
  });
}

/**
 * Small synchronous non-cryptographic digest for deterministic local identity.
 * It is not a security hash and must not be used for media integrity, signatures,
 * authentication or untrusted-content deduplication.
 */
export function deterministicFingerprint(namespace: string, value: unknown): string {
  const serialized = `${namespace}\u001f${stableSerialize(value)}`;
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;

  for (let index = 0; index < serialized.length; index += 1) {
    const codeUnit = serialized.charCodeAt(index);
    primary ^= codeUnit;
    primary = Math.imul(primary, 0x01000193);
    secondary ^= codeUnit + 0x9e37 + (secondary << 6) + (secondary >>> 2);
    secondary = Math.imul(secondary, 0x85ebca6b);
  }

  primary ^= primary >>> 16;
  primary = Math.imul(primary, 0x7feb352d);
  primary ^= primary >>> 15;
  secondary ^= secondary >>> 16;
  secondary = Math.imul(secondary, 0x846ca68b);
  secondary ^= secondary >>> 15;

  return `fp-v1-${toHex(primary)}${toHex(secondary)}`;
}

function buildVoiceIdentity(
  voice: VoiceIR,
  ordinalHint: number,
  fingerprints: readonly string[]
): VoiceIdentity {
  return {
    sourceId: voice.id,
    structuralFingerprint: fingerprints[ordinalHint] ?? fingerprintVoiceIR(voice),
    structuralOccurrenceCount: occurrenceCount(
      fingerprints,
      fingerprints[ordinalHint] ?? fingerprintVoiceIR(voice)
    ),
    neighborContextOccurrenceCount: neighborContextOccurrenceCount(
      fingerprints,
      ordinalHint
    ),
    ordinalHint,
    previousStructuralFingerprint: fingerprints[ordinalHint - 1],
    nextStructuralFingerprint: fingerprints[ordinalHint + 1]
  };
}

function buildMeasureIdentity(
  measure: MeasureIR,
  ordinalHint: number,
  fingerprints: readonly string[]
): MeasureIdentity {
  return {
    structuralFingerprint: fingerprints[ordinalHint] ?? fingerprintMeasureIR(measure),
    structuralOccurrenceCount: occurrenceCount(
      fingerprints,
      fingerprints[ordinalHint] ?? fingerprintMeasureIR(measure)
    ),
    neighborContextOccurrenceCount: neighborContextOccurrenceCount(
      fingerprints,
      ordinalHint
    ),
    ordinalHint,
    sourceNumberHint: measure.number,
    previousStructuralFingerprint: fingerprints[ordinalHint - 1],
    nextStructuralFingerprint: fingerprints[ordinalHint + 1]
  };
}

function buildLyricCellAnchors(
  score: ScoreIR,
  revisions: StableAnchorRevisions,
  scoreFingerprint: string,
  eventAnchors: readonly EventStableAnchor[]
): LyricCellStableAnchor[] {
  const eventFingerprintByParserId = new Map(
    eventAnchors.map((anchor) => [anchor.parserIdHint, anchor.structuralFingerprint] as const)
  );
  const alignedEventByCellId = new Map(
    score.lyricAlignments.map((alignment) => [alignment.cellId, alignment.eventId] as const)
  );
  const blockFingerprints = score.lyrics.map(fingerprintLyricBlock);
  const anchors: LyricCellStableAnchor[] = [];

  score.lyrics.forEach((block, blockOrdinal) => {
    const cellFingerprints = block.cells.map(fingerprintLyricCell);
    block.cells.forEach((cell, cellOrdinal) => {
      const structuralFingerprint = cellFingerprints[cellOrdinal];
      const blockFingerprint = blockFingerprints[blockOrdinal];
      if (!structuralFingerprint || !blockFingerprint) return;
      const structuralOccurrenceCount = occurrenceCount(
        cellFingerprints,
        structuralFingerprint
      );
      const cellNeighborContextCount = neighborContextOccurrenceCount(
        cellFingerprints,
        cellOrdinal
      );
      const blockOccurrenceCount = occurrenceCount(blockFingerprints, blockFingerprint);
      const blockNeighborContextCount = neighborContextOccurrenceCount(
        blockFingerprints,
        blockOrdinal
      );
      const alignedEventId = alignedEventByCellId.get(cell.id);
      const alignedEventFingerprint = alignedEventId
        ? eventFingerprintByParserId.get(alignedEventId)
        : undefined;

      anchors.push({
        anchorVersion: 1,
        id: anchorId("lyric-cell", revisions, scoreFingerprint, {
          track: block.track,
          blockFingerprint,
          previousBlockFingerprint: blockFingerprints[blockOrdinal - 1],
          nextBlockFingerprint: blockFingerprints[blockOrdinal + 1],
          blockOrdinalHint: blockOrdinal,
          targetKind: cell.kind,
          structuralFingerprint,
          structuralOccurrenceCount,
          neighborContextOccurrenceCount: cellNeighborContextCount,
          previousStructuralFingerprint: cellFingerprints[cellOrdinal - 1],
          nextStructuralFingerprint: cellFingerprints[cellOrdinal + 1],
          alignedEventFingerprint,
          blockOccurrenceCount,
          blockNeighborContextOccurrenceCount: blockNeighborContextCount,
          ordinalHint: cellOrdinal
        }),
        kind: "lyric-cell",
        targetKind: cell.kind,
        projectId: revisions.projectId,
        sourceRevision: revisions.sourceRevision,
        scoreRevision: revisions.scoreRevision,
        scoreFingerprint,
        structuralFingerprint,
        structuralOccurrenceCount,
        neighborContextOccurrenceCount: cellNeighborContextCount,
        ordinalHint: cellOrdinal,
        previousStructuralFingerprint: cellFingerprints[cellOrdinal - 1],
        nextStructuralFingerprint: cellFingerprints[cellOrdinal + 1],
        track: block.track,
        blockFingerprint,
        blockOccurrenceCount,
        blockNeighborContextOccurrenceCount: blockNeighborContextCount,
        blockOrdinalHint: blockOrdinal,
        cellIdHint: cell.id,
        previousBlockFingerprint: blockFingerprints[blockOrdinal - 1],
        nextBlockFingerprint: blockFingerprints[blockOrdinal + 1],
        alignedEventFingerprint
      });
    });
  });

  return anchors;
}

function structuralVoiceEvent(event: VoiceEvent): Record<string, unknown> {
  switch (event.kind) {
    case "note":
      return {
        kind: event.kind,
        degree: event.degree,
        accidental: event.accidental,
        octave: event.octave,
        duration: event.duration,
        pitchKey: event.pitchKey,
        tieRole: event.tieRole,
        visualRole: event.visualRole
      };
    case "rest":
      return { kind: event.kind, duration: event.duration };
    case "rhythm":
      return { kind: event.kind, duration: event.duration, semantic: event.semantic };
    case "barline":
      return { kind: event.kind, style: event.style };
    case "meter":
      return { kind: event.kind, numerator: event.numerator, denominator: event.denominator };
    case "standardText":
      return { kind: event.kind, text: event.text };
    case "return":
      return { kind: event.kind };
    case "slurMarker":
      return { kind: event.kind, role: event.role };
    case "tupletMarker":
      return { kind: event.kind, count: event.count };
    case "voltaMarker":
      return { kind: event.kind, number: event.number };
    case "unknown":
      return { kind: event.kind, raw: event.raw, reason: event.reason };
  }
}

function contextualEvidence(source: StableAnchor, candidate: StableAnchor): number {
  if (source.kind !== candidate.kind) return 0;

  switch (source.kind) {
    case "score":
      return 0;
    case "voice":
      return voiceContextEvidence(source, candidate as VoiceStableAnchor);
    case "measure":
      return measureContextEvidence(source, candidate as MeasureStableAnchor);
    case "event":
      return eventContextEvidence(source, candidate as EventStableAnchor);
    case "lyric-cell":
      return lyricContextEvidence(source, candidate as LyricCellStableAnchor);
  }
}

function isSameAnchorDomain(source: StableAnchor, candidate: StableAnchor): boolean {
  if (source.kind !== candidate.kind) return false;
  switch (source.kind) {
    case "score":
      return true;
    case "voice":
      return source.voice.sourceId === (candidate as VoiceStableAnchor).voice.sourceId;
    case "measure":
      return source.voice.sourceId === (candidate as MeasureStableAnchor).voice.sourceId;
    case "event":
      return source.voice.sourceId === (candidate as EventStableAnchor).voice.sourceId;
    case "lyric-cell":
      return source.track === (candidate as LyricCellStableAnchor).track;
  }
}

function hasRequiredContext(source: StableAnchor, candidate: StableAnchor): boolean {
  if (source.kind !== candidate.kind) return false;

  // Domain identity is never counted as independent context for repeated facts.
  // A same-container fingerprint is strong evidence; otherwise two separately
  // observed neighbors/alignment signals are required to fail closed.
  switch (source.kind) {
    case "score":
      return true;
    case "voice":
      return source.voice.sourceId === (candidate as VoiceStableAnchor).voice.sourceId;
    case "measure": {
      const measureCandidate = candidate as MeasureStableAnchor;
      return (
        source.voice.structuralFingerprint === measureCandidate.voice.structuralFingerprint ||
        (
          source.structuralFingerprint === measureCandidate.structuralFingerprint &&
          source.structuralOccurrenceCount === 1 &&
          measureCandidate.structuralOccurrenceCount === 1
        ) ||
        (
          measureNeighborSignalCount(source, measureCandidate) >= 2 &&
          hasUniqueNeighborContext(source, measureCandidate)
        )
      );
    }
    case "event": {
      const eventCandidate = candidate as EventStableAnchor;
      const sameUniqueMeasure =
        source.measure.structuralFingerprint === eventCandidate.measure.structuralFingerprint &&
        source.measure.structuralOccurrenceCount === 1 &&
        eventCandidate.measure.structuralOccurrenceCount === 1;
      const measureResolved =
        source.voice.structuralFingerprint === eventCandidate.voice.structuralFingerprint ||
        sameUniqueMeasure ||
        (
          eventMeasureNeighborSignalCount(source, eventCandidate) >= 2 &&
          source.measure.neighborContextOccurrenceCount === 1 &&
          eventCandidate.measure.neighborContextOccurrenceCount === 1
        ) ||
        (
          source.measure.structuralOccurrenceCount === 1 &&
          eventCandidate.measure.structuralOccurrenceCount === 1 &&
          eventContextSignalCount(source, eventCandidate) >= 2
        );
      const eventResolved =
        (
          source.structuralOccurrenceCount === 1 &&
          eventCandidate.structuralOccurrenceCount === 1
        ) || (
          eventNeighborSignalCount(source, eventCandidate) >= 2 &&
          hasUniqueNeighborContext(source, eventCandidate)
        );
      return measureResolved && eventResolved;
    }
    case "lyric-cell": {
      const lyricCandidate = candidate as LyricCellStableAnchor;
      const sameUniqueBlock =
        source.blockFingerprint === lyricCandidate.blockFingerprint &&
        source.blockOccurrenceCount === 1 &&
        lyricCandidate.blockOccurrenceCount === 1;
      const blockResolved =
        source.scoreFingerprint === lyricCandidate.scoreFingerprint ||
        sameUniqueBlock ||
        (
          lyricBlockNeighborSignalCount(source, lyricCandidate) >= 2 &&
          source.blockNeighborContextOccurrenceCount === 1 &&
          lyricCandidate.blockNeighborContextOccurrenceCount === 1
        ) ||
        (
          source.blockOccurrenceCount === 1 &&
          lyricCandidate.blockOccurrenceCount === 1 &&
          lyricContextSignalCount(source, lyricCandidate) >= 2
        );
      const cellResolved =
        (
          source.structuralOccurrenceCount === 1 &&
          lyricCandidate.structuralOccurrenceCount === 1
        ) || (
          lyricCellNeighborSignalCount(source, lyricCandidate) >= 2 &&
          hasUniqueNeighborContext(source, lyricCandidate)
        );
      return blockResolved && cellResolved;
    }
  }
}

function rebaseChangedStructure(
  source: StableAnchor,
  target: StableAnchorIndex
): AnchorRebaseResult | null {
  if (source.kind === "score") {
    return successResult(
      "rebased",
      "unique-domain-match",
      0.75,
      source,
      target,
      target.score
    );
  }

  if (source.kind === "voice") {
    const domainCandidates = target.voices.filter(
      (candidate) => candidate.voice.sourceId === source.voice.sourceId
    );
    if (domainCandidates.length === 0) return null;
    const qualified = domainCandidates
      .filter(
        (candidate) =>
          voiceNeighborSignalCount(source, candidate) >= 2 &&
          hasUniqueNeighborContext(source, candidate)
      )
      .map((candidate) => ({
        candidate,
        evidence: contextualEvidence(source, candidate)
      }));
    if (qualified.length === 0) {
      return failureResult(
        "missing",
        "changed-structure-without-context",
        source,
        target,
        domainCandidates.map((candidate) => candidate.id)
      );
    }
    const bestEvidence = Math.max(...qualified.map(({ evidence }) => evidence));
    const best = qualified.filter(({ evidence }) => evidence === bestEvidence);
    if (best.length === 1) {
      return successResult(
        "rebased",
        "unique-changed-structure-context-match",
        contextualConfidence(bestEvidence),
        source,
        target,
        best[0].candidate
      );
    }
    return failureResult(
      "ambiguous",
      "multiple-changed-structure-matches",
      source,
      target,
      best.map(({ candidate }) => candidate.id)
    );
  }

  if (source.kind !== "measure") return null;
  const domainCandidates = target.measures.filter(
    (candidate) => candidate.voice.sourceId === source.voice.sourceId
  );
  if (domainCandidates.length === 0) return null;
  const qualified = domainCandidates
    .filter((candidate) => hasRequiredContext(source, candidate))
    .map((candidate) => ({
      candidate,
      evidence: contextualEvidence(source, candidate)
    }));
  if (qualified.length === 0) {
    return failureResult(
      "missing",
      "changed-structure-without-context",
      source,
      target,
      domainCandidates.map((candidate) => candidate.id)
    );
  }
  const bestEvidence = Math.max(...qualified.map(({ evidence }) => evidence));
  const best = qualified.filter(({ evidence }) => evidence === bestEvidence);
  if (best.length === 1) {
    return successResult(
      "rebased",
      "unique-changed-structure-context-match",
      contextualConfidence(bestEvidence),
      source,
      target,
      best[0].candidate
    );
  }
  return failureResult(
    "ambiguous",
    "multiple-changed-structure-matches",
    source,
    target,
    best.map(({ candidate }) => candidate.id)
  );
}

function measureNeighborSignalCount(
  source: MeasureStableAnchor,
  candidate: MeasureStableAnchor
): number {
  return Number(matchesDefined(
    source.previousStructuralFingerprint,
    candidate.previousStructuralFingerprint
  )) + Number(matchesDefined(
    source.nextStructuralFingerprint,
    candidate.nextStructuralFingerprint
  ));
}

function voiceNeighborSignalCount(
  source: VoiceStableAnchor,
  candidate: VoiceStableAnchor
): number {
  return Number(matchesDefined(
    source.previousStructuralFingerprint,
    candidate.previousStructuralFingerprint
  )) + Number(matchesDefined(
    source.nextStructuralFingerprint,
    candidate.nextStructuralFingerprint
  ));
}

function eventNeighborSignalCount(
  source: EventStableAnchor,
  candidate: EventStableAnchor
): number {
  return Number(matchesDefined(
    source.previousStructuralFingerprint,
    candidate.previousStructuralFingerprint
  )) + Number(matchesDefined(
    source.nextStructuralFingerprint,
    candidate.nextStructuralFingerprint
  ));
}

function eventMeasureNeighborSignalCount(
  source: EventStableAnchor,
  candidate: EventStableAnchor
): number {
  return Number(matchesDefined(
    source.measure.previousStructuralFingerprint,
    candidate.measure.previousStructuralFingerprint
  )) + Number(matchesDefined(
    source.measure.nextStructuralFingerprint,
    candidate.measure.nextStructuralFingerprint
  ));
}

function eventContextSignalCount(
  source: EventStableAnchor,
  candidate: EventStableAnchor
): number {
  return [
    matchesDefined(source.previousStructuralFingerprint, candidate.previousStructuralFingerprint),
    matchesDefined(source.nextStructuralFingerprint, candidate.nextStructuralFingerprint),
    matchesDefined(
      source.measure.previousStructuralFingerprint,
      candidate.measure.previousStructuralFingerprint
    ),
    matchesDefined(
      source.measure.nextStructuralFingerprint,
      candidate.measure.nextStructuralFingerprint
    )
  ].filter(Boolean).length;
}

function lyricContextSignalCount(
  source: LyricCellStableAnchor,
  candidate: LyricCellStableAnchor
): number {
  return [
    matchesDefined(source.previousStructuralFingerprint, candidate.previousStructuralFingerprint),
    matchesDefined(source.nextStructuralFingerprint, candidate.nextStructuralFingerprint),
    matchesDefined(source.previousBlockFingerprint, candidate.previousBlockFingerprint),
    matchesDefined(source.nextBlockFingerprint, candidate.nextBlockFingerprint),
    matchesDefined(source.alignedEventFingerprint, candidate.alignedEventFingerprint)
  ].filter(Boolean).length;
}

function lyricBlockNeighborSignalCount(
  source: LyricCellStableAnchor,
  candidate: LyricCellStableAnchor
): number {
  return Number(matchesDefined(
    source.previousBlockFingerprint,
    candidate.previousBlockFingerprint
  )) + Number(matchesDefined(
    source.nextBlockFingerprint,
    candidate.nextBlockFingerprint
  ));
}

function lyricCellNeighborSignalCount(
  source: LyricCellStableAnchor,
  candidate: LyricCellStableAnchor
): number {
  return Number(matchesDefined(
    source.previousStructuralFingerprint,
    candidate.previousStructuralFingerprint
  )) + Number(matchesDefined(
    source.nextStructuralFingerprint,
    candidate.nextStructuralFingerprint
  ));
}

function matchesDefined(source: string | undefined, candidate: string | undefined): boolean {
  return source !== undefined && source === candidate;
}

function occurrenceCount(fingerprints: readonly string[], target: string): number {
  return fingerprints.reduce(
    (count, fingerprint) => count + Number(fingerprint === target),
    0
  );
}

function neighborContextOccurrenceCount(
  fingerprints: readonly string[],
  targetIndex: number
): number {
  const previous = fingerprints[targetIndex - 1];
  const next = fingerprints[targetIndex + 1];
  return fingerprints.reduce(
    (count, _fingerprint, index) =>
      count + Number(
        fingerprints[index - 1] === previous &&
        fingerprints[index + 1] === next
      ),
    0
  );
}

function hasUniqueNeighborContext(
  source: { neighborContextOccurrenceCount: number },
  candidate: { neighborContextOccurrenceCount: number }
): boolean {
  return (
    source.neighborContextOccurrenceCount === 1 &&
    candidate.neighborContextOccurrenceCount === 1
  );
}

function voiceContextEvidence(source: VoiceStableAnchor, candidate: VoiceStableAnchor): number {
  return (
    equalityEvidence(source.voice.sourceId, candidate.voice.sourceId, 2) +
    neighborEvidence(
      source.previousStructuralFingerprint,
      candidate.previousStructuralFingerprint,
      3
    ) +
    neighborEvidence(source.nextStructuralFingerprint, candidate.nextStructuralFingerprint, 3)
  );
}

function measureContextEvidence(
  source: MeasureStableAnchor,
  candidate: MeasureStableAnchor
): number {
  return (
    equalityEvidence(source.voice.sourceId, candidate.voice.sourceId, 2) +
    equalityEvidence(
      source.voice.structuralFingerprint,
      candidate.voice.structuralFingerprint,
      4
    ) +
    neighborEvidence(
      source.previousStructuralFingerprint,
      candidate.previousStructuralFingerprint,
      3
    ) +
    neighborEvidence(source.nextStructuralFingerprint, candidate.nextStructuralFingerprint, 3)
  );
}

function eventContextEvidence(source: EventStableAnchor, candidate: EventStableAnchor): number {
  return (
    equalityEvidence(source.voice.sourceId, candidate.voice.sourceId, 2) +
    equalityEvidence(
      source.voice.structuralFingerprint,
      candidate.voice.structuralFingerprint,
      4
    ) +
    equalityEvidence(
      source.measure.structuralFingerprint,
      candidate.measure.structuralFingerprint,
      5
    ) +
    neighborEvidence(
      source.measure.previousStructuralFingerprint,
      candidate.measure.previousStructuralFingerprint,
      1
    ) +
    neighborEvidence(
      source.measure.nextStructuralFingerprint,
      candidate.measure.nextStructuralFingerprint,
      1
    ) +
    neighborEvidence(
      source.previousStructuralFingerprint,
      candidate.previousStructuralFingerprint,
      3
    ) +
    neighborEvidence(source.nextStructuralFingerprint, candidate.nextStructuralFingerprint, 3)
  );
}

function lyricContextEvidence(
  source: LyricCellStableAnchor,
  candidate: LyricCellStableAnchor
): number {
  return (
    equalityEvidence(source.track, candidate.track, 2) +
    equalityEvidence(source.blockFingerprint, candidate.blockFingerprint, 5) +
    neighborEvidence(source.previousBlockFingerprint, candidate.previousBlockFingerprint, 1) +
    neighborEvidence(source.nextBlockFingerprint, candidate.nextBlockFingerprint, 1) +
    neighborEvidence(
      source.previousStructuralFingerprint,
      candidate.previousStructuralFingerprint,
      3
    ) +
    neighborEvidence(source.nextStructuralFingerprint, candidate.nextStructuralFingerprint, 3) +
    optionalEqualityEvidence(
      source.alignedEventFingerprint,
      candidate.alignedEventFingerprint,
      3
    )
  );
}

function equalityEvidence<T>(source: T, candidate: T, weight: number): number {
  return source === candidate ? weight : 0;
}

function neighborEvidence(
  source: string | undefined,
  candidate: string | undefined,
  weight: number
): number {
  return source !== undefined && source === candidate ? weight : 0;
}

function optionalEqualityEvidence(
  source: string | undefined,
  candidate: string | undefined,
  weight: number
): number {
  return source !== undefined && source === candidate ? weight : 0;
}

function contextualConfidence(evidence: number): number {
  return Math.min(0.89, 0.65 + evidence * 0.02);
}

function successResult(
  status: "unchanged" | "rebased",
  reason: AnchorRebaseReason,
  confidence: number,
  source: StableAnchor,
  target: StableAnchorIndex,
  anchor: StableAnchor
): AnchorRebaseSuccess {
  return {
    status,
    reason,
    confidence,
    sourceAnchorId: source.id,
    targetSourceRevision: target.sourceRevision,
    targetScoreRevision: target.scoreRevision,
    candidateIds: [anchor.id],
    anchor
  };
}

function failureResult(
  status: "ambiguous" | "missing",
  reason: AnchorRebaseReason,
  source: StableAnchor,
  target: StableAnchorIndex,
  candidateIds: readonly string[]
): AnchorRebaseFailure {
  return {
    status,
    reason,
    confidence: 0,
    sourceAnchorId: source.id,
    targetSourceRevision: target.sourceRevision,
    targetScoreRevision: target.scoreRevision,
    candidateIds,
    anchor: null
  };
}

function anchorId(
  kind: StableAnchorKind,
  revisions: StableAnchorRevisions,
  scoreFingerprint: string,
  identity: unknown
): string {
  const fingerprint = deterministicFingerprint(`stable-anchor/${kind}/v1`, {
    projectId: revisions.projectId,
    sourceRevision: revisions.sourceRevision,
    scoreRevision: revisions.scoreRevision,
    scoreFingerprint,
    identity
  });
  return `music-anchor-v1:${kind}:${fingerprint.slice("fp-v1-".length)}`;
}

function assertRevision(label: keyof StableAnchorRevisions, revision: string): void {
  if (!revision.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function stableSerialize(value: unknown, ancestors: readonly object[] = []): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (Number.isNaN(value)) return "number:NaN";
      if (value === Infinity) return "number:Infinity";
      if (value === -Infinity) return "number:-Infinity";
      if (Object.is(value, -0)) return "number:-0";
      return `number:${value}`;
    case "boolean":
      return value ? "boolean:true" : "boolean:false";
    case "bigint":
      return `bigint:${value.toString()}`;
    case "symbol":
      return `symbol:${String(value.description)}`;
    case "function":
      throw new TypeError("Functions cannot be deterministically fingerprinted");
    case "object":
      break;
  }

  if (ancestors.includes(value)) {
    throw new TypeError("Cyclic values cannot be deterministically fingerprinted");
  }
  const nextAncestors = [...ancestors, value];

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item, nextAncestors)).join(",")}]`;
  }
  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }
  if (value instanceof Map) {
    const entries = [...value.entries()]
      .map(([key, entryValue]) => [
        stableSerialize(key, nextAncestors),
        stableSerialize(entryValue, nextAncestors)
      ])
      .sort(([left], [right]) => compareCodeUnits(left, right));
    return `map:{${entries.map(([key, entryValue]) => `${key}:${entryValue}`).join(",")}}`;
  }
  if (value instanceof Set) {
    const entries = [...value].map((entry) => stableSerialize(entry, nextAncestors)).sort();
    return `set:[${entries.join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key], nextAncestors)}`);
  return `{${entries.join(",")}}`;
}

function toHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
