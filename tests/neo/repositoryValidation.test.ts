import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { adaptTeachingProjectV3 } from "../../src/neo/project/teachingProjectV3Adapter";
import { createDeterministicFingerprint } from "../../src/neo/project/fingerprint";
import {
  RepositoryValidationError,
  assertRepositoryProject,
  cloneRepositoryJson
} from "../../src/neo/project/repositoryValidation";
import type { MusicProjectV1 } from "../../src/neo/project/types";
import { parseJPWABC } from "../../src/parser/parseJPWABC";
import { decodeJPWABC } from "../../src/core/decode";

function project(): MusicProjectV1 {
  const source: unknown = JSON.parse(readFileSync("tests/fixtures/projects/teaching-project-v3-unknowns.json", "utf8"));
  const score = parseJPWABC(".Title\nTitle = Repository\nKeyAndMeters = 1=C,4/4\n.Voice\n1 2 3 |\n.Words\nW1@1,1:\nあいう\n").value;
  const candidate = adaptTeachingProjectV3(source, {
    canonicalScore: { snapshot: score, revision: "score-1", verified: true }
  }).candidate;
  if (!candidate) throw new Error("Expected a migration candidate.");
  return cloneRepositoryJson(candidate);
}

function withPayload(payload: unknown): unknown {
  return { evidence: [{ payload }] };
}

