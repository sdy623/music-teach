import { shallowReactive } from "vue";
import { libraryClient } from "./LibraryClient";
import { ProjectSession } from "./ProjectSession";

let session: ProjectSession | null = null;
export function useProjectSession(): ProjectSession {
  if (session) return session;
  let storage: Storage | null = null;
  let owner: string = crypto.randomUUID();
  try {
    storage = localStorage;
    const key = "music-teach:neo:session-id";
    owner = sessionStorage.getItem(key) || owner;
    sessionStorage.setItem(key, owner);
  } catch { /* Saving to IndexedDB may still work; the session surfaces journal failures. */ }
  session = shallowReactive(new ProjectSession(libraryClient, storage, owner)) as ProjectSession;
  window.addEventListener("beforeunload", event => {
    if (session!.unsaved) { void session!.flush(); event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("pagehide", () => { void session!.flush(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void session!.flush(); });
  return session;
}
