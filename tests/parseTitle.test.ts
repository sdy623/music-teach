import { describe, expect, it } from "vitest";
import {
  formatKeyOfOneForDisplay,
  parseKeyAndMeterMarks,
  parseTempoExpression,
  parseTitleCredits
} from "../src/parser/parseTitle";

describe("parseTitle helpers", () => {
  it("parses JPW key and stacked-meter marks", () => {
    const marks = parseKeyAndMeterMarks("{1=bA,4/4}");
    expect(marks[0]).toMatchObject({
      keyOfOne: "bA",
      numerator: 4,
      denominator: 4
    });
    expect(formatKeyOfOneForDisplay("bA")).toBe("♭A");
  });

  it("parses tempo plus expression text after a braced JPW tempo mark", () => {
    expect(parseTempoExpression("{J=73}  深情地")).toMatchObject({
      bpm: "73",
      expressionText: "深情地"
    });
  });

  it("parses nested JPW credit braces into songwriter and vocalist roles", () => {
    expect(parseTitleCredits("{{山田太郎}词曲,{教学合唱团}演唱　}")).toEqual([
      {
        name: "山田太郎",
        role: "lyrics-music",
        roleLabel: "词曲"
      },
      {
        name: "教学合唱团",
        role: "vocals",
        roleLabel: "演唱"
      }
    ]);
  });
});
