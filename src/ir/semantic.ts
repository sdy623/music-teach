import type { AttachmentAnchor } from "./attachment";

export interface SlurCurve {
  id: string;
  type: "slur" | "tie" | "tuplet";
  startEventId: string;
  endEventId: string;
  label?: string;
}

export interface KeyChangeEvent {
  id: string;
  source: "attachment-text" | "standard-text";
  keyOfOne: string;
  anchor: AttachmentAnchor;
  display: string;
}

export interface ReadingOverride {
  anchor: { bar: number; slot: number };
  surface: string;
  reading: string;
  readingType: "jukujikun" | "ateji" | "lyric_reading" | "name_reading";
  morae: string[];
  meaning?: string;
  noteAlignment?: number[];
}

export interface SemanticInfo {
  slurs: SlurCurve[];
  keyChanges: KeyChangeEvent[];
  readingOverrides: ReadingOverride[];
}

