import type { WithDiagnostics } from "../core/diagnostics";
import { parseNameValueSection } from "./nameValue";

export interface TitleIR {
  intro?: string;
  title?: string;
  subTitle?: string;
  subTitle2?: string;
  keyAndMeters?: string;
  wordsByAndMusicBy?: string;
  expression?: string;
  linePos?: string;
  raw: Record<string, string>;
}

export interface KeyMeterMark {
  raw: string;
  keyOfOne?: string;
  numerator?: number;
  denominator?: number;
}

export interface TempoMark {
  raw: string;
  beat: "quarter";
  bpm: string;
  expressionText?: string;
}

export function parseTitle(src: string): WithDiagnostics<TitleIR> {
  const parsed = parseNameValueSection(src);
  const raw = parsed.value;
  return {
    value: {
      intro: raw.Intro,
      title: raw.Title,
      subTitle: raw.SubTitle,
      subTitle2: raw.SubTitle2,
      keyAndMeters: raw.KeyAndMeters,
      wordsByAndMusicBy: raw.WordsByAndMusicBy,
      expression: raw.Expression,
      linePos: raw.LinePos,
      raw
    },
    diagnostics: parsed.diagnostics
  };
}

export function unwrapJPWBraces(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function displayTitleText(value: string | undefined): string {
  return unwrapJPWBraces(value).replace(/\\n/g, "\n");
}

export function parseKeyAndMeterMarks(value: string | undefined): KeyMeterMark[] {
  if (!value?.trim()) return [];
  const raw = value.trim();
  const braced = [...raw.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]?.trim() ?? "").filter(Boolean);
  const chunks = braced.length ? braced : raw.split(/\s+/).map((chunk) => unwrapJPWBraces(chunk)).filter(Boolean);

  return chunks
    .map((chunk): KeyMeterMark | undefined => {
      const match = chunk.match(/^1\s*=\s*([^,\s]+)(?:\s*,\s*(\d{1,2})\s*\/\s*(\d{1,2}))?$/i);
      if (!match) {
        const meterOnly = chunk.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
        if (!meterOnly) return { raw: chunk };
        return {
          raw: chunk,
          numerator: Number(meterOnly[1]),
          denominator: Number(meterOnly[2])
        };
      }
      return {
        raw: chunk,
        keyOfOne: match[1],
        numerator: match[2] ? Number(match[2]) : undefined,
        denominator: match[3] ? Number(match[3]) : undefined
      };
    })
    .filter((mark): mark is KeyMeterMark => Boolean(mark));
}

export function formatKeyOfOneForDisplay(keyOfOne: string): string {
  const trimmed = keyOfOne.trim();
  if (trimmed.startsWith("b")) return `♭${trimmed.slice(1)}`;
  if (trimmed.startsWith("#")) return `♯${trimmed.slice(1)}`;
  if (trimmed.startsWith("n")) return `♮${trimmed.slice(1)}`;
  return trimmed;
}

export function parseTempoExpression(value: string | undefined): TempoMark | undefined {
  if (!value?.trim()) return undefined;
  const raw = displayTitleText(value);
  const match = raw.match(/^\{?\s*([Jj♪♩])\s*=\s*(\d+(?:\.\d+)?)\s*\}?\s*(.*)$/);
  if (!match) return undefined;
  const expressionText = unwrapJPWBraces(match[3]?.trim() ?? "");
  return {
    raw,
    beat: "quarter",
    bpm: match[2] ?? "",
    expressionText: expressionText || undefined
  };
}
