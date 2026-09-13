import type { ScoreIR } from "../../ir/score";
import { createDeterministicFingerprint } from "./fingerprint";
import {
  adaptTeachingProjectV3,
  LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY
} from "./teachingProjectV3Adapter";
import {
  assertRepositoryProject,
  cloneRepositoryJson,
  RepositoryValidationError
} from "./repositoryValidation";
import type {
  LegacyMigrationPreview,
  LegacyMigrationPreviewResult,
  NeoProjectRecord,
  ProjectReadResult,
  ProjectRepository,
  ProjectRepositoryLock,
  ProjectRepositoryStorage,
  ProjectWriteResult,
  RepositoryInvalid,
  RepositoryStorageError
} from "./ProjectRepository";
import type { MusicProjectV1, TeachingProjectV3AdapterOptions } from "./types";

export const NEO_PROJECT_STORAGE_PREFIX = "music-teach:neo:project:v1:";

export function neoProjectStorageKey(id: string): string {
  requireValue(typeof id === "string" && id.trim().length > 0, "/id", "A project ID is required.");
  return `${NEO_PROJECT_STORAGE_PREFIX}${encodeURIComponent(id)}`;
}

export interface LocalStorageProjectRepositoryOptions {
  storage?: ProjectRepositoryStorage;
  /** Omit to use navigator.locks; null explicitly disables writes. */
  lock?: ProjectRepositoryLock | null;
}

/** No module-level storage access, automatic migration, index or mutable cache. */
export class LocalStorageProjectRepository implements ProjectRepository {
  private readonly storagePort: ProjectRepositoryStorage | undefined;
  private readonly lockPort: ProjectRepositoryLock | null | undefined;

  constructor(options: LocalStorageProjectRepositoryOptions = {}) {
    this.storagePort = options.storage;
    this.lockPort = options.lock;
  }

  async get(id: string): Promise<ProjectReadResult> {
    let key: string;
    try { key = neoProjectStorageKey(id); } catch (error) { return invalid(error); }
    const access = this.storage();
    if (access.status !== "ready") return access;
    return readRecord(access.storage, key, id);
  }

  async prepareLegacyMigration(
    sourceKey: string,
    options: Readonly<TeachingProjectV3AdapterOptions> = {}
  ): Promise<LegacyMigrationPreviewResult> {
    try { assertLegacyKey(sourceKey); } catch (error) { return invalid(error); }
    const access = this.storage();
    if (access.status !== "ready") return access;
    const storage = access.storage;
    let sourceText: string | null;
    try { sourceText = storage.getItem(sourceKey); }
    catch (error) { return storageError("read-failed", error); }
    if (sourceText === null) return { status: "missing-source", sourceKey };
    try {
      // The pure adapter snapshots source/options synchronously before any await.
      const migration = adaptTeachingProjectV3(JSON.parse(sourceText), options);
      return { status: "preview", preview: cloneRepositoryJson({ sourceKey, sourceText, migration }) };
    } catch (error) { return invalid(error); }
  }

  async commitMigration(preview: LegacyMigrationPreview): Promise<ProjectWriteResult> {
    let snapshot: LegacyMigrationPreview;
    let project: MusicProjectV1;
    let key: string;
    try {
      snapshot = cloneRepositoryJson(preview);
      project = validatePreview(snapshot);
      key = neoProjectStorageKey(project.id);
    } catch (error) { return invalid(error); }
    const access = this.storage();
    if (access.status !== "ready") return access;
    const storage = access.storage;

    return this.exclusive(key, () => {
      const current = readRecord(storage, key, project.id);
      if (current.status === "found") return {
        status: "conflict", projectId: project.id,
        expectedRevision: null, actualRevision: current.record.project.revision
      };
      if (current.status !== "missing") return current;
      try {
        if (storage.getItem(snapshot.sourceKey) !== snapshot.sourceText) {
          return { status: "source-changed", sourceKey: snapshot.sourceKey };
        }
      } catch (error) { return storageError("read-failed", error); }

      const committed = advanceRevision(project, 1);
      return writeRecord(storage, key, {
        schema: "music-teach/neo-project-record",
        version: 1,
        project: committed,
        migration: {
          sourceKey: snapshot.sourceKey,
          sourceText: snapshot.sourceText,
          sourceFingerprint: snapshot.migration.sourceFingerprint,
          candidateFingerprint: project.revisionFingerprint,
          preservation: snapshot.migration.preservation
        },
        recordFingerprint: ""
      });
    });
  }

