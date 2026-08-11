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

export type TitleCreditRole =
  | "lyrics-music"
  | "lyrics"
  | "music"
  | "arrangement"
  | "vocals"
  | "other";

export interface TitleCredit {
  name: string;
  role: TitleCreditRole;
  roleLabel: string;
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

export function parseTitleCredits(value: string | undefined): TitleCredit[] {
  const raw = displayTitleText(value);
  return splitTopLevelValues(raw).flatMap((sourcePart): TitleCredit[] => {
    const part = sourcePart.trim();
    const matched = part.match(
      /^\{?(.+?)\}?\s*(词曲|詞曲|作词|作詞|作曲|编曲|編曲|演唱|歌手|vocal)$/i
    );
    if (!matched) return [];
    const name = unwrapJPWBraces(matched[1]?.trim());
    const sourceRole = matched[2] ?? "";
    if (!name) return [];
    const role = titleCreditRole(sourceRole);
    return [{ name, role, roleLabel: titleCreditRoleLabel(role) }];
  });
}

export function parseTitleTags(title: TitleIR): string[] {
  const source = [title.raw.Tags, title.raw.Genre, title.raw.Style]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(",");
  return uniqueTextValues(
    splitTopLevelValues(displayTitleText(source)).flatMap((part) =>
      unwrapJPWBraces(part)
        .split(/[、/;；|]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
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

function splitTopLevelValues(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of raw) {
    if (character === "{") depth += 1;
    if (character === "}") depth = Math.max(0, depth - 1);
    if ((character === "," || character === "，" || character === "\n") && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function titleCreditRole(source: string): TitleCreditRole {
  const normalized = source.toLocaleLowerCase();
  if (normalized === "词曲" || normalized === "詞曲") return "lyrics-music";
  if (normalized === "作词" || normalized === "作詞") return "lyrics";
  if (normalized === "作曲") return "music";
  if (normalized === "编曲" || normalized === "編曲") return "arrangement";
  if (normalized === "演唱" || normalized === "歌手" || normalized === "vocal") return "vocals";
  return "other";
}

function titleCreditRoleLabel(role: TitleCreditRole): string {
  if (role === "lyrics-music") return "词曲";
  if (role === "lyrics") return "作词";
  if (role === "music") return "作曲";
  if (role === "arrangement") return "编曲";
  if (role === "vocals") return "演唱";
  return "";
}

function uniqueTextValues(values: string[]): string[] {
  return [...new Set(values)];
}