describe("cloneRepositoryJson", () => {
  it("copies every nested payload, repeated reference and unknown field without sharing input aliases", () => {
    const nested = { choices: [{ selected: false }], text: "日本語", future: null };
    const source = { evidence: [{ payload: nested }], proposals: [{ payload: nested }], extensions: nested };
    Object.freeze(nested);
    const copied = cloneRepositoryJson(source);
    expect(copied).toEqual(source);
    copied.evidence[0]!.payload.choices[0]!.selected = true;
    expect(source.evidence[0]!.payload.choices[0]!.selected).toBe(false);
    expect(copied.proposals[0]!.payload.choices[0]!.selected).toBe(false);
    source.extensions.choices.push({ selected: false });
    expect(copied.extensions.choices).toHaveLength(1);
  });

  it("preserves null-prototype input and an own __proto__ as inert JSON data", () => {
    const source = Object.assign(Object.create(null) as Record<string, unknown>, { ordinary: 1 });
    Object.defineProperty(source, "__proto__", { value: { future: true }, enumerable: true });
    const copied = cloneRepositoryJson(source);
    expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
    expect(Object.hasOwn(copied, "__proto__")).toBe(true);
    expect(copied.__proto__).toEqual({ future: true });
    expect(Object.hasOwn(copied, "future")).toBe(false);
    expect(JSON.parse(JSON.stringify(copied))).toEqual(copied);
  });

  it.each([
    ["undefined", undefined], ["NaN", NaN], ["Infinity", Infinity], ["negative infinity", -Infinity],
    ["negative zero", -0], ["bigint", 1n], ["function", () => 1], ["symbol", Symbol("payload")],
    ["Map", new Map([["id", 1]])], ["Set", new Set([1])], ["Date", new Date(0)],
    ["typed array", new Uint8Array([1])], ["custom prototype", Object.create({ inherited: true })]
  ])("rejects %s inside an unknown evidence payload with its path", (_label, payload) => {
    expect(() => cloneRepositoryJson(withPayload(payload))).toThrow(RepositoryValidationError);
    try { cloneRepositoryJson(withPayload(payload)); } catch (error) {
      expect((error as RepositoryValidationError).path).toBe("/evidence/0/payload");
    }
  });

  it("rejects undefined at the root, in object fields, and in arrays", () => {
    for (const value of [undefined, { future: undefined }, [undefined]]) {
      expect(() => cloneRepositoryJson(value)).toThrow(RepositoryValidationError);
    }
  });

  it("rejects cycles, sparse arrays, named arrays, array subclasses, hidden and symbol properties", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const named: unknown[] & { future?: number } = [1];
    named.future = 2;
    const hidden = Object.defineProperty({}, "future", { value: 3, enumerable: false });
    const hiddenArray = Object.defineProperty([1], "0", { value: 1, enumerable: false });
    class ExtraArray extends Array<number> {}
    const symbol = { [Symbol("future")]: 1 };
    for (const value of [cycle, new Array(1), named, hidden, hiddenArray, new ExtraArray(1), symbol]) {
      expect(() => cloneRepositoryJson(withPayload(value))).toThrow(RepositoryValidationError);
    }
  });

  it("rejects accessors and toJSON hooks without executing them", () => {
    const getter = vi.fn(() => 1);
    const toJSON = vi.fn(() => ({ lost: true }));
    const object = Object.defineProperty({}, "future", { get: getter, enumerable: true });
    const array = Object.defineProperty([1], "0", { get: getter, enumerable: true });
    for (const value of [object, array, { toJSON }]) {
      expect(() => cloneRepositoryJson(withPayload(value))).toThrow(RepositoryValidationError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("escapes property names in diagnostic JSON pointers", () => {
    try { cloneRepositoryJson({ "a/b~c": undefined }); } catch (error) {
      expect((error as RepositoryValidationError).path).toBe("/a~1b~0c");
    }
  });
});

describe("assertRepositoryProject", () => {
  it.each(["sakura.jpwabc", "notation-reference.jpwabc"])("accepts the redistributable score fixture %s through the preservation adapter", (file) => {
    const bytes = readFileSync(`public/fixtures/${file}`);
    const source = decodeJPWABC(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const legacy: unknown = JSON.parse(readFileSync("tests/fixtures/projects/teaching-project-v3-unknowns.json", "utf8"));
    const migration = adaptTeachingProjectV3(legacy, {
      canonicalScore: { snapshot: parseJPWABC(source).value, revision: "complete-score-1", verified: true }
    });
    expect(migration.lifecycle.commitEligibility).toBe("eligible");
    expect(() => assertRepositoryProject(cloneRepositoryJson(migration.candidate))).not.toThrow();
  });

  it("accepts the F0-A candidate, leaves all unknowns intact, and does not treat an old revision hash as an edit validator", () => {
    const value = project();
    value.metadata.title = "Edited after preview";
    value.extensions.future = { nested: [1, "残す", { value: true }] };
    const before = JSON.stringify(value);
    expect(() => assertRepositoryProject(value)).not.toThrow();
    expect(JSON.stringify(value)).toBe(before);
  });

  it.each(["schema", "version", "id", "revision", "revisionFingerprint", "createdAt", "updatedAt", "metadata", "score", "lyricLayers", "lesson", "timeline", "assets", "evidence", "proposals", "provenance", "diagnostics", "extensions"])("requires the aggregate field %s", (key) => {
    const value = project() as unknown as Record<string, unknown>;
    delete value[key];
    expect(() => assertRepositoryProject(value)).toThrow(RepositoryValidationError);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid project revision %s", (revision) => {
    const value = project();
    value.revision = revision;
    expect(() => assertRepositoryProject(value)).toThrow(RepositoryValidationError);
  });

  it("requires canonical ScoreIR and consistent embedded identity and fingerprint", () => {
    const corruptions: ((value: MusicProjectV1) => void)[] = [
      value => { value.score.availability = "unavailable"; },
      value => { value.score.snapshot = null; },
      value => { value.score.source.kind = "legacy-unresolved"; },
      value => { value.score.source.revision = "wrong"; },
      value => { value.score.source.fingerprint = "wrong"; },
      value => { value.score.snapshotFingerprint = "wrong"; },
      value => { value.score.revision = " "; },
      value => { value.score.source.id = ""; }
    ];
    for (const corrupt of corruptions) {
      const value = project();
      corrupt(value);
      expect(() => assertRepositoryProject(value)).toThrow(RepositoryValidationError);
    }
  });

  it("allows independently versioned external ScoreIR provenance", () => {
    const value = project();
    value.score.source = { kind: "external-score-ir", id: "source", revision: "source-original-4", fingerprint: "source-content", extensions: {} };
    expect(() => assertRepositoryProject(value)).not.toThrow();
  });

  it.each([
    ["degree", 8], ["octave", 0.5], ["duration", { underlines: -1, dashes: 0, dots: 0 }],
    ["kind", "legacy-frame"], ["position", "0"], ["lyricAlignable", false]
  ])("rejects malformed ScoreIR events even with a recomputed fingerprint (%s)", (key, field) => {
    const value = project();
    const event = value.score.snapshot!.value.voices[0]!.events[0]! as unknown as Record<string, unknown>;
    event[key] = field;
    value.score.snapshotFingerprint = createDeterministicFingerprint(value.score.snapshot);
    value.score.source.fingerprint = value.score.snapshotFingerprint;
    expect(() => assertRepositoryProject(value)).toThrow(RepositoryValidationError);
  });

  it.each(["title", "options", "fonts", "page", "voices", "lyrics", "lyricAlignments", "lyricLayers", "attachments", "semantic", "diagnostics"])("requires canonical ScoreIR field %s", key => {
    const value = project();
    delete (value.score.snapshot!.value as unknown as Record<string, unknown>)[key];
    value.score.snapshotFingerprint = createDeterministicFingerprint(value.score.snapshot);
    value.score.source.fingerprint = value.score.snapshotFingerprint;
    expect(() => assertRepositoryProject(value)).toThrow(RepositoryValidationError);
  });

  it("checks evidence/proposal/provenance/diagnostic structure while retaining arbitrary JSON payloads", () => {
    const value = project();
    value.evidence.push({ id: "e-1", kind: "analysis", scoreRevision: "score-1", status: "candidate", sourceFingerprint: "input", payload: { nested: [null, { future: true }] }, provenanceIds: [value.provenance[0]!.id], extensions: {} });
    value.proposals.push({ id: "p-1", kind: "word", scoreRevision: "score-1", status: "proposed", inputFingerprint: "input", provider: { id: "local", version: "1" }, payload: { choices: [{ value: 3 }] }, provenanceIds: [], extensions: {} });
    expect(() => assertRepositoryProject(value)).not.toThrow();
    const brokenEvidence = cloneRepositoryJson(value);
    (brokenEvidence.evidence[0] as unknown as Record<string, unknown>).status = "silently-approved";
    const brokenProposal = cloneRepositoryJson(value);
    (brokenProposal.proposals[0]!.provider as unknown as Record<string, unknown>).version = 1;
    const brokenProvenance = cloneRepositoryJson(value);
    (brokenProvenance.provenance[0] as unknown as Record<string, unknown>).sourceFingerprint = null;
    const brokenDiagnostic = cloneRepositoryJson(value);
    brokenDiagnostic.diagnostics.push({ id: "d", code: "RANGE", message: "bad range", severity: "error", source: "storage", sourceRange: { start: 4, end: 2 } });
    for (const broken of [brokenEvidence, brokenProposal, brokenProvenance, brokenDiagnostic]) {
      expect(() => assertRepositoryProject(broken)).toThrow(RepositoryValidationError);
    }
  });
});
