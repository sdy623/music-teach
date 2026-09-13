import { createDeterministicFingerprint } from "./fingerprint";
import type { MusicProjectV1, ProjectMetadata } from "./types";

export class RepositoryValidationError extends TypeError {
  constructor(readonly path: string, message: string) {
    super(`${path || "/"}: ${message}`);
    this.name = "RepositoryValidationError";
  }
}

/** Copy the entire persistence boundary without JSON.stringify's silent losses. */
export function cloneRepositoryJson<T>(input: T): T {
  return cloneJson(input, "", new Set<object>()) as T;
}

function cloneJson(value: unknown, path: string, ancestors: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    finite(value, path);
    return value;
  }
  if (typeof value !== "object") fail(path, "Only lossless JSON data is supported.");
  if (ancestors.has(value)) fail(path, "Cyclic data cannot be stored.");
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    fail(path, "Only plain objects and native arrays can be stored.");
  }
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key !== "string") fail(path, "Symbol properties cannot be stored.");
      if (isArray && key === "length") continue;
      const at = child(path, key);
      const descriptor = descriptors[key]!;
      if (!("value" in descriptor)) fail(at, "Accessors cannot be stored.");
      if (!descriptor.enumerable) fail(at, "Hidden properties cannot be stored.");
      if (isArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (value as unknown[]).length)) {
        fail(at, "Named array properties cannot be stored.");
      }
    }
    if (isArray) {
      const result: unknown[] = [];
      for (let index = 0; index < (value as unknown[]).length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) fail(child(path, String(index)), "Sparse array holes cannot be stored.");
        result.push(cloneJson(descriptor.value, child(path, String(index)), ancestors));
      }
      return result;
    }
    const result: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      // Defining data properties keeps a literal __proto__ key inert and intact.
      Object.defineProperty(result, key, {
        value: cloneJson(descriptors[key]!.value, child(path, key), ancestors),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

type Check = (value: unknown, path: string) => void;
type Fields = Record<string, Check>;

/**
 * Validate an already cloned JSON value. Call cloneRepositoryJson first for any
 * caller-owned input. Unknown fields are retained; this does not parse notation,
 * rebuild semantic projections, or validate the editor's old revision hash.
 */
export function assertRepositoryProject(input: unknown): asserts input is MusicProjectV1 {
  shape(input, "", {
    schema: literal("music-teach/project"), version: literal(1), id: identity,
    revision: nonnegativeInteger, revisionFingerprint: identity,
    createdAt: nullable(text), updatedAt: nullable(text), metadata, score: canonicalScore,
    lyricLayers: list(projectLyricLayer), lesson, timeline, assets: list(asset),
    evidence: list(evidence), proposals: list(proposal), provenance: list(provenance),
    diagnostics: list(projectDiagnostic), extensions: record
  });
  const ids = new Set<string>();
  for (const [index, entry] of (input as MusicProjectV1).provenance.entries()) {
    if (ids.has(entry.id)) fail(`/provenance/${index}/id`, "Provenance IDs must be unique.");
    ids.add(entry.id);
  }
}

function metadata(value: unknown, path: string): void {
  shape(value, path, {
    title: text, tags: list(text), artist: text, lyricist: text, composer: text,
    arranger: text, otherCredits: text, keyAndMeters: text, expression: text, extensions: record
  });
}

/** Small recovery journals do not need to load or hash a complete score. */
export function assertRepositoryMetadata(input: unknown): asserts input is ProjectMetadata {
  metadata(input, "/metadata");
}

function canonicalScore(value: unknown, path: string): void {
  const score = shape(value, path, {
    authority: literal("score-ir"), availability: literal("available"), revision: identity,
    source: (entry, at) => shape(entry, at, {
      kind: oneOf("embedded-score-ir", "external-score-ir"), id: identity,
      revision: identity, fingerprint: identity, extensions: record
    }),
    snapshot: (entry, at) => shape(entry, at, {
      schema: literal("music-teach/score-ir-snapshot"), version: literal(1), value: scoreIR
    }),
    snapshotFingerprint: identity, extensions: record
  });
  const fingerprint = createDeterministicFingerprint(score.snapshot);
  if (score.snapshotFingerprint !== fingerprint) fail(child(path, "snapshotFingerprint"), "Canonical snapshot fingerprint does not match its content.");
  const source = score.source as Record<string, unknown>;
  if (source.kind === "embedded-score-ir") {
    if (source.revision !== score.revision) fail(`${path}/source/revision`, "Embedded source revision must match the canonical score revision.");
    if (source.fingerprint !== fingerprint) fail(`${path}/source/fingerprint`, "Embedded source fingerprint must match the canonical snapshot.");
  }
}

function projectLyricLayer(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, kind: identity, language: nullable(text), track: nullable(nonnegativeInteger),
    text, sourcePhraseId: nullable(text), anchorStatus: oneOf("unresolved", "anchored"),
    cells: list(anyJson), extensions: record
  });
}

