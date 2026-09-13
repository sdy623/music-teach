import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    base: "./",
    define: {
      __MUSIC_TEACH_ROUTER_MODE__: JSON.stringify("hash")
    },
    build: {
      outDir: "dist-webview"
    }
  })
);
