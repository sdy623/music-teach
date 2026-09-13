import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

await writeFile(
  resolve("dist-cloudflare", "_redirects"),
  "/* /index.html 200\n",
  "utf8"
);