  async save(project: MusicProjectV1, expectedRevision: number): Promise<ProjectWriteResult> {
    let snapshot: MusicProjectV1;
    let key: string;
    try {
      // Capture NOW, not when a contended asynchronous lock eventually runs.
      snapshot = cloneRepositoryJson(project);
      assertRepositoryProject(snapshot);
      requireValue(Number.isSafeInteger(expectedRevision) && expectedRevision >= 1,
        "/expectedRevision", "Expected revision must be a positive safe integer.");
      requireValue(snapshot.revision === expectedRevision, "/revision", "Input revision must equal expectedRevision.");
      key = neoProjectStorageKey(snapshot.id);
    } catch (error) { return invalid(error); }
    const access = this.storage();
    if (access.status !== "ready") return access;
    const storage = access.storage;

    return this.exclusive(key, () => {
      const current = readRecord(storage, key, snapshot.id);
      if (current.status !== "found") return current;
      const previous = current.record.project;
      if (previous.revision !== expectedRevision) return {
        status: "conflict", projectId: snapshot.id,
        expectedRevision, actualRevision: previous.revision
      };
      try {
        requireValue(expectedRevision < Number.MAX_SAFE_INTEGER, "/revision", "Revision limit reached.");
        requireValue(snapshot.score.snapshotFingerprint === previous.score.snapshotFingerprint
          || snapshot.score.revision !== previous.score.revision,
        "/score/revision", "A changed canonical score requires a new score revision.");
        requireValue(equal(snapshot.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY],
          previous.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY]),
        "/extensions", "The original migration source snapshot is immutable.");
        for (const provenance of previous.provenance.filter((entry) => entry.kind === "migration")) {
          requireValue(equal(snapshot.provenance.find((entry) => entry.id === provenance.id), provenance),
            "/provenance", "Original migration provenance must be retained unchanged.");
        }
        return writeRecord(storage, key, {
          ...current.record,
          project: advanceRevision(snapshot, expectedRevision + 1)
        });
      } catch (error) { return invalid(error); }
    });
  }

  private storage(): { status: "ready"; storage: ProjectRepositoryStorage } | RepositoryStorageError {
    try {
      const storage = this.storagePort ?? globalThis.localStorage;
      if (!storage) return storageError("storage-unavailable", "Local storage is unavailable.");
      return { status: "ready", storage };
    } catch (error) { return storageError("storage-unavailable", error); }
  }

  private async exclusive(key: string, operation: () => ProjectWriteResult): Promise<ProjectWriteResult> {
    try {
      if (this.lockPort) return await this.lockPort.runExclusive(key, operation);
      if (this.lockPort === null || !globalThis.navigator?.locks) {
        return storageError("lock-unavailable", "Shared exclusive locks are required for writes.");
      }
      return await globalThis.navigator.locks.request(key, { mode: "exclusive" }, operation);
    } catch (error) { return storageError("lock-failed", error); }
  }
}

function validatePreview(preview: LegacyMigrationPreview): MusicProjectV1 {
  requireValue(isRecord(preview), "", "A migration preview is required.");
  assertLegacyKey(preview.sourceKey);
  requireValue(typeof preview.sourceText === "string", "/sourceText", "Original source text is required.");
  const migration = preview.migration;
  requireValue(isRecord(migration) && isRecord(migration.lifecycle), "/migration", "Migration metadata is required.");
  requireValue(migration.lifecycle.commitEligibility === "eligible", "/migration/lifecycle", "Migration is blocked.");
  const project = migration.candidate;
  assertRepositoryProject(project);
  requireValue(project.revision === 0, "/migration/candidate/revision", "Only an uncommitted candidate can be created.");
  requireValue(project.revisionFingerprint === projectFingerprint(project),
    "/migration/candidate/revisionFingerprint", "Candidate fingerprint does not match.");
  const source = JSON.parse(preview.sourceText) as unknown;
  requireValue(isRecord(source) && project.id !== source.id, "/migration/candidate/id", "Migration must use a new project ID.");
  // Rebuild from the reviewed raw source and verified ScoreIR, never legacy frames.
  // Comparing the ENTIRE result checks report, diagnostics, lifecycle and provenance.
  const scoreValue = project.score.snapshot!.value;
  const score: ScoreIR = {
    ...scoreValue,
    voices: scoreValue.voices.map((voice) => ({ ...voice, anchors: new Map(voice.anchors) }))
  };
  const expected = adaptTeachingProjectV3(source, {
    canonicalScore: {
      snapshot: score,
      revision: project.score.revision,
      verified: true,
      source: project.score.source
    }
  });
  requireValue(equal(expected, migration), "/migration", "Candidate, source, provenance or preservation report changed after preview.");
  return project;
}

function readRecord(storage: ProjectRepositoryStorage, key: string, id: string): ProjectReadResult {
  let raw: string | null;
  try { raw = storage.getItem(key); }
  catch (error) { return storageError("read-failed", error); }
  if (raw === null) return { status: "missing", projectId: id };
  try {
    const record: unknown = cloneRepositoryJson(JSON.parse(raw));
    requireValue(isRecord(record) && record.schema === "music-teach/neo-project-record" && record.version === 1,
      "", "Unknown Neo record schema.");
    const stored = record as unknown as NeoProjectRecord;
    assertRepositoryProject(stored.project);
    requireValue(stored.project.id === id && stored.project.revision >= 1, "/project", "Record identity or revision is invalid.");
    requireValue(stored.project.revisionFingerprint === projectFingerprint(stored.project), "/project/revisionFingerprint", "Project fingerprint mismatch.");
    assertMigrationReceipt(stored);
    requireValue(stored.recordFingerprint === recordFingerprint(stored), "/recordFingerprint", "Record fingerprint mismatch.");
    return { status: "found", record: stored };
  } catch (error) {
    return { status: "corrupt", projectId: id, message: messageOf(error) };
  }
}

