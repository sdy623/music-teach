import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import { createTeachingProject } from "../src/project/projectBuilder";
import TeachingProjectStudio from "../src/project/TeachingProjectStudio.vue";
import {
  listStoredTeachingProjects,
  loadCurrentTeachingProject,
  loadTeachingProjectLocally,
  saveTeachingProjectLocally
} from "../src/project/projectStore";
import { createAppRouter } from "../src/router";

describe("local teaching project storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps each project addressable after leaving the editor", () => {
    const project = {
      ...createTeachingProject("临时教学工程", "第一句\n\n第二句"),
      id: "local-project-1",
      artist: "Test Artist"
    };

    const result = saveTeachingProjectLocally(
      project,
      window.localStorage,
      new Date("2026-08-14T12:00:00.000Z")
    );

    expect(result.ok).toBe(true);
    expect(loadTeachingProjectLocally(project.id)).toEqual(project);
    expect(loadCurrentTeachingProject()).toEqual(project);
    expect(listStoredTeachingProjects()).toEqual([
      {
        id: "local-project-1",
        title: "临时教学工程",
        artist: "Test Artist",
        phraseCount: 2,
        updatedAt: "2026-08-14T12:00:00.000Z"
      }
    ]);
  });

  it("migrates the previous single-draft storage key", () => {
    const project = {
      ...createTeachingProject("旧草稿", "歌词"),
      id: "legacy-local-project"
    };
    window.localStorage.setItem(
      "jpw-teaching-project:draft",
      JSON.stringify(project)
    );

    expect(loadCurrentTeachingProject()).toEqual(project);
    expect(loadTeachingProjectLocally(project.id)).toEqual(project);
  });

  it("saves ungenerated source lyrics before opening the project player", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/projects/new");
    await router.isReady();
    const wrapper = mount(TeachingProjectStudio, {
      global: { plugins: [router] }
    });
    await flushPromises();

    await wrapper
      .get(".project-source-field textarea")
      .setValue("まだ楽句にしていない歌詞");
    await wrapper.get(".project-header-button").trigger("click");
    await flushPromises();

    const saved = loadCurrentTeachingProject();
    expect(saved?.sourceLyrics).toBe("まだ楽句にしていない歌詞");
    expect(router.currentRoute.value).toMatchObject({
      name: "project-phrase",
      params: { projectId: saved?.id, phraseIndex: "0" }
    });
    wrapper.unmount();
  });
});
