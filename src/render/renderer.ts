import type { PageLayout } from "../layout/types";

export interface ScoreRenderer {
  name: string;
  renderPage(page: PageLayout): unknown;
}

export const JianpuRenderer: ScoreRenderer = {
  name: "jianpu-svg",
  renderPage: (page) => page
};

export const StaffRenderer: ScoreRenderer = {
  name: "staff-placeholder",
  renderPage: (page) => page
};

