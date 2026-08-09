import type { WithDiagnostics } from "../core/diagnostics";
import { parseNameValueSection } from "./nameValue";

export interface OptionsIR {
  raw: Record<string, string>;
  horzSpacingGap?: string;
  horzSpacingAW?: string;
}

export function parseOptions(src: string): WithDiagnostics<OptionsIR> {
  const parsed = parseNameValueSection(src);
  return {
    value: {
      raw: parsed.value,
      horzSpacingGap: parsed.value.HorzSpacing_Gap,
      horzSpacingAW: parsed.value.HorzSpacing_AW
    },
    diagnostics: parsed.diagnostics
  };
}

