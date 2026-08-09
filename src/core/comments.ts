import type { Diagnostic } from "./diagnostics";
import { warning } from "./diagnostics";

export interface CommentStripResult {
  text: string;
  diagnostics: Diagnostic[];
}

export function stripConservativeComments(text: string): CommentStripResult {
  const diagnostics: Diagnostic[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inBlock) {
      if (trimmed.endsWith("/") || trimmed.includes("/")) {
        inBlock = false;
      }
      kept.push("");
      continue;
    }

    if (trimmed.startsWith("//")) {
      kept.push("");
      continue;
    }

    if (trimmed === "/") {
      inBlock = true;
      diagnostics.push(
        warning(
          "COMMENT_BLOCK_CONSERVATIVE",
          "Detected a JPW-ABC block comment delimiter on its own line. Inline /.../ comments are intentionally left untouched for lyric safety."
        )
      );
      kept.push("");
      continue;
    }

    if (trimmed.startsWith("/") && trimmed.endsWith("/") && trimmed.length > 1) {
      diagnostics.push(
        warning(
          "COMMENT_BLOCK_CONSERVATIVE",
          "Removed a conservative full-line /.../ comment. Inline block comments are TODO."
        )
      );
      kept.push("");
      continue;
    }

    kept.push(line);
  }

  return { text: kept.join("\n"), diagnostics };
}

