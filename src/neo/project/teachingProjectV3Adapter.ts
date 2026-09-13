import type { ScoreIR } from "../../ir/score";
import { createDeterministicFingerprint } from "./fingerprint";
import type {
  CanonicalScoreDocument,
  CanonicalScoreSourceReference,
  ImportProvenance,
  LegacyLessonPhraseDocument,
  MigrationCandidate,
  MusicProjectV1,
  PreservationCounts,
  PreservationEntry,
  PreservationReport,
  ProjectDiagnostic,
  ProjectDiagnosticSeverity,
  ProjectLyricLayerDocument,
  ScoreIRSnapshotV1,
  SerializableScoreIR,
  TeachingProjectV3AdapterOptions
} from "./types";

export const TEACHING_PROJECT_V3_ADAPTER_ID =
  "music-teach/teaching-project-v3-adapter";
export const TEACHING_PROJECT_V3_ADAPTER_VERSION = "1.0.0";
export const LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY =
  "music-teach/legacy-teaching-project-v3";

export const TEACHING_PROJECT_V3_ADAPTER_FINGERPRINT =
  createDeterministicFingerprint({
    id: TEACHING_PROJECT_V3_ADAPTER_ID,
    version: TEACHING_PROJECT_V3_ADAPTER_VERSION,
    sourceFormat: "music-teach/teaching-project",
    sourceVersion: 3,
    fingerprintEncoding: "canonical-json-like/fnv1a64-utf16-noncrypto",
    scoreAuthority: "score-ir"
  });

class JsonDataSafetyError extends TypeError {
  constructor(
    readonly path: string,
    message: string
  ) {
    super(message);
    this.name = "JsonDataSafetyError";
  }
}

const TOP_LEVEL_KEYS = new Set([
  "formatVersion",
  "id",
  "title",
  "tags",
  "artist",
  "lyricist",
  "composer",
  "arranger",
  "otherCredits",
  "keyAndMeters",
  "expression",
  "sourceLyrics",
  "phrases",
  "sectionBreaks",
  "customSections"
]);

const PHRASE_KEYS = new Set([
  "id",
  "lyricText",
  "referenceReading",
  "morphology",
  "kind",
  "voiceLine",
  "lyricJpwabc",
  "lyricCells",
  "keyOfOne",
  "keyChanges",
  "frame",
  "annotation",
  "showMetronome",
  "skipDuringPlayback"
]);

const MORPHOLOGY_KEYS = new Set([
  "id",
  "surface",
  "reading",
  "needsReview"
]);

const LYRIC_CELL_KEYS = new Set([
  "id",
  "kind",
  "raw",
  "display",
  "normalizedText",
  "tokenId",
  "inheritedTokenId",
  "slotIndex"
]);

const KEY_CHANGE_KEYS = new Set([
  "id",
  "slotIndex",
  "keyOfOne",
  "display",
  "semitoneShift"
]);

const SECTION_BREAK_KEYS = new Set(["phraseId", "section"]);
const CUSTOM_SECTION_KEYS = new Set(["id", "label"]);

