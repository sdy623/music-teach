import type { ProjectDatabase, DatabaseWrite } from "../../src/neo/library/ProjectDatabase";
import { LibraryError, type Checkpoint, type ProjectSummary, type StoredAsset, type StoredProject } from "../../src/neo/library/types";

export class MemoryProjectDatabase implements ProjectDatabase {
  records = new Map<string, StoredProject>();
  summaries = new Map<string, ProjectSummary>();
  assetRecords = new Map<string, StoredAsset>();
  checkpointRecords = new Map<string, Checkpoint>();
  migrations = new Map<string, string>();
  failure: Error | null = null;
  async read(id: string) { return structuredClone(this.records.get(id) ?? null); }
  async list() { return structuredClone([...this.summaries.values()]); }
  async assets(id: string) { return structuredClone([...this.assetRecords.values()].filter(asset => asset.projectId === id)); }
  async checkpoints(id: string) { return structuredClone([...this.checkpointRecords.values()].filter(checkpoint => checkpoint.projectId === id)); }
  async migration(key: string) { return this.migrations.get(key) ?? null; }
  async commit(write: DatabaseWrite) {
    if (this.failure) throw this.failure;
    const current = this.records.get(write.record.id);
    if ((current?.json ?? null) !== write.expected) throw new LibraryError("conflict", "Revision conflict", current?.revision ?? 0);
    if (write.migration && this.migrations.has(write.migration.key)) throw new Error("Duplicate migration");
    const snapshot = structuredClone(write);
    this.records.set(snapshot.record.id, snapshot.record);
    this.summaries.set(snapshot.record.id, snapshot.summary);
    for (const asset of snapshot.assets ?? []) this.assetRecords.set(asset.key, asset);
    if (snapshot.migration) this.migrations.set(snapshot.migration.key, snapshot.migration.projectId);
    if (snapshot.checkpoint) {
      this.checkpointRecords.set(snapshot.checkpoint.key, snapshot.checkpoint);
      const sorted = [...this.checkpointRecords.values()].filter(entry => entry.projectId === snapshot.record.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key));
      for (const checkpoint of sorted.slice(20)) this.checkpointRecords.delete(checkpoint.key);
    }
  }
}
export const blankInput = { title: "M2 test", artist: "", key: "C", meter: "4/4", tempo: 80, measures: 2 };
export function arrayBuffer(bytes: Uint8Array): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; }
