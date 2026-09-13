import { createMemoryHistory } from "vue-router";
import { describe, expect, it } from "vitest";
import { createAppRouter } from "../src/router";

describe("SPA routes", () => {
  it("opens the new library by default and retains a direct old editor entry", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    expect(router.currentRoute.value.fullPath).toBe("/library");
    await router.push("/legacy/projects/new");
    expect(router.currentRoute.value.name).toBe("legacy-project-new");
  });
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

    await router.push("/projects/local-project/edit");
    expect(router.currentRoute.value).toMatchObject({
      name: "project-edit",
      params: { projectId: "local-project" }
    });

    await router.push("/projects/local-project/phrases/2");
    expect(router.currentRoute.value).toMatchObject({
      name: "project-phrase",
      params: { projectId: "local-project", phraseIndex: "2" }
    });

    await router.push("/projects/local-project");
    expect(router.currentRoute.value.fullPath).toBe(
      "/projects/local-project/phrases/0"
    );
  });

  it("migrates old query links into canonical SPA paths", async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push("/?score=rhythm-x&phrase=10");
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe("/scores/rhythm-x/phrases/10");

    await router.push("/?score=sakura&legacy=1&edit=1");
    expect(router.currentRoute.value.fullPath).toBe("/scores/sakura");
  });
});