export function adaptTeachingProjectV3(
  input: unknown,
  options: Readonly<TeachingProjectV3AdapterOptions> = {}
): MigrationCandidate<MusicProjectV1> {
  let sourceValue: unknown;
  let fingerprintSourceValue: unknown;
  let undefinedObjectPropertyPaths: string[];
  try {
    const prepared = prepareLegacyJsonData(input);
    sourceValue = prepared.jsonValue;
    fingerprintSourceValue = prepared.fingerprintValue;
    undefinedObjectPropertyPaths = prepared.undefinedObjectPropertyPaths;
  } catch (error) {
    return failedCandidate(
      "unavailable",
      null,
      diagnostic(
        [],
        "error",
        "MIGRATION_SOURCE_NOT_JSON_SAFE",
        errorMessage(error, "The source cannot be represented without loss."),
        error instanceof JsonDataSafetyError ? error.path : ""
      )
    );
  }

  const observedSourceVersion = sourceVersionOf(sourceValue);
  let sourceFingerprint: string;
  try {
    sourceFingerprint = createDeterministicFingerprint(fingerprintSourceValue);
  } catch (error) {
    return failedCandidate(
      "unavailable",
      observedSourceVersion,
      diagnostic(
        [],
        "error",
        "MIGRATION_SOURCE_NOT_FINGERPRINTABLE",
        errorMessage(error, "The source cannot be fingerprinted."),
        ""
      )
    );
  }

  const diagnostics: ProjectDiagnostic[] = [];
  const root = asRecord(sourceValue);
  if (!root) {
    diagnostics.push(diagnostic(
      diagnostics,
      "error",
      "MIGRATION_SOURCE_NOT_OBJECT",
      "TeachingProject v3 input must be a JSON object.",
      ""
    ));
  } else {
    validateTeachingProjectV3(root, diagnostics);
  }

  if (!root || diagnostics.some((entry) => entry.severity === "error")) {
    return failedCandidate(sourceFingerprint, observedSourceVersion, ...diagnostics);
  }

  const sourceSnapshot = cloneJsonData(root) as Record<string, unknown>;
  const unknownFields = collectUnknownFields(root);
  const preservationEntries = buildPreservationEntries(
    root,
    unknownFields,
    undefinedObjectPropertyPaths
  );
  const scoreResult = createCanonicalScoreDocument(
    sourceFingerprint,
    stringField(root, "id"),
    options,
    diagnostics,
    preservationEntries
  );
  const projectIdentityFingerprint = createDeterministicFingerprint({
    sourceFingerprint,
    scoreRevision: scoreResult.document.revision,
    scoreSnapshotFingerprint: scoreResult.document.snapshotFingerprint
  });
  const projectId = deterministicId("music-project", projectIdentityFingerprint);
  const provenance = createMigrationProvenance(
    projectId,
    stringField(root, "id"),
    sourceFingerprint
  );
  const lyricLayers = createLyricLayers(root, sourceFingerprint);
  const projectDiagnostics = diagnostics.map((entry) => cloneJsonData(entry));

  const projectWithoutRevisionFingerprint: Omit<MusicProjectV1, "revisionFingerprint"> = {
    schema: "music-teach/project",
    version: 1,
    id: projectId,
    revision: 0,
    createdAt: null,
    updatedAt: null,
    metadata: {
      title: stringField(root, "title"),
      tags: cloneJsonData(root.tags) as string[],
      artist: stringField(root, "artist"),
      lyricist: stringField(root, "lyricist"),
      composer: stringField(root, "composer"),
      arranger: stringField(root, "arranger"),
      otherCredits: stringField(root, "otherCredits"),
      keyAndMeters: stringField(root, "keyAndMeters"),
      expression: stringField(root, "expression"),
      extensions: {
        legacyProjectId: stringField(root, "id")
      }
    },
    score: scoreResult.document,
    lyricLayers,
    lesson: createLessonDocument(root, sourceFingerprint),
    timeline: {
      status: "unresolved",
      clock: null,
      events: [],
      extensions: {
        reason: "TeachingProject v3 has no canonical global timeline.",
        legacyFramesAreProjectionOnly: true
      }
    },
    assets: [],
    evidence: [],
    proposals: [],
    provenance: [provenance],
    diagnostics: projectDiagnostics,
    extensions: {
      [LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY]: {
        sourceSnapshot,
        unknownFields,
        undefinedObjectPropertyPaths,
        sourceFingerprint,
        sourceFormat: "music-teach/teaching-project",
        sourceVersion: 3
      }
    }
  };
  const project: MusicProjectV1 = {
    ...projectWithoutRevisionFingerprint,
    revisionFingerprint: createDeterministicFingerprint(
      projectWithoutRevisionFingerprint
    )
  };

  preservationEntries.push({
    path: "/timeline",
    disposition: "missing",
    targetPath: "/timeline",
    code: "MIGRATION_GLOBAL_TIMELINE_UNAVAILABLE",
    message: "TeachingProject v3 does not contain a canonical global timeline."
  });

  const preservation = createPreservationReport(
    sourceFingerprint,
    preservationEntries,
    "partial"
  );
  const blockingDiagnosticIds = diagnostics
    .filter((entry) => entry.severity === "error")
    .map((entry) => entry.id);

  return {
    candidate: project,
    sourceFingerprint,
    preservation,
    diagnostics,
    lifecycle: {
      state: "candidate",
      requiresExplicitCommit: true,
      overwriteAllowed: false,
      commitEligibility: scoreResult.committable ? "eligible" : "blocked",
      blockingDiagnosticIds
    }
  };
}

export function createScoreIRSnapshotV1(score: ScoreIR): ScoreIRSnapshotV1 {
  assertNoLossyArrayShapes(score);
  const serializableVoices = score.voices.map((voice) => {
    const { anchors, ...voiceWithoutAnchors } = voice;
    return {
      ...voiceWithoutAnchors,
      anchors: [
        ...(Map.prototype.entries.call(anchors) as MapIterator<[string, string]>)
      ].sort(([left], [right]) => compareText(left, right))
    };
  });
  const snapshotInput = {
    ...score,
    voices: serializableVoices
  };
  assertScoreSnapshotJsonSafe(snapshotInput);
  const serializable = cloneScoreSnapshotData(snapshotInput) as SerializableScoreIR;

  return {
    schema: "music-teach/score-ir-snapshot",
    version: 1,
    value: serializable
  };
}

export const TeachingProjectV3Adapter = Object.freeze({
  id: TEACHING_PROJECT_V3_ADAPTER_ID,
  version: TEACHING_PROJECT_V3_ADAPTER_VERSION,
  fingerprint: TEACHING_PROJECT_V3_ADAPTER_FINGERPRINT,
  createCandidate: adaptTeachingProjectV3
});

