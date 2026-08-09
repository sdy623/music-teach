import { createMemoryHistory } from "vue-router";
import { describe, expect, it } from "vitest";
import { createAppRouter } from "../src/router";

describe("SPA routes", () => {
  it("uses path routes for slides, section maps, and project creation", async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push("/scores/sakura");
    await router.isReady();
    expect(router.currentRoute.value).toMatchObject({
      name: "score",
      params: { scoreId: "sakura" }
    });

    await router.push("/scores/sakura/phrases/3");
    expect(router.currentRoute.value).toMatchObject({
      name: "phrase",
      params: { scoreId: "sakura", phraseIndex: "3" }
    });

    await router.push("/scores/sakura/sections");
    expect(router.currentRoute.value).toMatchObject({
      name: "score-sections",
      params: { scoreId: "sakura" }
    });

    await router.push("/projects/new");
    expect(router.currentRoute.value.name).toBe("project-new");
  });

  it("migrates old query links into canonical SPA paths", async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push("/?score=rhythm-x&phrase=10");
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe("/scores/rhythm-x/phrases/10");

    await router.push("/?score=sakura&legacy=1&edit=1");
    expect(router.currentRoute.value.fullPath).toBe("/legacy/sakura/edit");
  });
});