function lesson(value: unknown, path: string): void {
  shape(value, path, {
    kind: literal("teaching-project-v3"), sourceProjectId: identity, sourceLyrics: text,
    phrases: list((entry, at) => shape(entry, at, {
      id: identity, sourcePhraseId: identity, kind: oneOf("vocal", "instrumental", "blank"),
      lyricText: text, referenceReading: text, annotation: text, showMetronome: boolean,
      skipDuringPlayback: boolean, legacyProjection: record, extensions: record
    })),
    sectionBreaks: list(anyJson), customSections: list(anyJson), extensions: record
  });
}

function timeline(value: unknown, path: string): void {
  shape(value, path, {
    status: oneOf("unresolved", "available"), clock: nullable(oneOf("score", "media")),
    events: list(anyJson), extensions: record
  });
}

function asset(value: unknown, path: string): void {
  shape(value, path, { id: identity, kind: identity, fingerprint: identity, mediaType: nullable(text), extensions: record });
}

function evidence(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, kind: identity, scoreRevision: identity,
    status: oneOf("candidate", "accepted", "rejected", "stale", "invalid"),
    sourceFingerprint: identity, payload: anyJson, provenanceIds: list(identity), extensions: record
  });
}

function proposal(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, kind: identity, scoreRevision: identity,
    status: oneOf("proposed", "accepted", "rejected", "stale", "invalid"),
    inputFingerprint: identity,
    provider: nullable((entry, at) => shape(entry, at, { id: identity, version: identity })),
    payload: anyJson, provenanceIds: list(identity), extensions: record
  });
}

function provenance(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, kind: identity, sourceFormat: identity, sourceVersion: nullable(stringOrNumber),
    sourceProjectId: nullable(text), sourceFingerprint: identity, adapterId: identity,
    adapterVersion: identity, adapterFingerprint: identity, observedAt: nullable(text),
    sourceSnapshotExtensionKey: nullable(text), extensions: record
  });
}

function projectDiagnostic(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, severity: severity, source: oneOf("decode", "parser", "semantic", "layout", "renderer", "import", "migration", "storage", "playback"),
    code: identity, message: text
  }, {
    path: text, actionId: text, extensions: record,
    sourceRange: (entry, at) => {
      const range = shape(entry, at, { start: nonnegativeInteger, end: nonnegativeInteger });
      if ((range.end as number) < (range.start as number)) fail(at, "Source range end precedes its start.");
    }
  });
}

function scoreIR(value: unknown, path: string): void {
  shape(value, path, {
    title: (entry, at) => shape(entry, at, { raw: stringRecord }, {
      intro: text, title: text, subTitle: text, subTitle2: text, keyAndMeters: text,
      wordsByAndMusicBy: text, expression: text, linePos: text
    }),
    options: (entry, at) => shape(entry, at, { raw: stringRecord }, { horzSpacingGap: text, horzSpacingAW: text }),
    fonts: (entry, at) => shape(entry, at, { raw: stringRecord, fonts: dictionary((font, fontPath) => shape(font, fontPath, { key: text, raw: text, family: text }, { sizeMm: finite })) }),
    page: stringRecord, voices: list(voice), lyrics: list(lyricBlock),
    lyricAlignments: list(lyricAlignment), lyricLayers: list(lyricLayer),
    attachments: list(attachment), semantic, diagnostics: list(scoreDiagnostic)
  });
}

