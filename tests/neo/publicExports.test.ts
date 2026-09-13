import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as MusicTeach from "../../src/index";

describe("F0-A public compatibility", () => {
  it("adds the Neo contracts without removing representative legacy exports", () => {
    expect(MusicTeach.parseJPWABC).toBeTypeOf("function");
    expect(MusicTeach.buildLessonDeck).toBeTypeOf("function");
    expect(MusicTeach.createTeachingProject).toBeTypeOf("function");
    expect(MusicTeach.saveTeachingProjectLocally).toBeTypeOf("function");

    expect(MusicTeach.adaptTeachingProjectV3).toBeTypeOf("function");
    expect(MusicTeach.TeachingProjectV3Adapter).toMatchObject({
      id: "music-teach/teaching-project-v3-adapter",
      version: "1.0.0"
    });
    expect(MusicTeach.buildStableAnchorIndex).toBeTypeOf("function");
    expect(MusicTeach.rebaseStableAnchor).toBeTypeOf("function");
  });

  it("does not change the package entry-point map", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      module: string;
      types: string;
      exports: Record<string, unknown>;
    };

    expect(packageJson).toMatchObject({
      module: "./dist-lib/music-teach.js",
      types: "./dist-lib/types/index.d.ts",
      exports: {
        ".": {
          types: "./dist-lib/types/index.d.ts",
          import: "./dist-lib/music-teach.js"
        },
        "./style.css": "./dist-lib/music-teach.css"
      }
    });
  });
});
