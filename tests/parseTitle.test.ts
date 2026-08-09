import { describe, expect, it } from "vitest";
import { formatKeyOfOneForDisplay, parseKeyAndMeterMarks, parseTempoExpression } from "../src/parser/parseTitle";

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
});
