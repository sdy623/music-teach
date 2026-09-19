import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { expect, it, vi } from "vitest";
import { ImportService } from "../../src/neo/library/ImportService";
import { IndexedDbProjectRepository } from "../../src/neo/library/IndexedDbProjectRepository";
import { LibraryService } from "../../src/neo/library/LibraryService";
import type { JianpuPhraseFrame } from "../../src/slide/types";
import { MemoryProjectDatabase, arrayBuffer } from "./m2TestSupport";

it("preserves new notation and complete accompaniment captions through M2 import and reopen", async () => {
  vi.stubGlobal("crypto", webcrypto);
  try {
    const database = new MemoryProjectDatabase();
    const repository = new IndexedDbProjectRepository(database);
    const imports = new ImportService(repository);
    const bytes = arrayBuffer(readFileSync("public/fixtures/notation-reference.jpwabc"));
    const preview = await imports.prepare({ filename: "notation-reference.jpwabc", bytes });
    expect(database.records.size).toBe(0);
    const document = await imports.commit(preview.token);
    const freshRepository = new IndexedDbProjectRepository(database);
    const reopened = await freshRepository.get(document.project.id);
    expect(reopened).toEqual(document);
    const service = new LibraryService(freshRepository);
    const frame = await service.run({ method: "frame", id: document.project.id, revision: 1, index: 5 }) as JianpuPhraseFrame;
    expect(frame.curves.some(curve => curve.type === "tuplet")).toBe(true);
    expect(frame.slots.find(slot => slot.graceNotes?.length)?.ornaments).toEqual(["fermata"]);
    for (const index of [7, 8, 9]) {
      const interlude = await service.run({ method: "frame", id: document.project.id, revision: 1, index }) as JianpuPhraseFrame;
      expect(interlude.instrumentalRunCaption).toBe("伴奏 22.5 秒 · 9 小节");
    }
    // Projection metadata must not mutate the persisted musical authority.
    expect(await freshRepository.get(document.project.id)).toEqual(document);
  } finally { vi.unstubAllGlobals(); }
});