function createCanonicalScoreDocument(
  sourceFingerprint: string,
  sourceProjectId: string,
  options: Readonly<TeachingProjectV3AdapterOptions>,
  diagnostics: ProjectDiagnostic[],
  preservationEntries: PreservationEntry[]
): { document: CanonicalScoreDocument; committable: boolean } {
  const supplied = options.canonicalScore;
  if (!supplied) {
    const blocking = diagnostic(
      diagnostics,
      "error",
      "MIGRATION_VERIFIED_SCORE_IR_REQUIRED",
      "TeachingProject v3 cannot reconstruct canonical ScoreIR; a verified ScoreIR snapshot is required before commit.",
      "/score"
    );
    diagnostics.push(blocking);
    preservationEntries.push({
      path: "/score",
      disposition: "missing",
      targetPath: "/score/snapshot",
      code: "MIGRATION_VERIFIED_SCORE_IR_REQUIRED",
      message: "Legacy phrase frames were preserved as projections and were not promoted to score truth."
    });
    return {
      committable: false,
      document: unresolvedScoreDocument(sourceFingerprint, sourceProjectId)
    };
  }

  if (supplied.verified !== true || supplied.revision.trim().length === 0) {
    const blocking = diagnostic(
      diagnostics,
      "error",
      "MIGRATION_SCORE_VERIFICATION_INVALID",
      "The supplied ScoreIR must be explicitly verified and have a non-empty revision.",
      "/score"
    );
    diagnostics.push(blocking);
    preservationEntries.push({
      path: "/score",
      disposition: "unsupported",
      targetPath: "/score/snapshot",
      code: "MIGRATION_SCORE_VERIFICATION_INVALID",
      message: "An invalid canonical score option was not attached."
    });
    return {
      committable: false,
      document: unresolvedScoreDocument(sourceFingerprint, sourceProjectId)
    };
  }

  try {
    const snapshot = createScoreIRSnapshotV1(supplied.snapshot);
    const snapshotFingerprint = createDeterministicFingerprint(snapshot);
    const defaultSource: CanonicalScoreSourceReference = {
      kind: "embedded-score-ir",
      id: deterministicId("score-ir", snapshotFingerprint),
      revision: supplied.revision,
      fingerprint: snapshotFingerprint,
      extensions: {}
    };
    const source = supplied.source
      ? cloneStrictJsonData(supplied.source)
      : defaultSource;

    preservationEntries.push({
      path: "/score",
      disposition: "preserved",
      targetPath: "/score/snapshot",
      code: "MIGRATION_VERIFIED_SCORE_IR_ATTACHED",
      message: "The verified ScoreIR was serialized without promoting legacy phrase frames."
    });
    return {
      committable: true,
      document: {
        authority: "score-ir",
        availability: "available",
        revision: supplied.revision,
        source,
        snapshot,
        snapshotFingerprint,
        extensions: {
          legacyPhraseFramesAreProjectionOnly: true
        }
      }
    };
  } catch (error) {
    const blocking = diagnostic(
      diagnostics,
      "error",
      "MIGRATION_SCORE_SNAPSHOT_NOT_SERIALIZABLE",
      errorMessage(error, "The supplied ScoreIR cannot be serialized."),
      "/score"
    );
    diagnostics.push(blocking);
    preservationEntries.push({
      path: "/score",
      disposition: "unsupported",
      targetPath: "/score/snapshot",
      code: "MIGRATION_SCORE_SNAPSHOT_NOT_SERIALIZABLE",
      message: "The invalid ScoreIR snapshot was not attached."
    });
    return {
      committable: false,
      document: unresolvedScoreDocument(sourceFingerprint, sourceProjectId)
    };
  }
}

function unresolvedScoreDocument(
  sourceFingerprint: string,
  sourceProjectId: string
): CanonicalScoreDocument {
  return {
    authority: "score-ir",
    availability: "unavailable",
    revision: `unresolved:${shortFingerprint(sourceFingerprint)}`,
    source: {
      kind: "legacy-unresolved",
      id: sourceProjectId,
      revision: "teaching-project-v3",
      fingerprint: sourceFingerprint,
      extensions: {}
    },
    snapshot: null,
    snapshotFingerprint: null,
    extensions: {
      reason: "A legacy frame is a projection, not canonical ScoreIR."
    }
  };
}

function createMigrationProvenance(
  projectId: string,
  sourceProjectId: string,
  sourceFingerprint: string
): ImportProvenance {
  return {
    id: deterministicId("migration-provenance", sourceFingerprint),
    kind: "migration",
    sourceFormat: "music-teach/teaching-project",
    sourceVersion: 3,
    sourceProjectId,
    sourceFingerprint,
    adapterId: TEACHING_PROJECT_V3_ADAPTER_ID,
    adapterVersion: TEACHING_PROJECT_V3_ADAPTER_VERSION,
    adapterFingerprint: TEACHING_PROJECT_V3_ADAPTER_FINGERPRINT,
    observedAt: null,
    sourceSnapshotExtensionKey: LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY,
    extensions: {
      candidateProjectId: projectId,
      importedProjectIdWasNotUsedAsOverwriteTarget: true
    }
  };
}

