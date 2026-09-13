import { describe, expect, it } from "vitest";
import { LocalStorageProjectRepository, neoProjectStorageKey } from "../../src/neo/project/LocalStorageProjectRepository";
import { createDeterministicFingerprint } from "../../src/neo/project/fingerprint";
import { MemoryStorage, SharedTestLock, seedMigration } from "./repositoryTestSupport";
describe("M1 runtime evaluation provenance regression", () => {
  it.each([false, true])("rejects duplicate provenance (modified=%s) before write and detects it on read", async modified => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageProjectRepository({ storage, lock: new SharedTestLock() });
    const result = await repository.commitMigration(await seedMigration(repository, storage));
    if (result.status !== "saved") throw new Error("Expected saved fixture");
    const key = neoProjectStorageKey(result.record.project.id);
    const before = storage.getItem(key)!;
    const project = result.record.project;
    project.provenance.push({ ...project.provenance[0]!, extensions: modified ? { modified: true } : project.provenance[0]!.extensions });
    expect(await repository.save(project, 1)).toMatchObject({ status: "invalid" });
    expect(storage.getItem(key)).toBe(before);
    const corrupt = JSON.parse(before);
    corrupt.project.provenance = project.provenance;
    const { revisionFingerprint: _projectHash, ...projectContent } = corrupt.project;
    corrupt.project.revisionFingerprint = createDeterministicFingerprint(projectContent);
    const { recordFingerprint: _recordHash, ...recordContent } = corrupt;
    corrupt.recordFingerprint = createDeterministicFingerprint(recordContent);
    storage.setItem(key, JSON.stringify(corrupt));
    expect(await repository.get(project.id)).toMatchObject({ status: "corrupt" });
    storage.setItem(key, before);
    project.provenance.pop();
    expect(await repository.save(project, 1)).toMatchObject({ status: "saved" });
  });
});