function assertMigrationReceipt(record: NeoProjectRecord): void {
  const receipt = record.migration;
  requireValue(isRecord(receipt) && typeof receipt.sourceText === "string"
    && nonempty(receipt.sourceFingerprint) && nonempty(receipt.candidateFingerprint),
  "/migration", "Migration receipt is missing or malformed.");
  assertLegacyKey(receipt.sourceKey);
  const report = receipt.preservation;
  requireValue(isRecord(report) && ["complete", "partial"].includes(report.status)
    && report.sourceFormat === "music-teach/teaching-project" && report.sourceVersion === 3
    && report.sourceFingerprint === receipt.sourceFingerprint
    && nonempty(report.adapterId) && nonempty(report.adapterVersion) && nonempty(report.adapterFingerprint)
    && Array.isArray(report.entries) && isRecord(report.counts),
  "/migration/preservation", "A valid, source-bound preservation report is required.");
  const counts = { preserved: 0, approximated: 0, unsupported: 0, missing: 0 };
  for (const entry of report.entries) {
    requireValue(isRecord(entry) && typeof entry.path === "string"
      && typeof entry.disposition === "string" && Object.hasOwn(counts, entry.disposition)
      && nonempty(entry.code) && typeof entry.message === "string"
      && (!Object.hasOwn(entry, "targetPath") || typeof entry.targetPath === "string"),
    "/migration/preservation/entries", "Invalid preservation entry.");
    counts[entry.disposition] += 1;
  }
  for (const disposition of Object.keys(counts) as (keyof typeof counts)[]) {
    requireValue(report.counts[disposition] === counts[disposition],
      "/migration/preservation/counts", "Preservation counts do not match the entries.");
  }
  const source: unknown = cloneRepositoryJson(JSON.parse(receipt.sourceText));
  requireValue(isRecord(source) && createDeterministicFingerprint(source) === receipt.sourceFingerprint,
    "/migration/sourceText", "Original source fingerprint does not match.");
  const extension = record.project.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY];
  requireValue(isRecord(extension) && equal(extension.sourceSnapshot, source)
    && extension.sourceFingerprint === receipt.sourceFingerprint,
  "/project/extensions", "Original source snapshot does not match the receipt.");
  requireValue(record.project.provenance.some((entry) => entry.kind === "migration"
    && entry.sourceFingerprint === receipt.sourceFingerprint && entry.sourceProjectId === source.id
    && entry.sourceFormat === report.sourceFormat && entry.sourceVersion === report.sourceVersion
    && entry.adapterId === report.adapterId && entry.adapterVersion === report.adapterVersion
    && entry.adapterFingerprint === report.adapterFingerprint
    && entry.sourceSnapshotExtensionKey === LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY),
  "/project/provenance", "Original migration provenance is missing or inconsistent.");
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function writeRecord(storage: ProjectRepositoryStorage, key: string, input: NeoProjectRecord): ProjectWriteResult {
  let serialized: string;
  let result: NeoProjectRecord;
  try {
    input.recordFingerprint = recordFingerprint(input);
    serialized = JSON.stringify(input);
    // Prepare every fallible result before the single atomic write.
    result = cloneRepositoryJson(JSON.parse(serialized) as NeoProjectRecord);
  } catch (error) { return invalid(error); }
  try { storage.setItem(key, serialized); }
  catch (error) {
    return storageError(error instanceof Error && error.name === "QuotaExceededError" ? "quota-exceeded" : "write-failed", error);
  }
  return { status: "saved", record: result };
}

function advanceRevision(project: MusicProjectV1, revision: number): MusicProjectV1 {
  const next = { ...project, revision };
  next.revisionFingerprint = projectFingerprint(next);
  return next;
}

function projectFingerprint(project: MusicProjectV1): string {
  const { revisionFingerprint: _fingerprint, ...value } = project;
  return createDeterministicFingerprint(value);
}

function recordFingerprint(record: NeoProjectRecord): string {
  const { recordFingerprint: _fingerprint, ...value } = record;
  return createDeterministicFingerprint(value);
}

function equal(left: unknown, right: unknown): boolean {
  return createDeterministicFingerprint(left) === createDeterministicFingerprint(right);
}

function assertLegacyKey(key: string): void {
  requireValue(typeof key === "string" && (key === "jpw-teaching-project:draft"
    || (key.startsWith("music-teach:project:v1:") && key.length > "music-teach:project:v1:".length)),
  "/sourceKey", "Expected a legacy draft or teaching-project storage key.");
}

function requireValue(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) throw new RepositoryValidationError(path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(error: unknown): RepositoryInvalid {
  return {
    status: "invalid", code: "invalid-project-data", message: messageOf(error),
    path: error instanceof RepositoryValidationError ? error.path : ""
  };
}

function storageError(code: RepositoryStorageError["code"], error: unknown): RepositoryStorageError {
  return { status: "storage-error", code, message: messageOf(error) };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Repository operation failed.";
}
