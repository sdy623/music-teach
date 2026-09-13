import { defineConfig, mergeConfig } from "vite";
import portableConfig from "./vite.portable.config.ts";

export default mergeConfig(
  portableConfig,
  defineConfig({
    build: {
      outDir: "dist-pages"
    }
  })
);
