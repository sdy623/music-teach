import type { ScoreIR } from "../../ir/score";
import type { VoiceIR } from "../../ir/voice";

export type ProjectDiagnosticSeverity = "info" | "warning" | "error";

export type ProjectDiagnosticSource =
  | "decode"
  | "parser"
  | "semantic"
  | "layout"
  | "renderer"
  | "import"
  | "migration"
  | "storage"
  | "playback";

export interface ProjectDiagnostic {
  id: string;
  severity: ProjectDiagnosticSeverity;
  source: ProjectDiagnosticSource;
  code: string;
  message: string;
  path?: string;
  sourceRange?: { start: number; end: number };
  actionId?: string;
  extensions?: Record<string, unknown>;
}

export interface ProjectMetadata {
  title: string;
  tags: string[];
  artist: string;
  lyricist: string;
  composer: string;
  arranger: string;
  otherCredits: string;
  keyAndMeters: string;
  expression: string;
  extensions: Record<string, unknown>;
}

export type CanonicalScoreSourceKind =
  | "embedded-score-ir"
  | "external-score-ir"
  | "legacy-unresolved";

export interface CanonicalScoreSourceReference {
  kind: CanonicalScoreSourceKind;
  id: string;
  revision: string;
  fingerprint: string;
  extensions: Record<string, unknown>;
}

export interface SerializableVoiceIR extends Omit<VoiceIR, "anchors"> {
  /** Sorted entries replace the runtime Map so the project stays JSON-safe. */
  anchors: [string, string][];
}

export interface SerializableScoreIR extends Omit<ScoreIR, "voices"> {
  voices: SerializableVoiceIR[];
}

export interface ScoreIRSnapshotV1 {
  schema: "music-teach/score-ir-snapshot";
  version: 1;
  value: SerializableScoreIR;
}

/**
 * The only field allowed to carry notation facts is `snapshot`.
 * Legacy phrase frames may be preserved as lesson projections, but they must
 * never be promoted into this document without an explicit ScoreIR adapter.
 */
export interface CanonicalScoreDocument {
  authority: "score-ir";
  availability: "available" | "unavailable";
  revision: string;
  source: CanonicalScoreSourceReference;
  snapshot: ScoreIRSnapshotV1 | null;
  snapshotFingerprint: string | null;
  extensions: Record<string, unknown>;
}

export interface ProjectLyricLayerDocument {
  id: string;
  kind: "legacy-source-lyrics" | "legacy-phrase-lyrics" | string;
  language: string | null;
  track: number | null;
  text: string;
  sourcePhraseId: string | null;
  anchorStatus: "unresolved" | "anchored";
  cells: unknown[];
  extensions: Record<string, unknown>;
}

export interface LegacyLessonPhraseDocument {
  id: string;
  sourcePhraseId: string;
  kind: "vocal" | "instrumental" | "blank";
  lyricText: string;
  referenceReading: string;
  annotation: string;
  showMetronome: boolean;
  skipDuringPlayback: boolean;
  /** Verbatim legacy projection. It is not a second notation authority. */
  legacyProjection: Record<string, unknown>;
  extensions: Record<string, unknown>;
}

export interface LessonDocument {
  kind: "teaching-project-v3";
  sourceProjectId: string;
  sourceLyrics: string;
  phrases: LegacyLessonPhraseDocument[];
  sectionBreaks: unknown[];
  customSections: unknown[];
  extensions: Record<string, unknown>;
}

export interface TimelineDocument {
  status: "unresolved" | "available";
  clock: "score" | "media" | null;
  events: unknown[];
  extensions: Record<string, unknown>;
}

export interface ProjectAssetRef {
  id: string;
  kind: string;
  fingerprint: string;
  mediaType: string | null;
  extensions: Record<string, unknown>;
}

export interface ProjectEvidenceDocument {
  id: string;
  kind: string;
  scoreRevision: string;
  status: "candidate" | "accepted" | "rejected" | "stale" | "invalid";
  sourceFingerprint: string;
  payload: unknown;
  provenanceIds: string[];
  extensions: Record<string, unknown>;
}

export interface ProjectProposalDocument {
  id: string;
  kind: string;
  scoreRevision: string;
  status: "proposed" | "accepted" | "rejected" | "stale" | "invalid";
  inputFingerprint: string;
  provider: { id: string; version: string } | null;
  payload: unknown;
  provenanceIds: string[];
  extensions: Record<string, unknown>;
}

export interface ImportProvenance {
  id: string;
  kind: "migration" | "import" | string;
  sourceFormat: string;
  sourceVersion: number | string | null;
  sourceProjectId: string | null;
  sourceFingerprint: string;
  adapterId: string;
  adapterVersion: string;
  adapterFingerprint: string;
  /** Null means the adapter deliberately did not invent a wall-clock time. */
  observedAt: string | null;
  sourceSnapshotExtensionKey: string | null;
  extensions: Record<string, unknown>;
}

export interface MusicProjectV1 {
  schema: "music-teach/project";
  version: 1;
  id: string;
  revision: number;
  revisionFingerprint: string;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: ProjectMetadata;
  score: CanonicalScoreDocument;
  lyricLayers: ProjectLyricLayerDocument[];
  lesson: LessonDocument;
  timeline: TimelineDocument;
  assets: ProjectAssetRef[];
  evidence: ProjectEvidenceDocument[];
  proposals: ProjectProposalDocument[];
  provenance: ImportProvenance[];
  diagnostics: ProjectDiagnostic[];
  extensions: Record<string, unknown>;
}

export type PreservationDisposition =
  | "preserved"
  | "approximated"
  | "unsupported"
  | "missing";

export interface PreservationEntry {
  path: string;
  disposition: PreservationDisposition;
  targetPath?: string;
  code: string;
  message: string;
}

export interface PreservationCounts {
  preserved: number;
  approximated: number;
  unsupported: number;
  missing: number;
}

export interface PreservationReport {
  status: "complete" | "partial" | "failed";
  sourceFormat: string;
  sourceVersion: number | string | null;
  sourceFingerprint: string;
  adapterId: string;
  adapterVersion: string;
  adapterFingerprint: string;
  entries: PreservationEntry[];
  counts: PreservationCounts;
}

export interface MigrationCandidate<T> {
  candidate: T | null;
  sourceFingerprint: string;
  preservation: PreservationReport;
  diagnostics: ProjectDiagnostic[];
  lifecycle: {
    state: "candidate";
    requiresExplicitCommit: true;
    overwriteAllowed: false;
    commitEligibility: "eligible" | "blocked";
    blockingDiagnosticIds: string[];
  };
}

export interface TeachingProjectV3AdapterOptions {
  canonicalScore?: {
    snapshot: ScoreIR;
    revision: string;
    verified: true;
    source?: CanonicalScoreSourceReference;
  };
}
