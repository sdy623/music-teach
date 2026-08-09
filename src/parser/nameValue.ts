import type { Diagnostic, WithDiagnostics } from "../core/diagnostics";
import { warning } from "../core/diagnostics";

export function parseNameValueSection(src: string): WithDiagnostics<Record<string, string>> {
  const values: Record<string, string> = {};
  const diagnostics: Diagnostic[] = [];

  for (const rawLine of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    const eq = rawLine.indexOf("=");
    if (eq < 0) {
      diagnostics.push(warning("NAME_VALUE_IGNORED_LINE", "Ignored non Name-Value line.", rawLine));
      continue;
    }

    const key = rawLine.slice(0, eq).trim();
    const value = rawLine.slice(eq + 1).trim();
    if (!key) {
      diagnostics.push(warning("NAME_VALUE_EMPTY_KEY", "Ignored Name-Value line with an empty key.", rawLine));
      continue;
    }
    values[key] = value;
  }

  return { value: values, diagnostics };
}

