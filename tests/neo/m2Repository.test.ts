import { syntheticLongScore } from "./syntheticLongScore";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportService } from "../../src/neo/library/ImportService";
import { IndexedDbProjectRepository } from "../../src/neo/library/IndexedDbProjectRepository";
import { LibraryError, type ProjectBundle } from "../../src/neo/library/types";
import { LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY } from "../../src/neo/project/teachingProjectV3Adapter";
import { MemoryProjectDatabase, blankInput, arrayBuffer } from "./m2TestSupport";

function setup() {
  const database = new MemoryProjectDatabase();
  const repository = new IndexedDbProjectRepository(database);
  return { database, repository, imports: new ImportService(repository) };
}
const sakura = () => ({ filename: "sakura.jpwabc", bytes: arrayBuffer(readFileSync("public/fixtures/sakura.jpwabc")) });
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => vi.unstubAllGlobals());

describe("M2 persistence and import contracts", () => {
  it("creates a durable draft before editing and reads summaries without loading aggregates", async () => {
    const { database, repository, imports } = setup();
    const document = await imports.createBlank(blankInput);
    expect(document.lifecycle).toBe("draft");
    expect(document.project.revision).toBe(1);
    expect((await repository.get(document.project.id)).project.metadata.title).toBe("M2 test");
    database.read = async () => { throw new Error("List must not load project bodies"); };
    const summaries = await repository.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.measures).toBe(2);
    expect(summaries[0]!.thumbnail?.slots.length).toBeGreaterThan(0);
    expect(summaries[0]).not.toHaveProperty("project");
  });
  it.each([
    ["2/4", 4, 4], ["3/4", 6, 6], ["4/4", 8, 8], ["6/8", 12, 6]
  ] as const)("previews a lyric-free %s blank with its actual rests and durations", async (meter, rests, quarters) => {
    const { imports, repository } = setup();
    const document = await imports.createBlank({ ...blankInput, meter, measures: 2 });
    const frames = repository.frames(document);
    const slots = frames.flatMap(frame => frame.slots);
    expect(frames).toHaveLength(1);
    expect(slots).toHaveLength(rests);
    expect(slots.every(slot => slot.kind === "rest")).toBe(true);
    expect(slots.reduce((total, slot) => total + slot.durationQuarters, 0)).toBe(quarters);
    expect(document.project.lesson.phrases).toHaveLength(1);
    expect(frames[0]!.sourceAnchor).toMatchObject({ startMeasure: 1, endMeasure: 2 });
  });
  it("previews a large synthetic score without writing, then persists and reopens it", async () => {
    const { database, repository, imports } = setup();
    const preview = await imports.prepare({ filename: "synthetic-scale.jpwabc", bytes: arrayBuffer(Buffer.from("\ufeff" + syntheticLongScore(), "utf16le")) });
    expect(preview.encoding).toBe("utf-16le");
    expect(preview.summary.phrases).toBe(128);
    expect(preview.recordBytes).toBeGreaterThan(3_000_000);
    expect(database.records.size).toBe(0);
    const document = await imports.commit(preview.token);
    const reopened = await repository.get(document.project.id);
    expect(reopened).toEqual(document);
    expect(reopened.project.lesson.phrases).toHaveLength(128);
    expect((await repository.list())[0]!.thumbnail!.slots.length).toBeGreaterThan(0);
  });
  it("malformed imports invalidate old candidates and never replace a saved project", async () => {
    const { database, imports } = setup();
    const existing = await imports.createBlank(blankInput);
    const raw = database.records.get(existing.project.id)!.json;
    const preview = await imports.prepare(sakura());
    await expect(imports.prepare({ filename: "bad.json", bytes: new TextEncoder().encode('{"schema":').buffer })).rejects.toThrow();
    await expect(imports.commit(preview.token)).rejects.toMatchObject({ code: "expired-preview" });
    expect(database.records.get(existing.project.id)!.json).toBe(raw);
  });
  it("requires a paired canonical score for v3, preserves unknowns and migrates a legacy source once", async () => {
    const { repository, imports, database } = setup();
    const text = readFileSync("tests/fixtures/projects/teaching-project-v3-unknowns.json", "utf8");
    const bytes = new TextEncoder().encode(text).buffer;
    const input = { filename: "legacy.json", bytes, legacyKey: "jpw-teaching-project:draft" };
    await expect(imports.prepare(input)).rejects.toMatchObject({ code: "canonical-required" });
    const preview = await imports.prepare({ ...input, canonicalBytes: sakura().bytes });
    await expect(imports.commit(preview.token, `${text} `)).rejects.toMatchObject({ code: "source-changed" });
    const result = await imports.commit(preview.token, text);
    expect(result.source.text).toBe(text);
    expect((result.project.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY] as { sourceSnapshot: unknown }).sourceSnapshot).toEqual(JSON.parse(text));
    const again = await imports.prepare({ ...input, canonicalBytes: sakura().bytes });
    expect(again.existingProjectId).toBe(result.project.id);
    expect((await imports.commit(again.token, text)).project.id).toBe(result.project.id);
    expect(database.records.size).toBe(1);
    expect((await repository.get(result.project.id)).project.revision).toBe(1);
  });
  it("preserves music, lyrics, lesson semantics and original source across export/import without nesting prior exports", async () => {
    const { imports } = setup();
    const preview = await imports.prepare(sakura());
    const first = await imports.commit(preview.token);
    const exported = await imports.export(first.project.id);
    const secondPreview = await imports.prepare({ filename: exported.filename, bytes: exported.bytes });
    const second = await imports.commit(secondPreview.token);
    expect(second.project.id).not.toBe(first.project.id);
    for (const field of ["score", "lyricLayers", "lesson", "timeline", "assets", "evidence", "proposals", "provenance", "extensions"] as const) expect(second.project[field]).toEqual(first.project[field]);
    expect(second.source).toEqual(first.source);
    expect(second.preservation).toEqual(first.preservation);
  });
  it("isolates caller snapshots and rejects stale concurrent writers", async () => {
    const { imports, repository, database } = setup();
    const original = await imports.createBlank(blankInput);
    const left = await repository.get(original.project.id);
    const right = await repository.get(original.project.id);
    left.project.metadata.title = "first";
    const save = repository.save(left, 1);
    left.project.metadata.title = "caller mutation";
    expect((await save).project.metadata.title).toBe("first");
    right.project.metadata.title = "second";
    await expect(new IndexedDbProjectRepository(database).save(right, 1)).rejects.toMatchObject({ code: "conflict", actualRevision: 2 });
    expect((await repository.get(original.project.id)).project.metadata.title).toBe("first");
  });
  it("rejects duplicate provenance before storing and leaves the corrected next save usable", async () => {
    const { repository, imports, database } = setup();
    const original = await imports.createBlank(blankInput);
    const raw = database.records.get(original.project.id)!.json;
    const proposal = await repository.get(original.project.id);
    proposal.project.provenance.push({ ...proposal.project.provenance[0]!, extensions: { changed: true } });
    await expect(repository.save(proposal, 1)).rejects.toThrow("unique");
    expect(database.records.get(original.project.id)!.json).toBe(raw);
    proposal.project.provenance.pop();
    expect((await repository.save(proposal, 1)).project.revision).toBe(2);
  });
  it("retains the last valid project and summary on a quota failure", async () => {
    const { repository, imports, database } = setup();
    const original = await imports.createBlank(blankInput);
    const oldRecord = structuredClone([...database.records]);
    const oldIndex = structuredClone([...database.summaries]);
    database.failure = new DOMException("Injected quota", "QuotaExceededError");
    original.project.metadata.title = "not saved";
    await expect(repository.save(original, 1)).rejects.toThrow("Injected quota");
    expect([...database.records]).toEqual(oldRecord);
    expect([...database.summaries]).toEqual(oldIndex);
  });
  it("duplicates and restores archived/trash lifecycles without modifying the source project", async () => {
    const { repository, imports } = setup();
    const first = await imports.createBlank(blankInput);
    const copy = await repository.duplicate(first);
    expect(copy.project.id).not.toBe(first.project.id);
    await repository.setLifecycle(copy.project.id, 1, "archived");
    await repository.setLifecycle(copy.project.id, 2, "trashed");
    expect((await repository.setLifecycle(copy.project.id, 3, "restore")).lifecycle).toBe("archived");
    expect((await repository.get(first.project.id)).project.revision).toBe(1);
  });
  it("restores a checkpoint in a new revision with an atomic pre-restore checkpoint", async () => {
    const { repository, imports } = setup();
    const original = await imports.createBlank(blankInput);
    await repository.checkpoint(original.project.id, 1, "before");
    const checkpoint = (await repository.database.checkpoints(original.project.id))[0]!;
    await repository.updateMetadata(original.project.id, 1, { ...original.project.metadata, title: "after" });
    const restored = await repository.restoreCheckpoint(original.project.id, 2, checkpoint.key);
    expect(restored.project.metadata.title).toBe(blankInput.title);
    expect(restored.project.revision).toBe(3);
    expect((await repository.database.checkpoints(original.project.id)).map(entry => entry.name)).toContain("恢复之前的版本");
  });
  it("configures only generated blank drafts and can restore their earlier source safely", async () => {
    const { repository, imports } = setup();
    const first = await imports.createBlank(blankInput);
    const second = await repository.configureBlank(first.project.id, 1, imports.buildBlank({ ...blankInput, measures: 3, meter: "3/4", key: "D" }));
    expect(repository.summary(second).measures).toBe(3);
    expect(second.project.metadata.keyAndMeters).toContain("3/4");
    const checkpoint = (await repository.database.checkpoints(first.project.id))[0]!;
    const restored = await repository.restoreCheckpoint(first.project.id, 2, checkpoint.key);
    expect(restored.source.text).toBe(first.source.text);
    await repository.setLifecycle(first.project.id, 3, "active");
    await expect(repository.configureBlank(first.project.id, 4, imports.buildBlank(blankInput))).rejects.toMatchObject({ code: "invalid" });
  });
  it("keeps at most twenty checkpoints", async () => {
    const { repository, imports } = setup();
    const document = await imports.createBlank(blankInput);
    for (let index = 0; index < 22; index++) await repository.checkpoint(document.project.id, 1, `checkpoint ${index}`);
    expect(await repository.database.checkpoints(document.project.id)).toHaveLength(20);
  });
  it("stores attachment bytes separately, verifies repair and preserves them through the bundle", async () => {
    const { repository, imports, database } = setup();
    const first = await imports.createBlank(blankInput);
    const bytes = new TextEncoder().encode("Synthetic attachment for M2").buffer;
    const withAsset = await repository.attachAsset(first.project.id, 1, "notes.txt", "text/plain", bytes);
    const ref = withAsset.project.assets[0]!;
    expect(ref.fingerprint).toMatch(/^sha256:/);
    expect(database.assetRecords.size).toBe(1);
    const exported = await imports.export(first.project.id);
    const preview = await imports.prepare({ filename: exported.filename, bytes: exported.bytes });
    expect(preview.missingAssets).toEqual([]);
    const imported = await imports.commit(preview.token);
    expect((await database.assets(imported.project.id))[0]!.bytes).toEqual(bytes);
    database.assetRecords.delete(`${first.project.id}/${ref.id}`);
    expect((await repository.view(await repository.get(first.project.id))).assets[0]!.missing).toBe(true);
    await expect(repository.attachAsset(first.project.id, 2, "wrong.txt", "text/plain", new ArrayBuffer(0), ref.id)).rejects.toMatchObject({ code: "asset-mismatch" });
    await repository.attachAsset(first.project.id, 2, "notes.txt", "text/plain", bytes, ref.id);
    expect((await repository.view(await repository.get(first.project.id))).assets[0]!.missing).toBe(false);
    const bundle = JSON.parse(new TextDecoder().decode(exported.bytes)) as ProjectBundle;
    bundle.assets[0]!.base64 = btoa("different bytes");
    await expect(imports.prepare({ filename: "tampered.json", bytes: new TextEncoder().encode(JSON.stringify(bundle)).buffer })).rejects.toBeInstanceOf(LibraryError);
  });
});
