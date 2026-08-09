import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@sparks-notation/core": fileURLToPath(
        new URL("./vendor/sparks-notation-1/packages/core", import.meta.url)
      ),
      "@sparks-notation/util": fileURLToPath(
        new URL("./vendor/sparks-notation-1/packages/util", import.meta.url)
      )
    }
  },
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "MusicTeach",
      formats: ["es"],
      fileName: "music-teach"
    },
    rollupOptions: {
      external: ["vue"],
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name === "style.css"
            ? "music-teach.css"
            : "[name][extname]"
      }
    }
  }
});
