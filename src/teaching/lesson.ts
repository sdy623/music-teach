import type { ScoreIR } from "../ir/score";

export interface JapaneseGrammarMark {
  id: string;
  surface: string;
  label: string;
  explanation?: string;
  reading?: string;
}

export interface JapaneseVocabularyMark {
  id: string;
  surface: string;
  reading?: string;
  meaning: string;
  pos?: string;
}

export interface LessonOriginalAnchor {
  measure: number;
  note?: number;
  beat?: number;
  startsInsideMeasure?: boolean;
  endsInsideMeasure?: boolean;
}

export interface JpwLessonPhrase {
  id: string;
  title?: string;
  sourceText?: string;
  score?: ScoreIR;
  originalAnchor?: LessonOriginalAnchor;
  lyricText?: string;
  reading?: string;
  translation?: string;
  grammar?: JapaneseGrammarMark[];
  vocabulary?: JapaneseVocabularyMark[];
  notes?: string[];
}

export interface PhraseJPWABCParts {
  title?: string;
  intro?: string;
  subTitle?: string;
  keyAndMeters?: string;
  expression?: string;
  voice: string;
  words?: string;
  lyricStart?: "phrase-start" | { measure: number; note: number };
  originalAnchor?: LessonOriginalAnchor;
  wordsAnchor?: { measure: number; note: number };
  attachments?: string;
}

export function buildPhraseJPWABC(parts: PhraseJPWABCParts): string {
  const wordsAnchor = resolveLyricStart(parts);
  const sections = [
    ".Options",
    "HorzSpacing_Gap = 0.00, 1.00, 0.70, 1.00, 0.50",
    "",
    ".Fonts",
    "Title = Arial, 7.50",
    "",
    ".Title",
    `Intro = ${braceText(parts.intro ?? "")}`,
    `Title = ${braceText(parts.title ?? "")}`,
    `SubTitle = ${braceText(parts.subTitle ?? "")}`,
    `KeyAndMeters = ${braceText(parts.keyAndMeters ?? "1=C,4/4")}`,
    `Expression = ${braceText(parts.expression ?? "")}`,
    "",
    ".Voice",
    parts.voice.trim(),
    "",
    ".Words",
    parts.words?.trim() ? `W1@${wordsAnchor.measure},${wordsAnchor.note}:\n${parts.words.trim()}` : "",
    "",
    ".Attachments",
    parts.attachments?.trim() ?? "",
    "",
    ".Page",
    ""
  ];

  return sections.join("\n");
}

function resolveLyricStart(parts: PhraseJPWABCParts): { measure: number; note: number } {
  if (parts.lyricStart && parts.lyricStart !== "phrase-start") return parts.lyricStart;
  return parts.wordsAnchor ?? { measure: 1, note: 1 };
}

function braceText(text: string): string {
  const trimmed = text.trim();
  return trimmed ? `{${trimmed}}` : "";
}