function createLyricLayers(
  root: Record<string, unknown>,
  sourceFingerprint: string
): ProjectLyricLayerDocument[] {
  const sourceLayer: ProjectLyricLayerDocument = {
    id: deterministicId("legacy-source-lyrics", sourceFingerprint),
    kind: "legacy-source-lyrics",
    language: null,
    track: null,
    text: stringField(root, "sourceLyrics"),
    sourcePhraseId: null,
    anchorStatus: "unresolved",
    cells: [],
    extensions: {
      reason: "TeachingProject v3 does not retain a canonical lyric track identity."
    }
  };
  const phrases = root.phrases as Record<string, unknown>[];
  const phraseLayers = phrases.map((phrase) => {
    const phraseFingerprint = createDeterministicFingerprint(phrase);
    return {
      id: deterministicId("legacy-phrase-lyrics", phraseFingerprint),
      kind: "legacy-phrase-lyrics",
      language: null,
      track: null,
      text: stringField(phrase, "lyricText"),
      sourcePhraseId: stringField(phrase, "id"),
      anchorStatus: "unresolved",
      cells: cloneJsonData(phrase.lyricCells) as unknown[],
      extensions: {
        lyricJpwabc: stringField(phrase, "lyricJpwabc"),
        referenceReading: stringField(phrase, "referenceReading")
      }
    } satisfies ProjectLyricLayerDocument;
  });
  return [sourceLayer, ...phraseLayers];
}

function createLessonDocument(
  root: Record<string, unknown>,
  sourceFingerprint: string
) {
  const phrases = (root.phrases as Record<string, unknown>[]).map((phrase) => {
    const phraseFingerprint = createDeterministicFingerprint(phrase);
    return {
      id: deterministicId("lesson-phrase", phraseFingerprint),
      sourcePhraseId: stringField(phrase, "id"),
      kind: phrase.kind as LegacyLessonPhraseDocument["kind"],
      lyricText: stringField(phrase, "lyricText"),
      referenceReading: stringField(phrase, "referenceReading"),
      annotation: stringField(phrase, "annotation"),
      showMetronome: phrase.showMetronome as boolean,
      skipDuringPlayback: phrase.skipDuringPlayback as boolean,
      legacyProjection: cloneJsonData(phrase),
      extensions: {
        sourceFingerprint: phraseFingerprint,
        legacyFrameIsProjectionOnly: phrase.frame !== undefined
      }
    } satisfies LegacyLessonPhraseDocument;
  });
  return {
    kind: "teaching-project-v3" as const,
    sourceProjectId: stringField(root, "id"),
    sourceLyrics: stringField(root, "sourceLyrics"),
    phrases,
    sectionBreaks: cloneJsonData(root.sectionBreaks) as unknown[],
    customSections: cloneJsonData(root.customSections) as unknown[],
    extensions: {
      sourceFingerprint,
      legacyFramesAreProjectionOnly: true
    }
  };
}

function validateTeachingProjectV3(
  root: Record<string, unknown>,
  diagnostics: ProjectDiagnostic[]
): void {
  if (root.formatVersion !== 3) {
    diagnostics.push(diagnostic(
      diagnostics,
      "error",
      "MIGRATION_UNSUPPORTED_SOURCE_VERSION",
      "TeachingProjectV3Adapter only accepts formatVersion 3.",
      "/formatVersion"
    ));
  }

  requireString(root, "id", "", diagnostics);
  requireString(root, "title", "", diagnostics);
  requireStringArray(root, "tags", "", diagnostics);
  for (const key of [
    "artist",
    "lyricist",
    "composer",
    "arranger",
    "otherCredits",
    "keyAndMeters",
    "expression",
    "sourceLyrics"
  ]) {
    requireString(root, key, "", diagnostics);
  }
  requireArray(root, "sectionBreaks", "", diagnostics);
  requireArray(root, "customSections", "", diagnostics);
  if (!requireArray(root, "phrases", "", diagnostics)) return;

  (root.phrases as unknown[]).forEach((entry, index) => {
    const path = `/phrases/${index}`;
    const phrase = asRecord(entry);
    if (!phrase) {
      diagnostics.push(diagnostic(
        diagnostics,
        "error",
        "MIGRATION_INVALID_PHRASE",
        "Each phrase must be an object.",
        path
      ));
      return;
    }
    for (const key of [
      "id",
      "lyricText",
      "referenceReading",
      "voiceLine",
      "lyricJpwabc",
      "keyOfOne",
      "annotation"
    ]) {
      requireString(phrase, key, path, diagnostics);
    }
    if (phrase.kind !== "vocal" && phrase.kind !== "instrumental" && phrase.kind !== "blank") {
      diagnostics.push(diagnostic(
        diagnostics,
        "error",
        "MIGRATION_INVALID_PHRASE_KIND",
        "Phrase kind must be vocal, instrumental, or blank.",
        `${path}/kind`
      ));
    }
    requireBoolean(phrase, "showMetronome", path, diagnostics);
    requireBoolean(phrase, "skipDuringPlayback", path, diagnostics);
    validateRecordArray(phrase, "morphology", path, MORPHOLOGY_KEYS, diagnostics);
    validateRecordArray(phrase, "lyricCells", path, LYRIC_CELL_KEYS, diagnostics);
    validateRecordArray(phrase, "keyChanges", path, KEY_CHANGE_KEYS, diagnostics);
    if (phrase.frame !== undefined && !asRecord(phrase.frame)) {
      diagnostics.push(diagnostic(
        diagnostics,
        "error",
        "MIGRATION_INVALID_LEGACY_FRAME",
        "A legacy frame must be an object when present.",
        `${path}/frame`
      ));
    }
  });
}

