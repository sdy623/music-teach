import { LibraryError, type Checkpoint, type ProjectSummary, type StoredAsset, type StoredProject } from "./types";

export interface DatabaseWrite {
  expected: string | null;
  record: StoredProject;
  summary: ProjectSummary;
  assets?: StoredAsset[];
  checkpoint?: Checkpoint;
  migration?: { key: string; projectId: string };
}
export interface ProjectDatabase {
  read(id: string): Promise<StoredProject | null>;
  list(): Promise<ProjectSummary[]>;
  assets(id: string): Promise<StoredAsset[]>;
  checkpoints(id: string): Promise<Checkpoint[]>;
  migration(key: string): Promise<string | null>;
  commit(write: DatabaseWrite): Promise<void>;
}

/** The comparison and every related write happen in ONE readwrite transaction. */
export class IndexedDbProjectDatabase implements ProjectDatabase {
  private connection: Promise<IDBDatabase> | null = null;
  constructor(readonly name = "music-teach-neo-library-v1", private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    const connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) { reject(new LibraryError("unavailable", "此环境无法使用工程存储。请通过本地网页或 HTTPS 打开。")); return; }
      const request = this.factory.open(this.name, 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("projects", { keyPath: "id" });
        db.createObjectStore("summaries", { keyPath: "id" });
        for (const name of ["assets", "checkpoints"]) {
          db.createObjectStore(name, { keyPath: "key" }).createIndex("projectId", "projectId");
        }
        db.createObjectStore("migrations", { keyPath: "key" });
      };
      request.onblocked = () => { abandoned = true; reject(new LibraryError("blocked", "另一个页面正在使用旧版工程库，请关闭该页面后重试。")); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (abandoned) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); this.connection = null; };
        resolve(request.result);
      };
    }).catch(error => { this.connection = null; throw error; });
    this.connection = connection;
    return connection;
  }

  private async query<T>(store: string, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("读取工程库失败。"));
      tx.onerror = () => { /* onabort owns the terminal result */ };
    });
  }
  async read(id: string): Promise<StoredProject | null> { return (await this.query<StoredProject | undefined>("projects", store => store.get(id))) ?? null; }
  list(): Promise<ProjectSummary[]> { return this.query("summaries", store => store.getAll()); }
  assets(id: string): Promise<StoredAsset[]> { return this.query("assets", store => store.index("projectId").getAll(id)); }
  checkpoints(id: string): Promise<Checkpoint[]> { return this.query("checkpoints", store => store.index("projectId").getAll(id)); }
  async migration(key: string): Promise<string | null> { return (await this.query<{ projectId: string } | undefined>("migrations", store => store.get(key)))?.projectId ?? null; }

  async commit(write: DatabaseWrite): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["projects", "summaries", "assets", "checkpoints", "migrations"], "readwrite");
      let failure: unknown;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("保存事务未完成。"));
      tx.onerror = () => { /* abort preserves every old store */ };
      const request = tx.objectStore("projects").get(write.record.id);
      request.onsuccess = () => {
        try {
          const current = request.result as StoredProject | undefined;
          if ((current?.json ?? null) !== write.expected) {
            failure = new LibraryError("conflict", "另一个页面已保存更新。你的修改仍被保留。", current?.revision ?? 0);
            tx.abort(); return;
          }
          tx.objectStore("projects").put(write.record);
          tx.objectStore("summaries").put(write.summary);
          for (const asset of write.assets ?? []) tx.objectStore("assets").put(asset);
          if (write.migration) tx.objectStore("migrations").add(write.migration);
          if (write.checkpoint) {
            tx.objectStore("checkpoints").put(write.checkpoint);
            const checkpoints = tx.objectStore("checkpoints").index("projectId").getAll(write.record.id);
            checkpoints.onsuccess = () => {
              const sorted = (checkpoints.result as Checkpoint[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key));
              for (const old of sorted.slice(20)) tx.objectStore("checkpoints").delete(old.key);
            };
          }
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }

  async close(): Promise<void> { (await this.connection)?.close(); this.connection = null; }
}
