import { describe, expect, it } from "vitest";
import { parseAttachments } from "../src/parser/attachmentsParser";
import { detectKeyChanges } from "../src/semantic/detectKeyChanges";

describe("attachments parser", () => {
  it("parses text attachments and detects key changes", () => {
    const parsed = parseAttachments("Text@21,6(0.65,-2.07) = AttachText1, 转{1=E},{0.8,0.8}\nText@32R(3.52,-2.54) = AttachText1, 转{1=D},{0.8,0.8}");
    expect(parsed.value).toHaveLength(2);
    expect(parsed.value[0]?.type).toBe("text");
    expect(parsed.value[0]?.type === "text" ? parsed.value[0].contentDisplay : "").toBe("转1=E");
    expect(detectKeyChanges(parsed.value).map((event) => event.keyOfOne)).toEqual(["E", "D"]);
  });
});