function validateRecordArray(
  record: Record<string, unknown>,
  key: string,
  parentPath: string,
  knownKeys: ReadonlySet<string>,
  diagnostics: ProjectDiagnostic[]
): void {
  if (!requireArray(record, key, parentPath, diagnostics)) return;
  (record[key] as unknown[]).forEach((entry, index) => {
    if (!asRecord(entry)) {
      diagnostics.push(diagnostic(
        diagnostics,
        "error",
        "MIGRATION_INVALID_NESTED_RECORD",
        `${key} entries must be objects with JSON-safe fields.`,
        `${parentPath}/${key}/${index}`
      ));
      return;
    }
    // Accessing the set here makes the expected shape explicit; unknown keys
    // remain valid because they are retained in the source extension bag.
    void knownKeys;
  });
}

function collectJsonSafetyProblems(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  problems: { path: string; message: string }[],
  allowUndefinedObjectProperties: boolean,
  objectProperty: boolean,
  undefinedObjectPropertyPaths: string[]
): void {
  if (value === undefined && allowUndefinedObjectProperties && objectProperty) {
    undefinedObjectPropertyPaths.push(path);
    return;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Object.is(value, -0)) {
      problems.push({
        path,
        message: "Negative zero would be normalized to zero by JSON serialization."
      });
    } else if (!Number.isFinite(value)) {
      problems.push({ path, message: "Non-finite numbers are not JSON-safe." });
    }
    return;
  }
  if (typeof value !== "object") {
    problems.push({ path, message: `${typeof value} values are not JSON-safe.` });
    return;
  }
  if (ancestors.has(value)) {
    problems.push({ path, message: "Cyclic values are not JSON-safe." });
    return;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      problems.push({ path, message: "Only unmodified native arrays are accepted." });
      return;
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      problems.push({ path, message: "Only plain JSON objects are accepted." });
      return;
    }
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    collectUnsupportedOwnProperties(value, path, true, problems);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) {
        problems.push({
          path: `${path}/${index}`,
          message: "Sparse array holes are not JSON-safe."
        });
        continue;
      }
      if (!("value" in descriptor)) {
        problems.push({
          path: `${path}/${index}`,
          message: "Accessor properties are not accepted as JSON data."
        });
        continue;
      }
      if (!descriptor.enumerable) {
        problems.push({
          path: `${path}/${index}`,
          message: "Non-enumerable array entries would be lost during JSON serialization."
        });
        continue;
      }
      collectJsonSafetyProblems(
        descriptor.value,
        `${path}/${index}`,
        ancestors,
        problems,
        allowUndefinedObjectProperties,
        false,
        undefinedObjectPropertyPaths
      );
    }
  } else {
    collectUnsupportedOwnProperties(value, path, false, problems);
    ownStringDataEntries(value).forEach(([key, entryValue]) =>
      collectJsonSafetyProblems(
        entryValue,
        `${path}/${escapeJsonPointer(key)}`,
        ancestors,
        problems,
        allowUndefinedObjectProperties,
        true,
        undefinedObjectPropertyPaths
      )
    );
  }
  ancestors.delete(value);
}

function collectUnsupportedOwnProperties(
  value: object,
  path: string,
  array: boolean,
  problems: { path: string; message: string }[]
): void {
  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    if (typeof key === "symbol") {
      problems.push({
        path: `${path}/<symbol:${String(key.description ?? "")}>`,
        message: "Symbol-keyed properties would be lost during JSON serialization."
      });
      continue;
    }
    if (array && key === "length") continue;
    if (array && !isArrayIndexKey(key, (value as readonly unknown[]).length)) {
      problems.push({
        path: `${path}/${escapeJsonPointer(key)}`,
        message: "Named array properties would be lost during JSON serialization."
      });
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) {
      problems.push({
        path: `${path}/${escapeJsonPointer(key)}`,
        message: "Accessor properties are not accepted as JSON data."
      });
    } else if (!descriptor.enumerable) {
      problems.push({
        path: `${path}/${escapeJsonPointer(key)}`,
        message: "Non-enumerable properties would be lost during JSON serialization."
      });
    }
  }
}

function ownStringDataEntries(value: object): [string, unknown][] {
  return Object.getOwnPropertyNames(value)
    .sort(compareText)
    .flatMap((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && descriptor.enumerable && "value" in descriptor
        ? [[key, descriptor.value] as [string, unknown]]
        : [];
    });
}

function collectUnknownFields(root: Record<string, unknown>): Record<string, unknown> {
  const unknown: Record<string, unknown> = {};
  collectUnknownRecord(root, TOP_LEVEL_KEYS, "", unknown);
  const phrases = root.phrases as Record<string, unknown>[];
  phrases.forEach((phrase, phraseIndex) => {
    const phrasePath = `/phrases/${phraseIndex}`;
    collectUnknownRecord(phrase, PHRASE_KEYS, phrasePath, unknown);
    collectNestedUnknown(phrase.morphology, MORPHOLOGY_KEYS, `${phrasePath}/morphology`, unknown);
    collectNestedUnknown(phrase.lyricCells, LYRIC_CELL_KEYS, `${phrasePath}/lyricCells`, unknown);
    collectNestedUnknown(phrase.keyChanges, KEY_CHANGE_KEYS, `${phrasePath}/keyChanges`, unknown);
  });
  collectNestedUnknown(root.sectionBreaks, SECTION_BREAK_KEYS, "/sectionBreaks", unknown);
  collectNestedUnknown(root.customSections, CUSTOM_SECTION_KEYS, "/customSections", unknown);
  return unknown;
}

