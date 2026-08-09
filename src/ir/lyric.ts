import type { AnchorRef } from "./voice";

export type LyricCellKind = "syllable" | "extension" | "multiChar" | "separator" | "space";

export interface LyricCell {
  id: string;
  kind: LyricCellKind;
  raw: string;
  display: string;
  consumesNoteSlot: boolean;
  skipSlots?: number;
  normalizedText?: string;
  inheritedTokenId?: string;
  tokenId?: string;
}

export interface LyricBlock {
  id: string;
  track: number;
  repeat?: string;
  showNumber?: boolean;
  anchor: AnchorRef;
  rawText: string;
  cells: LyricCell[];
  normalizedText: string;
}

export interface LyricAlignment {
  cellId: string;
  eventId: string;
  measure: number;
  noteIndex: number;
}

export interface LyricLayer {
  id: string;
  lang: "ja-kana" | "ja-romaji" | "en-translation" | string;
  source: "words" | "demo" | "external";
  cells: LyricCell[];
  alignments: LyricAlignment[];
}
