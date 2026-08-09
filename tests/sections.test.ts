import { describe, expect, it } from "vitest";
import { splitSections } from "../src/core/section";

describe("splitSections", () => {
  it("normalizes case and preserves section bodies", () => {
    const result = splitSections(".title\nTitle = {A}\n.voice\n| 1 2 |\n.Words\nW1@1,1:\nあ//い\n");
    expect(result.value.Title).toContain("Title = {A}");
    expect(result.value.Voice).toContain("| 1 2 |");
    expect(result.value.Words).toContain("あ//い");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "MISSING_VOICE_SECTION")).toBe(false);
  });

  it("returns a structured error when Voice is missing", () => {
    const result = splitSections(".Title\nTitle = {A}\n");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "MISSING_VOICE_SECTION")).toBe(true);
  });
});

