import type { WithDiagnostics } from "../core/diagnostics";
import { parseNameValueSection } from "./nameValue";

export interface FontIR {
  key: string;
  raw: string;
  family: string;
  sizeMm?: number;
}

export interface FontsIR {
  raw: Record<string, string>;
  fonts: Record<string, FontIR>;
}

export function parseFonts(src: string): WithDiagnostics<FontsIR> {
  const parsed = parseNameValueSection(src);
  const fonts: Record<string, FontIR> = {};

  for (const [key, raw] of Object.entries(parsed.value)) {
    const [familyRaw, sizeRaw] = raw.split(",").map((part) => part.trim());
    fonts[key] = {
      key,
      raw,
      family: mapFontFamily(familyRaw),
      sizeMm: Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : undefined
    };
  }

  return {
    value: { raw: parsed.value, fonts },
    diagnostics: parsed.diagnostics
  };
}

export function mapFontFamily(raw: string): string {
  if (!raw) return "system-ui, sans-serif";
  if (raw.includes("微软雅黑")) return "system-ui, sans-serif";
  if (raw.includes("楷体") || raw.includes("仿宋")) return "serif";
  if (/arial/i.test(raw)) return "Arial, sans-serif";
  return `system-ui, "Noto Sans CJK JP", "Yu Gothic", sans-serif`;
}

