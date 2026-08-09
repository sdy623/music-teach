import {
  createRouter,
  createWebHistory,
  type LocationQueryValue,
  type RouteLocationGeneric,
  type RouterHistory
} from "vue-router";
import LegacyRendererApp from "./legacy/LegacyRendererApp.vue";
import SlideStudio from "./slide/SlideStudio.vue";
import TeachingProjectStudio from "./project/TeachingProjectStudio.vue";
import { findFixture } from "./demo/fixtures";

function queryText(value: LocationQueryValue | LocationQueryValue[]): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function legacyQueryRedirect(to: RouteLocationGeneric) {
  const scoreId = findFixture(queryText(to.query.score) || "sakura").id;
  if (queryText(to.query.legacy) === "1") {
    return {
      name: queryText(to.query.edit) === "1" ? "legacy-edit" : "legacy",
      params: { scoreId },
      query: {
        ...(queryText(to.query.phrase) === "1" ? { phrase: "1" } : {})
      }
    };
  }

  const phrase = queryText(to.query.phrase);
  if (/^\d+$/.test(phrase)) {
    return {
      name: "phrase",
      params: { scoreId, phraseIndex: phrase },
      query: {}
    };
  }
  return { name: "score", params: { scoreId }, query: {} };
}

export function createAppRouter(history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) {
  return createRouter({
    history,
    routes: [
      {
        path: "/",
        name: "home",
        redirect: legacyQueryRedirect
      },
      {
        path: "/scores/:scoreId",
        name: "score",
        component: SlideStudio
      },
      {
        path: "/scores/:scoreId/sections",
        name: "score-sections",
        component: SlideStudio
      },
      {
        path: "/scores/:scoreId/phrases/:phraseIndex(\\d+)",
        name: "phrase",
        component: SlideStudio
      },
      {
        path: "/projects/new",
        name: "project-new",
        component: TeachingProjectStudio
      },
      {
        path: "/legacy/:scoreId/edit",
        name: "legacy-edit",
        component: LegacyRendererApp
      },
      {
        path: "/legacy/:scoreId",
        name: "legacy",
        component: LegacyRendererApp
      },
      {
        path: "/:pathMatch(.*)*",
        redirect: { name: "score", params: { scoreId: "sakura" } }
      }
    ]
  });
}

export const router = createAppRouter();
