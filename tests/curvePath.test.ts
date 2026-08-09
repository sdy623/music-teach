import { describe, expect, it } from "vitest";
import { roundedArcPath, roundedTupletArcPaths } from "../src/slide/curvePath";

const curve = {
  x1: 20,
  x2: 180,
  centerX: 100,
  baseY: 92,
  apexY: 76
};

describe("engraved phrase curves", () => {
  it("uses a broad cubic shoulder instead of a pointed quadratic arch", () => {
    const path = roundedArcPath(curve);

    expect(path).toContain(" C ");
    expect(path).not.toContain(" Q ");
    expect(path).toContain("64.8 76");
    expect(path).toContain("135.2 76");
  });

  it("leaves a centered label gap in a tuplet arc", () => {
    const [left, right] = roundedTupletArcPaths(curve);

    expect(left).toMatch(/^M 20 92 C /);
    expect(left).toMatch(/83 76$/);
    expect(right).toMatch(/^M 117 76 C /);
    expect(right).toMatch(/180 92$/);
  });
});
