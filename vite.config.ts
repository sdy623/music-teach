import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@sparks-notation/core": fileURLToPath(new URL("./vendor/sparks-notation-1/packages/core", import.meta.url)),
      "@sparks-notation/util": fileURLToPath(new URL("./vendor/sparks-notation-1/packages/util", import.meta.url))
    }
  },
  optimizeDeps: {
    entries: ["index.html"]
  },
  server: {
    watch: {
      ignored: ["**/tmp/**", "**/output/**", "**/dist/**"]
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"]
  }
});
