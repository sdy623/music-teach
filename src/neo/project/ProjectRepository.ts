import type {
  MigrationCandidate,
  MusicProjectV1,
  PreservationReport,
  TeachingProjectV3AdapterOptions
} from "./types";

/** Implementations must make each setItem atomic, including failure (like Storage). */
export interface ProjectRepositoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Shared by ALL writers to the same storage, including other browser contexts. */
export interface ProjectRepositoryLock {
  runExclusive<T>(name: string, operation: () => T): Promise<T>;
}

export interface LegacyMigrationPreview {
  sourceKey: string;
  /** Exact reviewed text, including whitespace and unknown fields. */
  sourceText: string;
  migration: MigrationCandidate<MusicProjectV1>;
}

export interface LegacyMigrationReceipt {
  sourceKey: string;
  sourceText: string;
  sourceFingerprint: string;
  candidateFingerprint: string;
  preservation: PreservationReport;
}

export interface NeoProjectRecord {
  schema: "music-teach/neo-project-record";
  version: 1;
  project: MusicProjectV1;
  migration: LegacyMigrationReceipt;
  /** Deterministic corruption check, not a cryptographic signature. */
  recordFingerprint: string;
}

export type RepositoryInvalid = {
  status: "invalid";
  code: string;
  message: string;
  path: string;
};

export type RepositoryStorageError = {
  status: "storage-error";
  code: "storage-unavailable" | "read-failed" | "write-failed" | "quota-exceeded"
    | "lock-unavailable" | "lock-failed";
  message: string;
};

export type RepositoryCorrupt = {
  status: "corrupt";
  projectId: string;
  message: string;
};

export type ProjectReadResult =
  | { status: "found"; record: NeoProjectRecord }
  | { status: "missing"; projectId: string }
  | RepositoryInvalid | RepositoryCorrupt | RepositoryStorageError;

export type ProjectWriteResult =
  | { status: "saved"; record: NeoProjectRecord }
  | { status: "conflict"; projectId: string; expectedRevision: number | null; actualRevision: number }
  | { status: "source-changed"; sourceKey: string }
  | { status: "missing"; projectId: string }
  | RepositoryInvalid | RepositoryCorrupt | RepositoryStorageError;

export type LegacyMigrationPreviewResult =
  | { status: "preview"; preview: LegacyMigrationPreview }
  | { status: "missing-source"; sourceKey: string }
  | RepositoryInvalid | RepositoryStorageError;

/** M1 deliberately excludes the M2 library, draft/session and checkpoint APIs. */
export interface ProjectRepository {
  get(id: string): Promise<ProjectReadResult>;
  /** Snapshot is captured at call time; only a successful save advances revision. */
  save(project: MusicProjectV1, expectedRevision: number): Promise<ProjectWriteResult>;
  /** Read-only. Even blocked migration candidates may be inspected. */
  prepareLegacyMigration(
    sourceKey: string,
    options?: Readonly<TeachingProjectV3AdapterOptions>
  ): Promise<LegacyMigrationPreviewResult>;
  /** Explicit create-only commit. Duplicate IDs conflict; legacy keys never change. */
  commitMigration(preview: LegacyMigrationPreview): Promise<ProjectWriteResult>;
}
