import {
  createWebHashHistory,
  createRouter,
  createWebHistory,
  type LocationQueryValue,
  type RouteLocationGeneric,
  type RouterHistory
} from "vue-router";
import SlideStudio from "./slide/SlideStudio.vue";
import TeachingProjectPlayer from "./project/TeachingProjectPlayer.vue";
import TeachingProjectStudio from "./project/TeachingProjectStudio.vue";
import { findFixture } from "./demo/fixtures";
import ProjectLibraryView from "./neo/ui/ProjectLibraryView.vue";
import NewProjectView from "./neo/ui/NewProjectView.vue";
import ProjectEditRoute from "./neo/ui/ProjectEditRoute.vue";

function queryText(value: LocationQueryValue | LocationQueryValue[]): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function rootQueryRedirect(to: RouteLocationGeneric) {
  if (!["score", "phrase", "legacy", "edit"].some(key => Object.hasOwn(to.query, key))) return { name: "neo-library" };
  const scoreId = findFixture(queryText(to.query.score) || "sakura").id;
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

function defaultRouterHistory(): RouterHistory {
  return __MUSIC_TEACH_ROUTER_MODE__ === "hash"
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL);
}

export function createAppRouter(history: RouterHistory = defaultRouterHistory()) {
  return createRouter({
    history,
    routes: [
      {
        path: "/",
        name: "home",
        redirect: rootQueryRedirect
      },
      {
        path: "/library",
        name: "neo-library",
        component: ProjectLibraryView
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
        component: NewProjectView
      },
      {
        path: "/legacy/projects/new",
        name: "legacy-project-new",
        component: TeachingProjectStudio
      },
      {
        path: "/projects/:projectId/edit",
        name: "project-edit",
        component: ProjectEditRoute
      },
      {
        path: "/projects/:projectId/phrases/:phraseIndex(\\d+)",
        name: "project-phrase",
        component: TeachingProjectPlayer
      },
      {
        path: "/projects/:projectId",
        redirect: (to) => ({
          name: "project-phrase",
          params: { projectId: to.params.projectId, phraseIndex: 0 }
        })
      },
      {
        path: "/:pathMatch(.*)*",
        redirect: { name: "score", params: { scoreId: "sakura" } }
      }
    ]
  });
}

export const router = createAppRouter();
