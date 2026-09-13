import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const thirdPartyNotice = "/*!\n" + readFileSync(new URL("./THIRD_PARTY_NOTICES.md", import.meta.url), "utf8") + "\n*/";

export default defineConfig({
  plugins: [vue()],
  define: {
    __MUSIC_TEACH_ROUTER_MODE__: JSON.stringify("web")
  },
  resolve: {
    alias: {
      "@sparks-notation/core": fileURLToPath(new URL("./vendor/sparks-notation-1/packages/core", import.meta.url)),
      "@sparks-notation/util": fileURLToPath(new URL("./vendor/sparks-notation-1/packages/util", import.meta.url))
    }
  },
  optimizeDeps: {
    entries: ["index.html"]
  },
  build: { rolldownOptions: { output: { banner: thirdPartyNotice, comments: { legal: true } } } },
  server: {
    headers: { "Cache-Control": "no-store, max-age=0", Expires: "0", Pragma: "no-cache" },
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
