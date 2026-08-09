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

export interface TeachingProjectPhrase {
  id: string;
  lyricText: string;
  referenceReading: string;
  morphology: MorphologyToken[];
  kind: TeachingPhraseKind;
  voiceLine: string;
  annotation: string;
  showMetronome: boolean;
  skipDuringPlayback: boolean;
}

export interface TeachingProject {
  id: string;
  title: string;
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
