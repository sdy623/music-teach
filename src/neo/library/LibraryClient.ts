import type { LibraryCommand } from "./LibraryService";
import { LibraryError } from "./types";

export interface LibraryClientPort { request<T>(command: LibraryCommand): Promise<T> }
export class LibraryClient implements LibraryClientPort {
  constructor(private readonly workerFactory = () => new Worker(new URL("./library.worker.ts", import.meta.url), { type: "module", name: "Music Teach project session" })) {}
  private worker: Worker | null = null;
  private serial = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();
  private connect(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") throw new LibraryError("unavailable", "当前环境不支持后台工程存储。请通过本地网页打开。" );
    const worker = this.workerFactory();
    worker.onmessage = event => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.value);
      else pending.reject(new LibraryError(response.error.code, response.error.message, response.error.actualRevision));
    };
    const fail = () => {
      for (const pending of this.pending.values()) pending.reject(new LibraryError("worker-failed", "后台保存中断。待保存的文字仍保留，请重试或恢复。" ));
      this.pending.clear(); worker.terminate(); this.worker = null;
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    this.worker = worker;
    return worker;
  }
  request<T>(command: LibraryCommand): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      try {
        const worker = this.connect();
        this.pending.set(id, { resolve: value => resolve(value as T), reject });
        worker.postMessage({ id, command }); // Structured cloning captures this bounded request now.
      } catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  close(): void {
    this.worker?.terminate(); this.worker = null;
    for (const pending of this.pending.values()) pending.reject(new LibraryError("closed", "工程会话已关闭。" ));
    this.pending.clear();
  }
}
export const libraryClient = new LibraryClient();
