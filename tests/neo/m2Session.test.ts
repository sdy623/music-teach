import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryClientPort } from "../../src/neo/library/LibraryClient";
import { LibraryService, type LibraryCommand } from "../../src/neo/library/LibraryService";
import { IndexedDbProjectRepository } from "../../src/neo/library/IndexedDbProjectRepository";
import { ProjectSession, RECOVERY_PREFIX } from "../../src/neo/library/ProjectSession";
import { LibraryError, type ProjectView } from "../../src/neo/library/types";
import { MemoryProjectDatabase, blankInput } from "./m2TestSupport";

class Client implements LibraryClientPort {
  constructor(readonly service: LibraryService) {}
  request<T>(command: LibraryCommand): Promise<T> { return this.service.run(command) as Promise<T>; }
}
async function setup() {
  const database = new MemoryProjectDatabase();
  const service = new LibraryService(new IndexedDbProjectRepository(database));
  const client = new Client(service);
  const view = await client.request<ProjectView>({ method: "create", input: blankInput });
  const session = new ProjectSession(client, localStorage, "session-one");
  session.adopt(view);
  return { database, service, client, view, session };
}
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("M2 shared project session", () => {
  it("revalidates the same project after library lifecycle actions", async () => {
    const { session, service, view } = await setup();
    await service.run({ method: "lifecycle", id: view.summary.id, revision: 1, lifecycle: "trashed" });
    await session.open(view.summary.id);
    expect(session.view!.summary).toMatchObject({ revision: 2, lifecycle: "trashed" });
    await service.run({ method: "lifecycle", id: view.summary.id, revision: 2, lifecycle: "restore" });
    await session.open(view.summary.id);
    expect(session.view!.summary).toMatchObject({ revision: 3, lifecycle: "draft" });
  });
  it("journals text immediately, flushes on navigation and reopens the saved metadata", async () => {
    const { session, client, view } = await setup();
    session.update({ title: "A restored lesson", tags: ["class"] });
    expect(session.status).toBe("dirty");
    expect(localStorage.getItem(`${RECOVERY_PREFIX}${view.summary.id}:session-one`)).toContain("A restored lesson");
    expect(await session.flush()).toBe(true);
    expect(session.status).toBe("saved");
    expect(session.unsaved).toBe(false);
    expect(localStorage.getItem(`${RECOVERY_PREFIX}${view.summary.id}:session-one`)).toBeNull();
    const reopened = new ProjectSession(client, localStorage, "session-one");
    await reopened.open(view.summary.id);
    expect(reopened.metadata!.title).toBe("A restored lesson");
    expect(reopened.view!.summary.revision).toBe(2);
  });
  it("coalesces edits made during an in-flight save without losing the newest input", async () => {
    const { service, view } = await setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writes: Extract<LibraryCommand, { method: "metadata" }>[] = [];
    const client: LibraryClientPort = { async request<T>(command: LibraryCommand) {
      if (command.method === "metadata") { writes.push(structuredClone(command)); if (writes.length === 1) await gate; }
      return await service.run(command) as T;
    } };
    const session = new ProjectSession(client, localStorage, "in-flight");
    session.adopt(view);
    session.update({ title: "first" });
    const flush = session.flush();
    session.update({ title: "latest", artist: "teacher" });
    release();
    expect(await flush).toBe(true);
    expect(writes.map(write => [write.revision, write.metadata.title])).toEqual([[1, "first"], [2, "latest"]]);
    expect(session.metadata!.title).toBe("latest");
    expect(session.view!.summary.revision).toBe(3);
    expect(session.unsaved).toBe(false);
  });
  it("preserves recovery data and the last valid revision after a save failure, then retries", async () => {
    const { session, database, view } = await setup();
    const previous = database.records.get(view.summary.id)!.json;
    database.failure = new LibraryError("quota-exceeded", "Quota exhausted");
    session.update({ title: "unsaved title" });
    expect(await session.flush()).toBe(false);
    expect(session.status).toBe("error");
    expect(session.unsaved).toBe(true);
    expect(localStorage.getItem(`${RECOVERY_PREFIX}${view.summary.id}:session-one`)).toContain("unsaved title");
    expect(database.records.get(view.summary.id)!.json).toBe(previous);
    database.failure = null;
    expect(await session.flush()).toBe(true);
    expect(session.view!.summary.revision).toBe(2);
  });
  it("shows a conflict for a stale session, preserves its text and can fork its owned snapshot", async () => {
    const { session, database, view, service } = await setup();
    const otherClient = new Client(new LibraryService(new IndexedDbProjectRepository(database)));
    const other = new ProjectSession(otherClient, localStorage, "session-two");
    await other.open(view.summary.id);
    session.update({ title: "winner" });
    expect(await session.flush()).toBe(true);
    other.update({ title: "mine", artist: "local artist" });
    expect(await other.flush()).toBe(false);
    expect(other.status).toBe("conflict");
    expect(other.metadata!.title).toBe("mine");
    expect((await service.repository.get(view.summary.id)).project.metadata.title).toBe("winner");
    const fork = await other.fork();
    expect(fork.summary.id).not.toBe(view.summary.id);
    expect(fork.metadata.artist).toBe("local artist");
    expect((await service.repository.get(view.summary.id)).project.metadata.title).toBe("winner");
  });
  it("offers journal recovery after reload without automatically writing over the project", async () => {
    const { client, view, database } = await setup();
    const key = `${RECOVERY_PREFIX}${view.summary.id}:crashed`;
    localStorage.setItem(key, JSON.stringify({ schema: "music-teach/metadata-recovery", id: view.summary.id, owner: "crashed", baseRevision: 1, updatedAt: new Date().toISOString(), metadata: { ...view.metadata, title: "recovered" } }));
    const session = new ProjectSession(client, localStorage, "crashed");
    await session.open(view.summary.id);
    expect(session.recovery!.metadata.title).toBe("recovered");
    expect(session.metadata!.title).toBe(blankInput.title);
    expect(database.records.get(view.summary.id)!.revision).toBe(1);
    session.restoreRecovery();
    expect(await session.flush()).toBe(true);
    expect(session.metadata!.title).toBe("recovered");
    expect(database.records.get(view.summary.id)!.revision).toBe(2);
  });
  it("does not delete another page's journal when dismissing its recovery notice", async () => {
    const { client, view } = await setup();
    const key = `${RECOVERY_PREFIX}${view.summary.id}:other`;
    localStorage.setItem(key, JSON.stringify({ schema: "music-teach/metadata-recovery", id: view.summary.id, owner: "other", baseRevision: 1, updatedAt: new Date().toISOString(), metadata: { ...view.metadata, title: "other-page" } }));
    const session = new ProjectSession(client, localStorage, "current");
    await session.open(view.summary.id);
    session.dismissRecovery();
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(session.recovery).toBeNull();
  });
  it("treats a stale recovery base as a conflict rather than overwriting a newer version", async () => {
    const { service, client, view } = await setup();
    await service.repository.updateMetadata(view.summary.id, 1, { ...view.metadata, title: "newer" });
    localStorage.setItem(`${RECOVERY_PREFIX}${view.summary.id}:old`, JSON.stringify({ schema: "music-teach/metadata-recovery", id: view.summary.id, owner: "old", baseRevision: 1, updatedAt: new Date().toISOString(), metadata: { ...view.metadata, title: "old recovery" } }));
    const session = new ProjectSession(client, localStorage, "old");
    await session.open(view.summary.id);
    session.restoreRecovery();
    expect(session.status).toBe("conflict");
    expect(await session.flush()).toBe(false);
    expect((await service.repository.get(view.summary.id)).project.metadata.title).toBe("newer");
    const reopened = new ProjectSession(client, localStorage, "old");
    await reopened.open(view.summary.id);
    expect(reopened.recovery!.baseRevision).toBe(1);
    reopened.restoreRecovery();
    expect(reopened.status).toBe("conflict");
    expect(await reopened.flush()).toBe(false);
    expect((await service.repository.get(view.summary.id)).project.metadata.title).toBe("newer");
  });
  it("ignores a structurally incomplete journal instead of putting broken metadata into the editor", async () => {
    const { client, view } = await setup();
    localStorage.setItem(`${RECOVERY_PREFIX}${view.summary.id}:incomplete`, JSON.stringify({ schema: "music-teach/metadata-recovery", id: view.summary.id, owner: "incomplete", baseRevision: 1, updatedAt: new Date().toISOString(), metadata: { title: "incomplete" } }));
    const session = new ProjectSession(client, localStorage, "incomplete");
    await session.open(view.summary.id);
    expect(session.recovery).toBeNull();
    expect(session.metadata).toEqual(view.metadata);
  });
  it("ignores a corrupt recovery entry and reports journal unavailability without claiming a recovery copy", async () => {
    const { client, view } = await setup();
    localStorage.setItem(`${RECOVERY_PREFIX}${view.summary.id}:bad`, "{broken");
    const session = new ProjectSession(client, null, "no-storage");
    await session.open(view.summary.id);
    expect(session.recovery).toBeNull();
    session.update({ title: "can still save" });
    expect(session.journalError).not.toBe("");
    expect(await session.flush()).toBe(true);
  });
  it("does not adopt an old loader response after another project was requested", async () => {
    const { view } = await setup();
    let first!: (value: ProjectView) => void;
    let second!: (value: ProjectView) => void;
    const client: LibraryClientPort = { request<T>(command: LibraryCommand) {
      return new Promise<ProjectView>(resolve => { if (command.method === "open" && command.id === "first") first = resolve; else second = resolve; }) as Promise<T>;
    } };
    const session = new ProjectSession(client, localStorage, "navigation");
    const loadFirst = session.open("first");
    const loadSecond = session.open("second");
    second({ ...view, summary: { ...view.summary, id: "second" } });
    await loadSecond;
    first({ ...view, summary: { ...view.summary, id: "first" } });
    await loadFirst;
    expect(session.view!.summary.id).toBe("second");
  });
});