function collectNestedUnknown(
  value: unknown,
  knownKeys: ReadonlySet<string>,
  path: string,
  unknown: Record<string, unknown>
): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const record = asRecord(entry);
    if (record) collectUnknownRecord(record, knownKeys, `${path}/${index}`, unknown);
  });
}

function collectUnknownRecord(
  record: Record<string, unknown>,
  knownKeys: ReadonlySet<string>,
  path: string,
  unknown: Record<string, unknown>
): void {
  Object.keys(record)
    .filter((key) => !knownKeys.has(key))
    .sort(compareText)
    .forEach((key) => {
      unknown[`${path}/${escapeJsonPointer(key)}`] = cloneJsonData(record[key]);
    });
}

function buildPreservationEntries(
  root: Record<string, unknown>,
  unknownFields: Record<string, unknown>,
  undefinedObjectPropertyPaths: readonly string[]
): PreservationEntry[] {
  const entries: PreservationEntry[] = [
    {
      path: "",
      disposition: "preserved",
      targetPath: `/extensions/${escapeJsonPointer(LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY)}/sourceSnapshot`,
      code: "MIGRATION_SOURCE_SNAPSHOT_PRESERVED",
      message: "The JSON-safe source projection was copied into the extension bag."
    },
    {
      path: "/metadata",
      disposition: "preserved",
      targetPath: "/metadata",
      code: "MIGRATION_METADATA_MAPPED",
      message: "Title, credits, tags, key/meter text, and expression were mapped."
    },
    {
      path: "/phrases",
      disposition: "preserved",
      targetPath: "/lesson/phrases",
      code: "MIGRATION_LESSON_PROJECTION_PRESERVED",
      message: "All phrase data was retained as a legacy lesson projection, not score truth."
    },
    {
      path: "/sectionBreaks",
      disposition: "preserved",
      targetPath: "/lesson/sectionBreaks",
      code: "MIGRATION_SECTION_BREAKS_PRESERVED",
      message: "Section breaks were copied without interpretation."
    },
    {
      path: "/customSections",
      disposition: "preserved",
      targetPath: "/lesson/customSections",
      code: "MIGRATION_CUSTOM_SECTIONS_PRESERVED",
      message: "Custom sections were copied without interpretation."
    }
  ];

  (root.phrases as Record<string, unknown>[]).forEach((phrase, index) => {
    if (phrase.frame !== undefined) {
      entries.push({
        path: `/phrases/${index}/frame`,
        disposition: "preserved",
        targetPath: `/lesson/phrases/${index}/legacyProjection/frame`,
        code: "MIGRATION_LEGACY_FRAME_PRESERVED_AS_PROJECTION",
        message: "The complete frame subtree, including unknown nested fields, was retained as a projection only."
      });
    }
  });

  Object.keys(unknownFields).sort(compareText).forEach((path) => {
    entries.push({
      path,
      disposition: "preserved",
      targetPath: `/extensions/${escapeJsonPointer(LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY)}/unknownFields/${escapeJsonPointer(path)}`,
      code: "MIGRATION_UNKNOWN_FIELD_PRESERVED",
      message: "The unknown field was retained verbatim in the extension bag."
    });
  });
  undefinedObjectPropertyPaths.forEach((path) => {
    entries.push({
      path,
      disposition: "approximated",
      targetPath: `/extensions/${escapeJsonPointer(LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY)}/undefinedObjectPropertyPaths`,
      code: "MIGRATION_UNDEFINED_OBJECT_PROPERTY_NORMALIZED",
      message: "An own object property with value undefined was normalized to absence and its source path was retained."
    });
  });
  return entries;
}

function createPreservationReport(
  sourceFingerprint: string,
  entries: PreservationEntry[],
  minimumStatus?: PreservationReport["status"],
  sourceVersion: number | string | null = 3
): PreservationReport {
  const counts = entries.reduce<PreservationCounts>((result, entry) => {
    result[entry.disposition] += 1;
    return result;
  }, { preserved: 0, approximated: 0, unsupported: 0, missing: 0 });
  const inferredStatus = counts.unsupported > 0 || counts.missing > 0 || counts.approximated > 0
    ? "partial"
    : "complete";
  return {
    status: minimumStatus === "failed" ? "failed" : inferredStatus,
    sourceFormat: "music-teach/teaching-project",
    sourceVersion,
    sourceFingerprint,
    adapterId: TEACHING_PROJECT_V3_ADAPTER_ID,
    adapterVersion: TEACHING_PROJECT_V3_ADAPTER_VERSION,
    adapterFingerprint: TEACHING_PROJECT_V3_ADAPTER_FINGERPRINT,
    entries,
    counts
  };
}

