import { readFileSync } from "node:fs";
import type {
  LegacyMigrationPreview,
  ProjectRepository,
  ProjectRepositoryLock,
  ProjectRepositoryStorage
} from "../../src/neo/project/ProjectRepository";
import { parseJPWABC } from "../../src/parser/parseJPWABC";

export class MemoryStorage implements ProjectRepositoryStorage {
  readonly data = new Map<string, string>();
  failRead = false;
  failWrite: "quota" | "error" | null = null;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("Injected read failure");
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrite) {
      const error = new Error("Injected atomic write failure");
      if (this.failWrite === "quota") error.name = "QuotaExceededError";
      throw error;
    }
    this.data.set(key, value);
  }
}

/** All instances model the same browser-wide lock manager. */
export class SharedTestLock implements ProjectRepositoryLock {
  private static readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(name: string, operation: () => T): Promise<T> {
    const previous = SharedTestLock.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => { release = resolve; });
    SharedTestLock.tails.set(name, tail);
    await previous;
    try {
      return operation();
    } finally {
      release();
      if (SharedTestLock.tails.get(name) === tail) SharedTestLock.tails.delete(name);
    }
  }
}

export async function seedMigration(
  repository: ProjectRepository,
  storage: MemoryStorage,
  id = "legacy-test"
): Promise<LegacyMigrationPreview> {
  const source = JSON.parse(readFileSync(
    "tests/fixtures/projects/teaching-project-v3-unknowns.json", "utf8"
  )) as Record<string, unknown>;
  source.id = id;
  const key = `music-teach:project:v1:${encodeURIComponent(id)}`;
  storage.setItem(key, JSON.stringify(source, null, 2));
  const result = await repository.prepareLegacyMigration(key, {
    canonicalScore: {
      snapshot: parseJPWABC(`
.Title
Title = Repository synthetic score
KeyAndMeters = 1=C,4/4
.Voice
1 2 3 |
.Words
W1@1,1:
あいう
`).value,
      revision: "score-revision-1",
      verified: true
    }
  });
  if (result.status !== "preview") throw new Error(`Expected preview, got ${result.status}`);
  return result.preview;
}
