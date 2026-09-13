import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalStorageProjectRepository,
  neoProjectStorageKey
} from "../../src/neo/project/LocalStorageProjectRepository";
import type {
  LegacyMigrationPreview,
  NeoProjectRecord,
  ProjectRepositoryLock
} from "../../src/neo/project/ProjectRepository";
import { createDeterministicFingerprint } from "../../src/neo/project/fingerprint";
import type { MusicProjectV1 } from "../../src/neo/project/types";
import { MemoryStorage, seedMigration, SharedTestLock } from "./repositoryTestSupport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function savedFixture() {
  const storage = new MemoryStorage();
  const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
  const preview = await seedMigration(repository, storage);
  const result = await repository.commitMigration(preview);
  if (result.status !== "saved") throw new Error(`Fixture commit failed: ${result.status}`);
  return {
    storage, repository, preview, record: result.record,
    key: neoProjectStorageKey(result.record.project.id)
  };
}

function candidate(preview: LegacyMigrationPreview): MusicProjectV1 {
  if (!preview.migration.candidate) throw new Error("Expected a non-null test candidate");
  return preview.migration.candidate;
}

// Corruption tests deliberately refresh outer checksums so the inner contract,
// rather than only a stale envelope checksum, is what rejects the record.
function reseal(record: NeoProjectRecord): string {
  const { revisionFingerprint: _projectFingerprint, ...projectValue } = record.project;
  record.project.revisionFingerprint = createDeterministicFingerprint(projectValue);
  const { recordFingerprint: _recordFingerprint, ...recordValue } = record;
  record.recordFingerprint = createDeterministicFingerprint(recordValue);
  return JSON.stringify(record);
}

describe("ProjectRepository missing and corrupt records", () => {
  it("returns missing for an absent record and never recreates it through save", async () => {
    const fixture = await savedFixture();
    fixture.storage.data.delete(fixture.key);
    const before = new Map(fixture.storage.data);

    expect(await fixture.repository.get(fixture.record.project.id)).toEqual({
      status: "missing", projectId: fixture.record.project.id
    });
    expect(await fixture.repository.save(fixture.record.project, 1)).toEqual({
      status: "missing", projectId: fixture.record.project.id
    });
    expect(fixture.storage.data).toEqual(before);
  });

  it.each(["malformed JSON", "unknown schema", "stale record fingerprint"])(
    "keeps a %s record untouched by read, save and migration commit", async (damage) => {
      const fixture = await savedFixture();
      let raw = "{not-json";
      if (damage !== "malformed JSON") {
        const broken = JSON.parse(fixture.storage.data.get(fixture.key)!) as NeoProjectRecord;
        if (damage === "unknown schema") {
          (broken as unknown as { schema: string }).schema = "unknown";
        } else {
          broken.recordFingerprint = "wrong";
        }
        raw = JSON.stringify(broken);
      }
      fixture.storage.data.set(fixture.key, raw);
      const before = new Map(fixture.storage.data);

      expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "corrupt" });
      expect(await fixture.repository.save(fixture.record.project, 1)).toMatchObject({ status: "corrupt" });
      expect(await fixture.repository.commitMigration(fixture.preview)).toMatchObject({ status: "corrupt" });
      expect(fixture.storage.data).toEqual(before);
    }
  );

  it("rejects a canonical snapshot checksum mismatch even with refreshed outer checksums", async () => {
    const fixture = await savedFixture();
    fixture.record.project.score.snapshotFingerprint = "incorrect-score-checksum";
    fixture.storage.data.set(fixture.key, reseal(fixture.record));
    const before = new Map(fixture.storage.data);

    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "corrupt" });
    expect(fixture.storage.data).toEqual(before);
  });

  it.each(["missing report", "wrong counts", "wrong source", "wrong provenance", "malformed disposition"])(
    "rejects a receipt with %s even when both outer fingerprints are refreshed", async (damage) => {
      const fixture = await savedFixture();
      if (damage === "missing report") fixture.record.migration.preservation = {} as NeoProjectRecord["migration"]["preservation"];
      if (damage === "wrong counts") fixture.record.migration.preservation.counts.preserved += 1;
      if (damage === "wrong source") fixture.record.migration.preservation.sourceFingerprint = "other-source";
      if (damage === "wrong provenance") fixture.record.project.provenance.length = 0;
      if (damage === "malformed disposition") {
        const entry = fixture.record.migration.preservation.entries[0] as unknown as Record<string, unknown>;
        entry.disposition = [entry.disposition];
      }
      fixture.storage.data.set(fixture.key, reseal(fixture.record));
      const before = new Map(fixture.storage.data);
      expect((await fixture.repository.get(fixture.record.project.id)).status).toBe("corrupt");
      expect((await fixture.repository.save(fixture.record.project, 1)).status).toBe("corrupt");
      expect(fixture.storage.data).toEqual(before);
    }
  );
});