function failedCandidate(
  sourceFingerprint: string,
  sourceVersion: number | string | null,
  ...diagnostics: ProjectDiagnostic[]
): MigrationCandidate<MusicProjectV1> {
  const entries = diagnostics.map((entry): PreservationEntry => ({
    path: entry.path ?? "",
    disposition: entry.code.includes("UNSUPPORTED") ? "unsupported" : "missing",
    code: entry.code,
    message: entry.message
  }));
  return {
    candidate: null,
    sourceFingerprint,
    preservation: createPreservationReport(
      sourceFingerprint,
      entries,
      "failed",
      sourceVersion
    ),
    diagnostics,
    lifecycle: {
      state: "candidate",
      requiresExplicitCommit: true,
      overwriteAllowed: false,
      commitEligibility: "blocked",
      blockingDiagnosticIds: diagnostics.map((entry) => entry.id)
    }
  };
}

function diagnostic(
  existing: readonly ProjectDiagnostic[],
  severity: ProjectDiagnosticSeverity,
  code: string,
  message: string,
  path: string
): ProjectDiagnostic {
  return {
    id: `migration-${existing.length + 1}-${code.toLowerCase()}`,
    severity,
    source: "migration",
    code,
    message,
    path
  };
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  parentPath: string,
  diagnostics: ProjectDiagnostic[]
): boolean {
  if (typeof record[key] === "string") return true;
  diagnostics.push(diagnostic(
    diagnostics,
    "error",
    "MIGRATION_REQUIRED_STRING_MISSING",
    `${key} must be a string.`,
    `${parentPath}/${escapeJsonPointer(key)}`
  ));
  return false;
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  parentPath: string,
  diagnostics: ProjectDiagnostic[]
): boolean {
  if (typeof record[key] === "boolean") return true;
  diagnostics.push(diagnostic(
    diagnostics,
    "error",
    "MIGRATION_REQUIRED_BOOLEAN_MISSING",
    `${key} must be a boolean.`,
    `${parentPath}/${escapeJsonPointer(key)}`
  ));
  return false;
}

function requireArray(
  record: Record<string, unknown>,
  key: string,
  parentPath: string,
  diagnostics: ProjectDiagnostic[]
): boolean {
  if (Array.isArray(record[key])) return true;
  diagnostics.push(diagnostic(
    diagnostics,
    "error",
    "MIGRATION_REQUIRED_ARRAY_MISSING",
    `${key} must be an array.`,
    `${parentPath}/${escapeJsonPointer(key)}`
  ));
  return false;
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
  parentPath: string,
  diagnostics: ProjectDiagnostic[]
): boolean {
  const value = record[key];
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return true;
  }
  diagnostics.push(diagnostic(
    diagnostics,
    "error",
    "MIGRATION_REQUIRED_STRING_ARRAY_MISSING",
    `${key} must be an array of strings.`,
    `${parentPath}/${escapeJsonPointer(key)}`
  ));
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string {
  return record[key] as string;
}

function cloneJsonData<T>(value: T): T {
  const problems: { path: string; message: string }[] = [];
  collectJsonSafetyProblems(
    value,
    "",
    new Set<object>(),
    problems,
    false,
    false,
    []
  );
  if (problems.length > 0) {
    const first = problems[0]!;
    throw new JsonDataSafetyError(
      first.path,
      `Value is not JSON-safe at ${first.path || "/"}: ${first.message}`
    );
  }
  return cloneJsonDataValue(value, false) as T;
}

function prepareLegacyJsonData<T>(value: T): {
  fingerprintValue: T;
  jsonValue: T;
  undefinedObjectPropertyPaths: string[];
} {
  const problems: { path: string; message: string }[] = [];
  const undefinedObjectPropertyPaths: string[] = [];
  collectJsonSafetyProblems(
    value,
    "",
    new Set<object>(),
    problems,
    true,
    false,
    undefinedObjectPropertyPaths
  );
  if (problems.length > 0) {
    const first = problems[0]!;
    throw new JsonDataSafetyError(
      first.path,
      `Value is not JSON-safe at ${first.path || "/"}: ${first.message}`
    );
  }
  return {
    fingerprintValue: cloneJsonDataValue(value, false) as T,
    jsonValue: cloneJsonDataValue(value, true) as T,
    undefinedObjectPropertyPaths: undefinedObjectPropertyPaths.sort(compareText)
  };
}

function cloneStrictJsonData<T>(value: T): T {
  return cloneJsonData(value);
}

function cloneScoreSnapshotData<T>(value: T): T {
  return cloneJsonDataValue(value, true) as T;
}

