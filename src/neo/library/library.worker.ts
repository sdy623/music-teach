import { LibraryService } from "./LibraryService";
import { serveLibraryWorker, type LibraryWorkerHost } from "./workerHost";
serveLibraryWorker(new LibraryService(), globalThis as unknown as LibraryWorkerHost);
