import type { LibraryService, LibraryCommand } from "./LibraryService";
import { libraryFailure } from "./types";
export interface LibraryWorkerHost {
  onmessage: ((event: MessageEvent<{ id: number; command: LibraryCommand }>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}
export function serveLibraryWorker(service: LibraryService, host: LibraryWorkerHost): void {
  // One worker owns a session; separate workers coordinate through IDB CAS.
  let tail = Promise.resolve();
  host.onmessage = event => {
    const { id, command } = event.data;
    tail = tail.then(async () => {
      try {
        const value = await service.run(command);
        const bytes = (value as { bytes?: ArrayBuffer } | null)?.bytes;
        host.postMessage({ id, ok: true, value }, bytes instanceof ArrayBuffer ? [bytes] : []);
      } catch (error) {
        const failure = libraryFailure(error);
        host.postMessage({ id, ok: false, error: { code: failure.code, message: failure.message, actualRevision: failure.actualRevision } });
      }
    });
  };
}
