import { describe, expect, it } from "vitest";
import * as MusicTeach from "../../src/index";
import {
  LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY,
  LocalStorageProjectRepository,
  neoProjectStorageKey
} from "../../src/neo/project";
import type { NeoProjectRecord, ProjectRepositoryLock } from "../../src/neo/project/ProjectRepository";
import { MemoryStorage, SharedTestLock, seedMigration } from "./repositoryTestSupport";

async function setup() {
  const storage = new MemoryStorage();
  const lock = new SharedTestLock();
  const repository = new LocalStorageProjectRepository({ storage, lock });
  const preview = await seedMigration(repository, storage);
  const result = await repository.commitMigration(preview);
  expect(result.status).toBe("saved");
  if (result.status !== "saved") throw new Error(JSON.stringify(result));
  return { storage, lock, repository, preview, record: result.record };
}

async function read(repository: LocalStorageProjectRepository, id: string): Promise<NeoProjectRecord> {
  const result = await repository.get(id);
  if (result.status !== "found") throw new Error(JSON.stringify(result));
  return result.record;
}

describe("M1 ProjectRepository snapshots and revisions", () => {
  it("adds a public repository without changing the legacy public API", () => {
    expect(MusicTeach.LocalStorageProjectRepository).toBe(LocalStorageProjectRepository);
    expect(MusicTeach.saveTeachingProjectLocally).toBeTypeOf("function");
    expect(MusicTeach.deserializeTeachingProject).toBeTypeOf("function");
  });

  it("previews without writes, commits to a new Neo key and preserves exact legacy text and report", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    const preview = await seedMigration(repository, storage);
    const before = new Map(storage.data);
    const again = await repository.prepareLegacyMigration(preview.sourceKey);
    expect(again.status).toBe("preview");
    expect(storage.data).toEqual(before);
    const result = await repository.commitMigration(preview);
    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error(JSON.stringify(result));
    const { project, migration } = result.record;
    expect(project.id).not.toBe(JSON.parse(preview.sourceText).id);
    expect(project.revision).toBe(1);
    expect(migration.sourceText).toBe(preview.sourceText);
    expect(migration.preservation).toEqual(preview.migration.preservation);
    expect(project.provenance).toEqual(preview.migration.candidate!.provenance);
    expect(project.extensions).toEqual(preview.migration.candidate!.extensions);
    for (const [key, value] of before) expect(storage.getItem(key)).toBe(value);
    expect([...storage.data.keys()].filter((key) => !before.has(key))).toEqual([neoProjectStorageKey(project.id)]);
    expect(await repository.commitMigration(preview)).toMatchObject({
      status: "conflict", expectedRevision: null, actualRevision: 1
    });
    const reopened = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    expect(await read(reopened, project.id)).toEqual(result.record);
  });

  it("isolates nested unknown evidence/proposal payloads on input, output and every read", async () => {
    const { repository, record, preview, storage } = await setup();
    const input = record.project;
    const scoreBefore = structuredClone(input.score);
    const sharedPayload = { tokens: [{ readings: ["original"], nested: { verified: false } }] };
    input.evidence.push({
      id: "evidence-1", kind: "test", scoreRevision: input.score.revision,
      status: "candidate", sourceFingerprint: "synthetic", payload: sharedPayload,
      provenanceIds: [input.provenance[0].id], extensions: { nested: [1, { value: "evidence" }] }
    });
    input.proposals.push({
      id: "proposal-1", kind: "test", scoreRevision: input.score.revision,
      status: "proposed", inputFingerprint: "synthetic", provider: null, payload: sharedPayload,
      provenanceIds: [input.provenance[0].id], extensions: { nested: { value: "proposal" } }
    });
    (input as unknown as Record<string, unknown>).futureTopLevel = { keep: [{ values: [7, 8] }] };
    input.extensions.future = { keep: ["unknown"] };
    const result = await repository.save(input, 1);
    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error(JSON.stringify(result));
    const saved = structuredClone(result.record);
    const persistedText = storage.getItem(neoProjectStorageKey(input.id));
    sharedPayload.tokens[0].readings.push("caller pollution");
    input.metadata.title = "caller pollution";
    input.proposals[0].extensions.nested = "caller pollution";
    result.record.project.metadata.title = "result pollution";
    result.record.migration.preservation.entries.length = 0;
    preview.migration.candidate!.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY] = "preview pollution";

    const first = await read(repository, input.id);
    const second = await read(repository, input.id);
    expect(first).toEqual(saved);
    expect(second).toEqual(saved);
    expect(first.project.evidence[0].payload).not.toBe(second.project.evidence[0].payload);
    expect(first.project.evidence[0].payload).not.toBe(first.project.proposals[0].payload);
    (first.project.evidence[0].payload as typeof sharedPayload).tokens[0].nested.verified = true;
    (first.project.proposals[0].payload as typeof sharedPayload).tokens[0].readings.length = 0;
    first.project.provenance[0].extensions.pollution = ["bad"];
    first.project.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY] = null;
    first.migration.preservation.counts.preserved = -1;
    expect(await read(repository, input.id)).toEqual(saved);
    expect(storage.getItem(neoProjectStorageKey(input.id))).toBe(persistedText);
    expect(saved.project.score).toEqual(scoreBefore);
    expect(saved.project.revision).toBe(2);
    expect(saved.project.revisionFingerprint).not.toBe(input.revisionFingerprint);
  });

  it("captures save input before a queued lock runs", async () => {
    const { storage, repository, record } = await setup();
    let release!: () => void;
    const queuedLock: ProjectRepositoryLock = {
      runExclusive<T>(_name: string, operation: () => T): Promise<T> {
        return new Promise<T>((resolve) => { release = () => resolve(operation()); });
      }
    };
    const queued = new LocalStorageProjectRepository({ storage, lock: queuedLock });
    const input = record.project;
    input.metadata.title = "at call time";
    input.extensions.future = { values: ["at call time"] };
    const pending = queued.save(input, 1);
    input.metadata.title = "after call";
    (input.extensions.future as { values: string[] }).values.push("after call");
    release();
    expect((await pending).status).toBe("saved");
    const stored = await read(repository, input.id);
    expect(stored.project.metadata.title).toBe("at call time");
    expect(stored.project.extensions.future).toEqual({ values: ["at call time"] });
  });

  it("captures migration preview before a queued commit runs", async () => {
    const storage = new MemoryStorage();
    let release!: () => void;
    const lock: ProjectRepositoryLock = {
      runExclusive<T>(_name: string, operation: () => T): Promise<T> {
        return new Promise<T>((resolve) => { release = () => resolve(operation()); });
      }
    };
    const repository = new LocalStorageProjectRepository({ storage, lock });
    const preview = await seedMigration(repository, storage);
    const expected = structuredClone(preview);
    const pending = repository.commitMigration(preview);
    preview.migration.candidate!.metadata.title = "late mutation";
    preview.migration.preservation.entries.length = 0;
    preview.sourceText = "broken";
    release();
    const result = await pending;
    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error(JSON.stringify(result));
    expect(result.record.project.metadata.title).toBe(expected.migration.candidate!.metadata.title);
    expect(result.record.migration.preservation).toEqual(expected.migration.preservation);
    expect(result.record.migration.sourceText).toBe(expected.sourceText);
  });

  it("returns an explicit conflict for two sessions editing the same revision", async () => {
    const { storage, lock, repository, record } = await setup();
    const other = new LocalStorageProjectRepository({ storage, lock });
    const first = (await read(repository, record.project.id)).project;
    const second = (await read(other, record.project.id)).project;
    first.metadata.title = "session A";
    second.metadata.title = "session B";
    const results = await Promise.all([repository.save(first, 1), other.save(second, 1)]);
    expect(results[0].status).toBe("saved");
    expect(results[1]).toEqual({ status: "conflict", projectId: first.id, expectedRevision: 1, actualRevision: 2 });
    expect((await read(other, first.id)).project.metadata.title).toBe("session A");
    const refresh = (await read(other, first.id)).project;
    refresh.metadata.title = "explicitly edited after refresh";
    expect((await other.save(refresh, 2)).status).toBe("saved");
    expect((await read(repository, first.id)).project.revision).toBe(3);
  });

  it("works when real Storage exposes an unrelated status key as a named property", async () => {
    const { storage, preview, record } = await setup();
    const local = window.localStorage;
    const keys = ["status", ...storage.data.keys()];
    const previous = new Map(keys.map((key) => [key, local.getItem(key)]));
    try {
      for (const [key, value] of storage.data) local.setItem(key, value);
      local.setItem("status", "unrelated-application-value");
      expect("status" in local).toBe(true);
      const repository = new LocalStorageProjectRepository({ storage: local, lock: new SharedTestLock() });
      expect((await repository.get(record.project.id)).status).toBe("found");
      expect((await repository.prepareLegacyMigration(preview.sourceKey)).status).toBe("preview");
      expect((await repository.commitMigration(preview)).status).toBe("conflict");
      expect((await repository.save(record.project, 1)).status).toBe("saved");
      expect(local.getItem("status")).toBe("unrelated-application-value");
    } finally {
      for (const [key, value] of previous) {
        if (value === null) local.removeItem(key);
        else local.setItem(key, value);
      }
    }
  });
});
