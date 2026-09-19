import type { Accidental, BarlineEvent, NoteDecorationsIR } from "../ir/voice";
import type { Diagnostic } from "../core/diagnostics";

export type PhraseBreakStrength = 1 | 2 | 3;

export interface PhraseSourceAnchor {
  startMeasure: number;
  startNote: number;
  endMeasure: number;
  endNote: number;
  startsInsideMeasure: boolean;
  endsInsideMeasure: boolean;
}

export interface PhraseLyricCell {
  id: string;
  kind: "syllable" | "multiChar" | "extension" | "space";
  raw: string;
  display: string;
  normalizedText: string;
  tokenId?: string;
  inheritedTokenId?: string;
  eventId?: string;
}

export type PhraseSlotKind = "note" | "rest" | "rhythm" | "sustain";

export interface PhraseSlot extends NoteDecorationsIR {
  id: string;
  eventId: string;
  sourceEventId: string;
  raw: string;
  kind: PhraseSlotKind;
  measure: number;
  noteIndex: number;
  measureOffsetQuarter: number;
  durationQuarters: number;
  beatIndex: number;
  beatOffset: number;
  durationBeats: number;
  degree?: number;
  accidental?: Accidental;
  octave: number;
  underlines: number;
  dots: number;
  attack: boolean;
  tieGhost: boolean;
  context?: boolean;
  contextRole?: "before" | "after";
  lyricCell?: PhraseLyricCell;
}

export interface PhraseBeat {
  id: string;
  measure: number;
  index: number;
  startQuarter: number;
  durationQuarters: number;
  slots: PhraseSlot[];
}

export interface PhraseMeasure {
  id: string;
  number: number;
  numerator: number;
  denominator: number;
  meterChanged: boolean;
  showNumber: boolean;
  incomplete: boolean;
  beats: PhraseBeat[];
  startingBarline?: BarlineEvent["style"];
  endingBarline?: BarlineEvent["style"];
}

export interface PhraseCurve {
  id: string;
  type: "slur" | "tie" | "tuplet";
  startEventId: string;
  endEventId: string;
  label?: string;
}

export interface PhraseKeyChange {
  id: string;
  eventId: string;
  measure: number;
  noteIndex: number;
  keyOfOne: string;
  display: string;
  semitoneShift?: number;
}

export interface TeachingMark {
  id: string;
  surface: string;
  reading?: string;
  label: string;
  explanation?: string;
  tone: "grammar" | "vocabulary" | "pronunciation";
  start?: number;
  end?: number;
  color?: string;
}

export interface TeachingHighlightPalette {
  grammar?: string;
  vocabulary?: string;
  pronunciation?: string;
}

export interface TeachingTextSegment {
  id: string;
  text: string;
  mark?: TeachingMark;
  color?: string;
}

export interface TeachingRubyToken {
  id: string;
  surface: string;
  reading?: string;
  start?: number;
  end?: number;
}

export interface SongProgressSection {
  id: string;
  label: string;
  startPhrase: number;
  endPhrase: number;
}

export interface PhraseTeachingContent {
  originalText?: string;
  surface?: string;
  reading?: string;
  romaji?: string;
  translation?: string;
  rubyTokens?: TeachingRubyToken[];
  marks?: TeachingMark[];
  coachNote?: string;
}

export interface JianpuPhraseFrame {
  id: string;
  index: number;
  kind?: "vocal" | "instrumental";
  layoutDensity?: "normal" | "compact";
  /** Derived by a complete timeline projection, never by the parser. */
  instrumentalRunCaption?: string;
  sourceBlockId: string;
  title: string;
  subtitle?: string;
  keyOfOne: string;
  titleMeter: {
    numerator: number;
    denominator: number;
  };
  tempo?: string;
  expression?: string;
  lyricText: string;
  normalizedText: string;
  breakStrength: PhraseBreakStrength;
  sourceAnchor: PhraseSourceAnchor;
  lyricCells: PhraseLyricCell[];
  measures: PhraseMeasure[];
  slots: PhraseSlot[];
  curves: PhraseCurve[];
  keyChanges: PhraseKeyChange[];
  teaching?: PhraseTeachingContent;
}

export interface JianpuLessonDeck {
  id: string;
  title: string;
  subtitle?: string;
  artist?: string;
  credits?: string[];
  tags?: string[];
  phrases: JianpuPhraseFrame[];
  diagnostics: Diagnostic[];
}

export interface PhraseJoinRule {
  left: string;
  right: string;
}

export interface PhraseSplitRule {
  text: string;
  afterSlots: number[];
}

export interface PhraseAnchorRule {
  text: string;
  measure: number;
  note: number;
}

export interface BuildLessonDeckOptions {
  id?: string;
  tags?: string[];
  teachingByPhrase?: Record<number, PhraseTeachingContent>;
  minimumCells?: number;
  softBreakMode?: "every-separator" | "linguistic";
  joinSoftBreaks?: PhraseJoinRule[];
  splitPhrases?: PhraseSplitRule[];
  phraseAnchors?: PhraseAnchorRule[];
}