describe("ProjectRepository reviewed migration boundary", () => {
  it.each(["candidate", "preservation", "provenance", "lifecycle"])(
    "rejects a changed %s after preview without touching either storage namespace", async (field) => {
      const storage = new MemoryStorage();
      const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
      const preview = await seedMigration(repository, storage);
      const before = new Map(storage.data);
      if (field === "candidate") candidate(preview).metadata.title = "Unreviewed title";
      if (field === "preservation") preview.migration.preservation.counts.preserved += 1;
      if (field === "provenance") candidate(preview).provenance[0]!.sourceFingerprint = "forged";
      if (field === "lifecycle") {
        (preview.migration.lifecycle as unknown as { overwriteAllowed: boolean }).overwriteAllowed = true;
      }

      expect(await repository.commitMigration(preview)).toMatchObject({ status: "invalid" });
      expect(storage.data).toEqual(before);
    }
  );

  it("does not trust eligible spoofing when the candidate has no canonical ScoreIR", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    const eligible = await seedMigration(repository, storage);
    const blocked = await repository.prepareLegacyMigration(eligible.sourceKey);
    if (blocked.status !== "preview") throw new Error("Expected blocked preview");
    expect(blocked.preview.migration.lifecycle.commitEligibility).toBe("blocked");
    blocked.preview.migration.lifecycle.commitEligibility = "eligible";
    const before = new Map(storage.data);

    expect(await repository.commitMigration(blocked.preview)).toMatchObject({ status: "invalid" });
    expect(storage.data).toEqual(before);
  });

  it("rejects changed reviewed sourceText rather than migrating a substituted source", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    const preview = await seedMigration(repository, storage);
    const replacement = JSON.parse(preview.sourceText) as Record<string, unknown>;
    replacement.futureTop = { substituted: true };
    preview.sourceText = JSON.stringify(replacement);
    const before = new Map(storage.data);

    expect(await repository.commitMigration(preview)).toMatchObject({ status: "invalid" });
    expect(storage.data).toEqual(before);
  });

  it.each(["changed bytes", "deleted source", "different legacy key"])(
    "returns source-changed for %s and preserves all remaining bytes", async (change) => {
      const storage = new MemoryStorage();
      const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
      const preview = await seedMigration(repository, storage);
      if (change === "changed bytes") storage.data.set(preview.sourceKey, `${preview.sourceText}\n`);
      if (change === "deleted source") storage.data.delete(preview.sourceKey);
      if (change === "different legacy key") preview.sourceKey = "music-teach:project:v1:other-source";
      const before = new Map(storage.data);

      expect(await repository.commitMigration(preview)).toEqual({
        status: "source-changed", sourceKey: preview.sourceKey
      });
      expect(storage.data).toEqual(before);
    }
  );

  it("rejects a source key redirected to the Neo namespace", async () => {
    const fixture = await savedFixture();
    fixture.preview.sourceKey = fixture.key;
    const before = new Map(fixture.storage.data);

    expect(await fixture.repository.prepareLegacyMigration(fixture.key)).toMatchObject({ status: "invalid" });
    expect(await fixture.repository.commitMigration(fixture.preview)).toMatchObject({ status: "invalid" });
    expect(fixture.storage.data).toEqual(before);
  });

  it("reports missing or malformed legacy source without creating a record", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    const sourceKey = "jpw-teaching-project:draft";
    expect(await repository.prepareLegacyMigration(sourceKey)).toEqual({ status: "missing-source", sourceKey });
    storage.data.set(sourceKey, "{broken");
    const before = new Map(storage.data);
    expect(await repository.prepareLegacyMigration(sourceKey)).toMatchObject({ status: "invalid" });
    expect(storage.data).toEqual(before);
  });

  it("allows only one create when separate sessions commit the same preview concurrently", async () => {
    const storage = new MemoryStorage();
    const first = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    const second = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    const preview = await seedMigration(first, storage);
    const sourceText = storage.data.get(preview.sourceKey);
    const results = await Promise.all([first.commitMigration(preview), second.commitMigration(preview)]);

    expect(results.map((result) => result.status).sort()).toEqual(["conflict", "saved"]);
    expect(results.find((result) => result.status === "conflict")).toMatchObject({
      expectedRevision: null, actualRevision: 1
    });
    expect(storage.data.get(preview.sourceKey)).toBe(sourceText);
    expect(storage.data.size).toBe(2);
  });
});