function voice(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, events: list(event),
    measures: list((entry, at) => shape(entry, at, {
      number: nonnegativeInteger, events: list(event), noteLikeCount: nonnegativeInteger, naturalWidth: nonnegative
    })),
    anchors: list((entry, at) => {
      list(identity)(entry, at);
      if ((entry as unknown[]).length !== 2) fail(at, "An anchor entry must contain a key and event ID.");
    })
  });
}

function event(value: unknown, path: string): void {
  const entry = shape(value, path, { id: identity, raw: text, kind: identity, position: nonnegativeInteger }, {
    measure: nonnegativeInteger, noteIndex: nonnegativeInteger
  });
  switch (entry.kind) {
    case "note":
      shape(entry, path, {
        degree: oneOf(1, 2, 3, 4, 5, 6, 7), octave: integer, duration,
        pitchKey: identity, attack: boolean, lyricAlignable: literal(true)
      }, {
        accidental: oneOf("sharp", "flat", "natural"), tieGroupId: identity,
        tieRole: oneOf("start", "continue", "end", "single"), visualRole: oneOf("normal", "tie-ghost")
      });
      return;
    case "rest": shape(entry, path, { duration, attack: literal(false), lyricAlignable: literal(false) }); return;
    case "rhythm": shape(entry, path, { duration, pitchKey: literal(null), lyricAlignable: literal(true) }, { semantic: oneOf("rap", "spoken", "percussion", "chant") }); return;
    case "barline": shape(entry, path, { style: oneOf("single", "double", "end", "start-repeat", "end-repeat", "start", "unknown") }); return;
    case "meter": shape(entry, path, { numerator: positiveInteger, denominator: positiveInteger }); return;
    case "standardText": shape(entry, path, { text }); return;
    case "return": return;
    case "slurMarker": shape(entry, path, { role: oneOf("start", "end") }); return;
    case "tupletMarker": shape(entry, path, { count: positiveInteger }); return;
    case "voltaMarker": shape(entry, path, { number: positiveInteger }); return;
    case "unknown": shape(entry, path, { reason: text }); return;
    default: fail(child(path, "kind"), "Unknown VoiceEvent kind; preserved notation uses kind 'unknown'.");
  }
}

function duration(value: unknown, path: string): void {
  shape(value, path, { underlines: nonnegativeInteger, dashes: nonnegativeInteger, dots: nonnegativeInteger });
}

function lyricCell(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, kind: oneOf("syllable", "extension", "multiChar", "separator", "space"),
    raw: text, display: text, consumesNoteSlot: boolean
  }, { skipSlots: nonnegativeInteger, normalizedText: text, inheritedTokenId: text, tokenId: text });
}

function lyricBlock(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, track: nonnegativeInteger, anchor: measureNote,
    rawText: text, cells: list(lyricCell), normalizedText: text
  }, { repeat: text, showNumber: boolean });
}

function lyricAlignment(value: unknown, path: string): void {
  shape(value, path, { cellId: identity, eventId: identity, measure: nonnegativeInteger, noteIndex: nonnegativeInteger });
}

function lyricLayer(value: unknown, path: string): void {
  shape(value, path, {
    id: identity, lang: text, source: oneOf("words", "demo", "external"),
    cells: list(lyricCell), alignments: list(lyricAlignment)
  });
}

function measureNote(value: unknown, path: string): void {
  shape(value, path, { measure: nonnegativeInteger, note: nonnegativeInteger });
}

function attachmentAnchor(value: unknown, path: string): void {
  const entry = shape(value, path, { kind: oneOf("measure-note", "return-or-row", "absolute-symbol-index", "unknown") });
  if (entry.kind === "measure-note") measureNote(entry, path);
  else if (entry.kind === "absolute-symbol-index") shape(entry, path, { index: nonnegativeInteger });
  else shape(entry, path, { raw: text });
}

function attachment(value: unknown, path: string): void {
  const entry = shape(value, path, { id: identity, type: oneOf("text", "unknown") });
  if (entry.type === "unknown") shape(entry, path, { raw: text });
  else shape(entry, path, {
    anchor: attachmentAnchor, dx: finite, dy: finite, fontRef: text,
    contentRaw: text, contentDisplay: text, scaleX: finite, scaleY: finite
  }, { occupyRaw: text });
}

