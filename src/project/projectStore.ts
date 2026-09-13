import { deserializeTeachingProject, serializeTeachingProject } from "./projectExport";
import type { TeachingProject } from "./types";

const LEGACY_DRAFT_KEY = "jpw-teaching-project:draft";
const CURRENT_PROJECT_KEY = "music-teach:current-project:v1";
const PROJECT_INDEX_KEY = "music-teach:project-index:v1";
const PROJECT_PREFIX = "music-teach:project:v1:";

export interface StoredTeachingProjectSummary {
  id: string;
  title: string;
  artist: string;
  phraseCount: number;
  updatedAt: string;
}

export interface ProjectSaveResult {
  ok: boolean;
  savedAt?: string;
  error?: string;
}

export function createLocalProjectId(title = "teaching-project"): string {
  const prefix = slugify(title) || "teaching-project";
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${suffix}`;
}

export function saveTeachingProjectLocally(
  project: TeachingProject,
  storage: Storage = window.localStorage,
  now = new Date()
): ProjectSaveResult {
  try {
    const savedAt = now.toISOString();
    storage.setItem(projectStorageKey(project.id), serializeTeachingProject(project));
    storage.setItem(CURRENT_PROJECT_KEY, project.id);
    storage.setItem(LEGACY_DRAFT_KEY, serializeTeachingProject(project));

    const summary: StoredTeachingProjectSummary = {
      id: project.id,
      title: project.title,
      artist: project.artist,
      phraseCount: project.phrases.length,
      updatedAt: savedAt
    };
    const index = listStoredTeachingProjects(storage).filter(
      (candidate) => candidate.id !== project.id
    );
    storage.setItem(PROJECT_INDEX_KEY, JSON.stringify([summary, ...index]));
    return { ok: true, savedAt };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法写入浏览器存储"
    };
  }
}

export function loadTeachingProjectLocally(
  id: string,
  storage: Storage = window.localStorage
): TeachingProject | undefined {
  try {
    const source = storage.getItem(projectStorageKey(id));
    return source ? deserializeSafely(source) : undefined;
  } catch {
    return undefined;
  }
}

export function loadCurrentTeachingProject(
  storage: Storage = window.localStorage
): TeachingProject | undefined {
  try {
    const currentId = storage.getItem(CURRENT_PROJECT_KEY);
    if (currentId) {
      const current = loadTeachingProjectLocally(currentId, storage);
      if (current) return current;
    }

    const legacyDraft = storage.getItem(LEGACY_DRAFT_KEY);
    const migrated = legacyDraft ? deserializeSafely(legacyDraft) : undefined;
    if (migrated) saveTeachingProjectLocally(migrated, storage);
    return migrated;
  } catch {
    return undefined;
  }
}

export function listStoredTeachingProjects(
  storage: Storage = window.localStorage
): StoredTeachingProjectSummary[] {
  try {
    const source = storage.getItem(PROJECT_INDEX_KEY);
    if (!source) return [];
    const value = JSON.parse(source) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): StoredTeachingProjectSummary[] => {
      if (!entry || typeof entry !== "object") return [];
      const raw = entry as Record<string, unknown>;
      if (
        typeof raw.id !== "string" ||
        typeof raw.title !== "string" ||
        typeof raw.updatedAt !== "string"
      ) {
        return [];
      }
      return [{
        id: raw.id,
        title: raw.title,
        artist: typeof raw.artist === "string" ? raw.artist : "",
        phraseCount:
          typeof raw.phraseCount === "number" && Number.isFinite(raw.phraseCount)
            ? raw.phraseCount
            : 0,
        updatedAt: raw.updatedAt
      }];
    });
  } catch {
    return [];
  }
}

function deserializeSafely(source: string): TeachingProject | undefined {
  try {
    return deserializeTeachingProject(source);
  } catch {
    return undefined;
  }
}

function projectStorageKey(id: string): string {
  return `${PROJECT_PREFIX}${encodeURIComponent(id)}`;
}

function slugify(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