describe("ProjectRepository storage and lock failures", () => {
  it("returns read-failed without changing the last valid revision", async () => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    fixture.storage.failRead = true;
    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "storage-error", code: "read-failed" });
    expect(await fixture.repository.save(fixture.record.project, 1)).toMatchObject({ status: "storage-error", code: "read-failed" });
    expect(await fixture.repository.prepareLegacyMigration(fixture.preview.sourceKey)).toMatchObject({ status: "storage-error", code: "read-failed" });
    expect(await fixture.repository.commitMigration(fixture.preview)).toMatchObject({ status: "storage-error", code: "read-failed" });
    expect(fixture.storage.data).toEqual(before);
    fixture.storage.failRead = false;
    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "found", record: { project: { revision: 1 } } });
  });

  it("returns storage-unavailable when the default storage becomes unavailable", async () => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    vi.stubGlobal("localStorage", fixture.storage);
    const repository = new LocalStorageProjectRepository({ lock: new SharedTestLock() });
    expect(await repository.get(fixture.record.project.id)).toMatchObject({ status: "found" });
    vi.stubGlobal("localStorage", undefined);

    expect(await repository.get(fixture.record.project.id)).toMatchObject({ status: "storage-error", code: "storage-unavailable" });
    expect(await repository.save(fixture.record.project, 1)).toMatchObject({ status: "storage-error", code: "storage-unavailable" });
    expect(fixture.storage.data).toEqual(before);
  });

  it("preserves existing projects when rereading the legacy source fails during commit", async () => {
    const fixture = await savedFixture();
    const preview = await seedMigration(fixture.repository, fixture.storage, "source-read-failure");
    const before = new Map(fixture.storage.data);
    vi.spyOn(fixture.storage, "getItem").mockImplementation((key) => {
      if (key === preview.sourceKey) throw new Error("Injected source read failure");
      return fixture.storage.data.get(key) ?? null;
    });

    expect(await fixture.repository.commitMigration(preview)).toMatchObject({ status: "storage-error", code: "read-failed" });
    expect(fixture.storage.data).toEqual(before);
    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "found" });
  });

  it.each(["unavailable", "rejected"])("fails closed when exclusive locks are %s", async (failure) => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    const rejected: ProjectRepositoryLock = {
      async runExclusive() { throw new Error("Injected lock rejection"); }
    };
    const repository = new LocalStorageProjectRepository({
      storage: fixture.storage, lock: failure === "unavailable" ? null : rejected
    });
    const code = failure === "unavailable" ? "lock-unavailable" : "lock-failed";

    expect(await repository.get(fixture.record.project.id)).toMatchObject({ status: "found" });
    expect(await repository.save(fixture.record.project, 1)).toMatchObject({ status: "storage-error", code });
    expect(await repository.commitMigration(fixture.preview)).toMatchObject({ status: "storage-error", code });
    expect(fixture.storage.data).toEqual(before);
  });

  it.each(["quota", "error"] as const)("keeps existing records after a %s save failure and permits retry", async (failure) => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    fixture.record.project.metadata.title = "A recoverable edit";
    fixture.storage.failWrite = failure;

    expect(await fixture.repository.save(fixture.record.project, 1)).toMatchObject({
      status: "storage-error", code: failure === "quota" ? "quota-exceeded" : "write-failed"
    });
    expect(fixture.storage.data).toEqual(before);
    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "found", record: { project: { revision: 1 } } });
    fixture.storage.failWrite = null;
    expect(await fixture.repository.save(fixture.record.project, 1)).toMatchObject({ status: "saved", record: { project: { revision: 2 } } });
  });

  it.each(["quota", "error"] as const)("does not publish a candidate after a %s commit failure", async (failure) => {
    const fixture = await savedFixture();
    const preview = await seedMigration(fixture.repository, fixture.storage, "second-legacy-test");
    const before = new Map(fixture.storage.data);
    fixture.storage.failWrite = failure;

    expect(await fixture.repository.commitMigration(preview)).toMatchObject({
      status: "storage-error", code: failure === "quota" ? "quota-exceeded" : "write-failed"
    });
    expect(fixture.storage.data).toEqual(before);
    expect(await fixture.repository.get(candidate(preview).id)).toMatchObject({ status: "missing" });
    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "found", record: { project: { revision: 1 } } });
  });
});