function semantic(value: unknown, path: string): void {
  shape(value, path, {
    slurs: list((entry, at) => shape(entry, at, {
      id: identity, type: oneOf("slur", "tie", "tuplet"), startEventId: identity, endEventId: identity
    })),
    keyChanges: list((entry, at) => shape(entry, at, {
      id: identity, source: oneOf("attachment-text", "standard-text"), keyOfOne: text,
      anchor: attachmentAnchor, display: text
    })),
    readingOverrides: list((entry, at) => shape(entry, at, {
      anchor: (anchor, anchorPath) => shape(anchor, anchorPath, { bar: nonnegativeInteger, slot: nonnegativeInteger }),
      surface: text, reading: text, readingType: oneOf("jukujikun", "ateji", "lyric_reading", "name_reading"), morae: list(text)
    }, { meaning: text, noteAlignment: list(nonnegativeInteger) }))
  });
}

function scoreDiagnostic(value: unknown, path: string): void {
  shape(value, path, { severity, code: identity, message: text }, {
    raw: text, position: (entry, at) => shape(entry, at, {
      offset: nonnegativeInteger, line: nonnegativeInteger, column: nonnegativeInteger
    })
  });
}

function shape(value: unknown, path: string, required: Fields, optional: Fields = {}): Record<string, unknown> {
  record(value, path);
  const result = value as Record<string, unknown>;
  for (const [key, check] of Object.entries(required)) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) fail(child(path, key), "Required field is missing.");
    check(result[key], child(path, key));
  }
  for (const [key, check] of Object.entries(optional)) {
    if (Object.prototype.hasOwnProperty.call(result, key)) check(result[key], child(path, key));
  }
  return result;
}

function record(value: unknown, path: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "Expected an object.");
}

function list(check: Check): Check {
  return (value, path) => {
    if (!Array.isArray(value)) fail(path, "Expected an array.");
    value.forEach((entry, index) => check(entry, child(path, String(index))));
  };
}

function dictionary(check: Check): Check {
  return (value, path) => {
    record(value, path);
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) check(entry, child(path, key));
  };
}

const stringRecord = dictionary(text);

function anyJson(_value: unknown, _path: string): void { /* The clone boundary has already validated this payload. */ }
function text(value: unknown, path: string): void { if (typeof value !== "string") fail(path, "Expected a string."); }
function identity(value: unknown, path: string): void {
  text(value, path);
  if (!(value as string).trim()) fail(path, "Expected a non-empty identity.");
}
function boolean(value: unknown, path: string): void { if (typeof value !== "boolean") fail(path, "Expected a boolean."); }
function finite(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) fail(path, "Expected a finite lossless JSON number.");
}
function integer(value: unknown, path: string): void {
  finite(value, path);
  if (!Number.isSafeInteger(value)) fail(path, "Expected a safe integer.");
}
function nonnegative(value: unknown, path: string): void { finite(value, path); if ((value as number) < 0) fail(path, "Expected a non-negative number."); }
function nonnegativeInteger(value: unknown, path: string): void { integer(value, path); nonnegative(value, path); }
function positiveInteger(value: unknown, path: string): void { integer(value, path); if ((value as number) <= 0) fail(path, "Expected a positive integer."); }
function stringOrNumber(value: unknown, path: string): void { if (typeof value !== "string") finite(value, path); }
function severity(value: unknown, path: string): void { oneOf("info", "warning", "error")(value, path); }
function nullable(check: Check): Check { return (value, path) => { if (value !== null) check(value, path); }; }
function literal(expected: unknown): Check { return (value, path) => { if (value !== expected) fail(path, `Expected ${String(expected)}.`); }; }
function oneOf(...values: unknown[]): Check { return (value, path) => { if (!values.includes(value)) fail(path, `Expected one of: ${values.join(", ")}.`); }; }
function child(path: string, key: string): string { return `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`; }
function fail(path: string, message: string): never { throw new RepositoryValidationError(path, message); }
