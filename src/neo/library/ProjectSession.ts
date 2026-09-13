import type { ProjectMetadata } from "../project/types";
import { assertRepositoryMetadata, cloneRepositoryJson } from "../project/repositoryValidation";
import type { LibraryClientPort } from "./LibraryClient";
import { LibraryError, type ProjectView } from "./types";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "conflict" | "error";
export const RECOVERY_PREFIX = "music-teach:neo:recovery:v1:";
export interface RecoveryEntry {
  schema: "music-teach/metadata-recovery";
  id: string; owner: string; baseRevision: number; updatedAt: string; metadata: ProjectMetadata;
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export class ProjectSession {
  view: ProjectView | null = null;
  metadata: ProjectMetadata | null = null;
  status: SaveState = "clean";
  loading = false;
  error = "";
  journalError = "";
  recovery: RecoveryEntry | null = null;
  private generation = 0;
  private savedGeneration = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<boolean> | null = null;
  private openGeneration = 0;
  private conflictBaseRevision: number | null = null;

  constructor(readonly client: LibraryClientPort, private readonly storage: Storage | null, readonly owner: string) {}
  get unsaved(): boolean { return this.generation !== this.savedGeneration; }
  private get key(): string { return `${RECOVERY_PREFIX}${this.view!.summary.id}:${this.owner}`; }
  adopt(view: ProjectView): void {
    clearTimeout(this.timer);
    this.view = view;
    this.metadata = copy(view.metadata);
    this.generation = this.savedGeneration = 0;
    this.conflictBaseRevision = null;
    this.status = "clean"; this.error = ""; this.recovery = null;
  }
  async open(id: string): Promise<void> {
    // Returning from the library must revalidate even the same project: its
    // lifecycle or saved revision may have changed while the editor was away.
    const generation = ++this.openGeneration;
    this.loading = true;
    this.error = "";
    try {
      const view = await this.client.request<ProjectView>({ method: "open", id });
      if (generation !== this.openGeneration) return;
      this.adopt(view);
      this.findRecovery();
    } catch (error) { if (generation === this.openGeneration) { this.view = null; this.metadata = null; this.status = "error"; this.error = error instanceof Error ? error.message : String(error); } }
    finally { if (generation === this.openGeneration) this.loading = false; }
  }
  update(patch: Partial<ProjectMetadata>): void {
    if (!this.metadata || !this.view) return;
    this.metadata = { ...this.metadata, ...copy(patch) };
    this.generation++;
    if (this.status !== "conflict") this.status = "dirty";
    this.writeJournal();
    clearTimeout(this.timer);
    if (this.status !== "conflict") this.timer = setTimeout(() => { void this.flush(); }, 450);
  }
  private writeJournal(): void {
    if (!this.view || !this.metadata) return;
    try {
      if (!this.storage) throw new Error("恢复存储不可用");
      const recovery: RecoveryEntry = { schema: "music-teach/metadata-recovery", id: this.view.summary.id, owner: this.owner,
        baseRevision: this.conflictBaseRevision ?? this.view.summary.revision, updatedAt: new Date().toISOString(), metadata: this.metadata };
      this.storage.setItem(this.key, JSON.stringify(recovery));
      this.journalError = "";
    } catch { this.journalError = "即时恢复副本未能保存，请保持此页打开，等待工程保存完成。"; }
  }
  private clearJournal(): void { try { this.storage?.removeItem(this.key); this.journalError = ""; } catch { /* A redundant recovery copy is safer than deleting other data. */ } }
  private findRecovery(): void {
    if (!this.view || !this.storage) return;
    const prefix = `${RECOVERY_PREFIX}${this.view.summary.id}:`;
    const entries: RecoveryEntry[] = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
          const entry = JSON.parse(this.storage.getItem(key) ?? "null") as RecoveryEntry;
          assertRepositoryMetadata(cloneRepositoryJson(entry?.metadata));
          if (entry?.schema === "music-teach/metadata-recovery" && entry.id === this.view.summary.id
            && Number.isSafeInteger(entry.baseRevision) && entry.baseRevision > 0 && typeof entry.owner === "string"
            && typeof entry.updatedAt === "string" && entry.metadata && typeof entry.metadata.title === "string"
            && JSON.stringify(entry.metadata) !== JSON.stringify(this.view.metadata)) entries.push(entry);
        } catch { /* Corrupt journals never replace a valid project. */ }
      }
      entries.sort((a, b) => Number(b.owner === this.owner) - Number(a.owner === this.owner) || b.updatedAt.localeCompare(a.updatedAt));
      this.recovery = entries[0] ?? null;
    } catch { this.journalError = "无法检查未保存的文字副本。"; }
  }
  restoreRecovery(): void {
    if (!this.recovery || !this.view) return;
    const recovery = this.recovery;
    this.recovery = null;
    this.metadata = copy(recovery.metadata);
    this.generation++;
    if (recovery.baseRevision !== this.view.summary.revision) {
      this.conflictBaseRevision = recovery.baseRevision;
      this.status = "conflict";
      this.error = "恢复副本基于较早的版本。请另存副本或重新载入已保存版本。";
      this.writeJournal();
    } else { this.status = "dirty"; this.writeJournal(); void this.flush(); }
  }
  dismissRecovery(): void {
    if (this.recovery?.owner === this.owner) this.clearJournal();
    // Another page's recovery data belongs to that page; dismiss does not delete it.
    this.recovery = null;
  }
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.inFlight) return this.inFlight;
    if (!this.unsaved || !this.view || !this.metadata) return Promise.resolve(true);
    if (this.status === "conflict") return Promise.resolve(false);
    this.inFlight = this.saveLoop().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  private async saveLoop(): Promise<boolean> {
    while (this.unsaved && this.view && this.metadata) {
      const generation = this.generation;
      const metadata = copy(this.metadata);
      this.status = "saving";
      try {
        const view = await this.client.request<ProjectView>({ method: "metadata", id: this.view.summary.id, revision: this.view.summary.revision, metadata });
        this.view = view;
        this.savedGeneration = generation;
        this.error = "";
        if (this.unsaved) this.writeJournal();
        else { this.metadata = copy(view.metadata); this.clearJournal(); }
      } catch (error) {
        this.status = error instanceof LibraryError && error.code === "conflict" ? "conflict" : "error";
        this.error = error instanceof Error ? error.message : String(error);
        return false;
      }
    }
    this.status = "saved";
    return true;
  }
  async reload(): Promise<void> {
    if (!this.view) return;
    const view = await this.client.request<ProjectView>({ method: "open", id: this.view.summary.id });
    this.clearJournal(); this.adopt(view);
  }
  async fork(): Promise<ProjectView> {
    if (!this.metadata) throw new Error("没有可恢复的修改。");
    const view = await this.client.request<ProjectView>({ method: "fork", metadata: copy(this.metadata) });
    this.clearJournal(); this.adopt(view);
    return view;
  }
}