describe("ProjectRepository revision and score corruption boundary", () => {
  it("rejects non-JSON nested payloads and a throwing getter before touching storage", async () => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    fixture.record.project.extensions.future = { nested: [NaN] };
    expect((await fixture.repository.save(fixture.record.project, 1)).status).toBe("invalid");
    let invoked = false;
    Object.defineProperty(fixture.record.project.extensions, "future", {
      enumerable: true, configurable: true,
      get() { invoked = true; throw new Error("This getter must never run"); }
    });
    expect((await fixture.repository.save(fixture.record.project, 1)).status).toBe("invalid");
    expect(invoked).toBe(false);
    expect(fixture.storage.data).toEqual(before);
    expect((await fixture.repository.get(fixture.record.project.id)).status).toBe("found");
  });

  it("retains migration source and requires a new score revision for changed musical content", async () => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    const input = structuredClone(fixture.record.project);
    input.provenance.length = 0;
    expect((await fixture.repository.save(input, 1)).status).toBe("invalid");
    const changedScore = structuredClone(fixture.record.project);
    changedScore.score.snapshot!.value.title.title = "Changed canonical title";
    changedScore.score.snapshotFingerprint = createDeterministicFingerprint(changedScore.score.snapshot);
    changedScore.score.source.fingerprint = changedScore.score.snapshotFingerprint;
    expect(await fixture.repository.save(changedScore, 1)).toMatchObject({ status: "invalid", path: "/score/revision" });
    expect(fixture.storage.data).toEqual(before);
    changedScore.score.revision = "explicit-new-score-revision";
    changedScore.score.source.revision = changedScore.score.revision;
    expect((await fixture.repository.save(changedScore, 1)).status).toBe("saved");
    expect((await fixture.repository.get(changedScore.id)).status).toBe("found");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsafe expected revision %s without changing storage", async (revision) => {
      const fixture = await savedFixture();
      const before = new Map(fixture.storage.data);
      expect(await fixture.repository.save(fixture.record.project, revision)).toMatchObject({ status: "invalid" });
      expect(fixture.storage.data).toEqual(before);
    }
  );

  it("rejects an unsafe revision inside the project independently of expectedRevision", async () => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    fixture.record.project.revision = Number.MAX_SAFE_INTEGER + 1;
    expect(await fixture.repository.save(fixture.record.project, 1)).toMatchObject({ status: "invalid" });
    expect(fixture.storage.data).toEqual(before);
  });

  it("does not overflow a valid maximum revision", async () => {
    const fixture = await savedFixture();
    fixture.record.project.revision = Number.MAX_SAFE_INTEGER;
    fixture.storage.data.set(fixture.key, reseal(fixture.record));
    const before = new Map(fixture.storage.data);

    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "found" });
    expect(await fixture.repository.save(fixture.record.project, Number.MAX_SAFE_INTEGER)).toMatchObject({ status: "invalid", path: "/revision" });
    expect(fixture.storage.data).toEqual(before);
  });

  it("classifies an unsafe persisted revision as corrupt even with valid checksums", async () => {
    const fixture = await savedFixture();
    fixture.record.project.revision = Number.MAX_SAFE_INTEGER + 1;
    fixture.storage.data.set(fixture.key, reseal(fixture.record));
    const before = new Map(fixture.storage.data);

    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "corrupt" });
    expect(fixture.storage.data).toEqual(before);
  });

  it("rejects a mismatched canonical snapshot fingerprint on save and retains the valid project", async () => {
    const fixture = await savedFixture();
    const before = new Map(fixture.storage.data);
    fixture.record.project.score.snapshotFingerprint = "does-not-match-score";

    expect(await fixture.repository.save(fixture.record.project, 1)).toMatchObject({ status: "invalid" });
    expect(fixture.storage.data).toEqual(before);
    expect(await fixture.repository.get(fixture.record.project.id)).toMatchObject({ status: "found", record: { project: { revision: 1 } } });
  });
});
