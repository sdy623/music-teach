import type { JianpuPhraseFrame } from "../slide/types";

export type SongSectionId =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "intro"
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "interlude"
  | "verse-2"
  | "chorus-2"
  | "bridge"
  | "refrain"
  | "outro";

export type CustomSectionId = `custom:${string}`;
export type SectionId = SongSectionId | CustomSectionId;

export type TeachingPhraseKind = "vocal" | "instrumental" | "blank";

export interface SongSectionPreset {
  id: SectionId;
  label: string;
}

export interface MorphologyToken {
  id: string;
  surface: string;
  reading: string;
  needsReview: boolean;
}

export interface MorphologyResult {
  referenceReading: string;
  tokens: MorphologyToken[];
}

export interface TeachingSectionBreak {
  phraseId: string;
  section: SectionId;
}

export interface TeachingProjectLyricCell {
  id: string;
  kind: "syllable" | "multiChar" | "extension" | "space";
  raw: string;
  display: string;
  normalizedText: string;
  tokenId?: string;
  inheritedTokenId?: string;
  slotIndex?: number;
}

export interface TeachingProjectKeyChange {
  id: string;
  slotIndex: number;
  keyOfOne: string;
  display: string;
  semitoneShift?: number;
}

export interface TeachingProjectPhrase {
  id: string;
  lyricText: string;
  referenceReading: string;
  morphology: MorphologyToken[];
  kind: TeachingPhraseKind;
  voiceLine: string;
  lyricJpwabc: string;
  lyricCells: TeachingProjectLyricCell[];
  keyOfOne: string;
  keyChanges: TeachingProjectKeyChange[];
  /** Exact rendered music frame used for lossless project round trips. */
  frame?: JianpuPhraseFrame;
  annotation: string;
  showMetronome: boolean;
  skipDuringPlayback: boolean;
}

export interface TeachingProject {
  formatVersion: 3;
  id: string;
  title: string;
  tags: string[];
  artist: string;
  lyricist: string;
  composer: string;
  arranger: string;
  otherCredits: string;
  keyAndMeters: string;
  expression: string;
  sourceLyrics: string;
  phrases: TeachingProjectPhrase[];
  sectionBreaks: TeachingSectionBreak[];
  customSections: SongSectionPreset[];
}

export interface JapaneseMorphologyProvider {
  analyze(text: string): Promise<MorphologyResult>;
}