function cloneJsonDataValue(
  value: unknown,
  omitUndefinedObjectProperties: boolean
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Array.prototype.map.call(
      value,
      (entry: unknown) => cloneJsonDataValue(entry, omitUndefinedObjectProperties)
    ) as unknown[];
  }

  const clone: Record<string, unknown> = {};
  for (const [key, entryValue] of ownStringDataEntries(value)) {
    if (omitUndefinedObjectProperties && entryValue === undefined) continue;
    Object.defineProperty(clone, key, {
      value: cloneJsonDataValue(entryValue, omitUndefinedObjectProperties),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return clone;
}

function assertScoreSnapshotJsonSafe(value: unknown): void {
  const problems: { path: string; message: string }[] = [];
  collectScoreSnapshotProblems(value, "", new Set<object>(), false, problems);
  if (problems.length > 0) {
    throw new TypeError(
      `ScoreIR snapshot is not JSON-safe at ${problems[0]?.path || "/"}: ${problems[0]?.message}`
    );
  }
}

function assertNoLossyArrayShapes(value: unknown): void {
  const problems: { path: string; message: string }[] = [];
  collectLossyArrayShapeProblems(value, "", new Set<object>(), problems);
  if (problems.length > 0) {
    throw new TypeError(
      `ScoreIR snapshot is not JSON-safe at ${problems[0]?.path || "/"}: ${problems[0]?.message}`
    );
  }
}

function collectLossyArrayShapeProblems(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  problems: { path: string; message: string }[]
): void {
  if (value === null || typeof value !== "object" || ancestors.has(value)) return;
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      problems.push({
        path,
        message: "Only unmodified native arrays can be preserved in a ScoreIR snapshot."
      });
      ancestors.delete(value);
      return;
    }
    collectUnsupportedOwnProperties(value, path, true, problems);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) {
        problems.push({
          path: `${path}/${index}`,
          message: "Sparse array holes would become null during JSON serialization."
        });
        continue;
      }
      if (!("value" in descriptor)) continue;
      collectLossyArrayShapeProblems(
        descriptor.value,
        `${path}/${index}`,
        ancestors,
        problems
      );
    }
  } else if (value instanceof Map) {
    const ownKeys = Reflect.ownKeys(value);
    if (Object.getPrototypeOf(value) !== Map.prototype) {
      problems.push({
        path,
        message: "Only an unmodified native Map is accepted for VoiceIR anchors."
      });
      ancestors.delete(value);
      return;
    }
    for (const key of ownKeys) {
      problems.push({
        path: `${path}/${typeof key === "symbol" ? `<symbol:${String(key.description ?? "")}>` : escapeJsonPointer(key)}`,
        message: "Custom Map properties cannot be preserved during ScoreIR normalization."
      });
    }
    if (ownKeys.length > 0) {
      ancestors.delete(value);
      return;
    }
    for (const [key, entry] of Map.prototype.entries.call(value) as MapIterator<[unknown, unknown]>) {
      collectLossyArrayShapeProblems(key, `${path}/<map-key>`, ancestors, problems);
      collectLossyArrayShapeProblems(entry, `${path}/<map-value>`, ancestors, problems);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      problems.push({
        path,
        message: "Only plain objects and the VoiceIR anchor Map can be normalized."
      });
      ancestors.delete(value);
      return;
    }
    collectUnsupportedOwnProperties(value, path, false, problems);
    for (const [key, entryValue] of ownStringDataEntries(value)) {
      collectLossyArrayShapeProblems(
        entryValue,
        `${path}/${escapeJsonPointer(key)}`,
        ancestors,
        problems
      );
    }
  }
  ancestors.delete(value);
}

function collectScoreSnapshotProblems(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  optionalObjectProperty: boolean,
  problems: { path: string; message: string }[]
): void {
  if (value === undefined && optionalObjectProperty) return;
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Object.is(value, -0)) {
      problems.push({
        path,
        message: "Negative zero would be normalized to zero by JSON serialization."
      });
    } else if (!Number.isFinite(value)) {
      problems.push({ path, message: "Non-finite numbers would be changed by JSON serialization." });
    }
    return;
  }
  if (typeof value !== "object") {
    problems.push({ path, message: `${typeof value} values cannot be preserved in a score snapshot.` });
    return;
  }
  if (ancestors.has(value)) {
    problems.push({ path, message: "Cyclic values cannot be preserved in a score snapshot." });
    return;
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      problems.push({ path, message: "Only plain objects are allowed after Map normalization." });
      return;
    }
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const key of nonIndexArrayKeys(value)) {
      problems.push({
        path: `${path}/${escapeJsonPointer(key)}`,
        message: "Named array properties would be lost during JSON serialization."
      });
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        problems.push({
          path: `${path}/${index}`,
          message: "Sparse array holes would become null during JSON serialization."
        });
        continue;
      }
      collectScoreSnapshotProblems(
        value[index],
        `${path}/${index}`,
        ancestors,
        false,
        problems
      );
    }
  } else {
    const record = value as Record<string, unknown>;
    Object.keys(record).sort(compareText).forEach((key) =>
      collectScoreSnapshotProblems(
        record[key],
        `${path}/${escapeJsonPointer(key)}`,
        ancestors,
        true,
        problems
      )
    );
  }
  ancestors.delete(value);
}

function sourceVersionOf(value: unknown): number | string | null {
  const record = asRecord(value);
  const version = record?.formatVersion;
  return typeof version === "number" || typeof version === "string"
    ? version
    : null;
}

function nonIndexArrayKeys(value: readonly unknown[]): string[] {
  return Object.getOwnPropertyNames(value).filter(
    (key) => key !== "length" && !isArrayIndexKey(key, value.length)
  );
}

function isArrayIndexKey(key: string, length: number): boolean {
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

function deterministicId(prefix: string, fingerprint: string): string {
  return `${prefix}-${shortFingerprint(fingerprint)}`;
}

function shortFingerprint(fingerprint: string): string {
  const separator = fingerprint.lastIndexOf(":");
  return (separator >= 0 ? fingerprint.slice(separator + 1) : fingerprint).slice(0, 16);
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
