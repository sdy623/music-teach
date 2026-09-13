import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deserializeTeachingProject,
  serializeTeachingProject
} from "../../src/project/projectExport";

describe("M1 legacy v3 compatibility baseline", () => {
  it("keeps the established v3 round-trip projection equal to a fixed golden", () => {
    const sourcePath = "tests/fixtures/projects/teaching-project-v3-unknowns.json";
    const source = readFileSync(sourcePath, "utf8");
    const expected = JSON.parse(readFileSync(
      "tests/fixtures/projects/teaching-project-v3-legacy-roundtrip.golden.json",
      "utf8"
    ));

    const first = serializeTeachingProject(deserializeTeachingProject(source));
    const second = serializeTeachingProject(deserializeTeachingProject(first));

    // This freezes the old public API's existing projection, including its
    // dropped unknown fields. Neo preservation reads the original source instead.
    expect(JSON.parse(first)).toEqual(expected);
    expect(second).toBe(first);
    expect(readFileSync(sourcePath, "utf8")).toBe(source);
  });
});
