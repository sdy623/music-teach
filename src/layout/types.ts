import type { Accidental, BarlineEvent, DurationIR, NoteDecorationsIR } from "../ir/voice";

export interface PrintLayout {
  pages: PageLayout[];
  anchors: Map<string, LayoutAnchor>;
}

export interface PageLayout {
  pageNumber: number;
  width: number;
  height: number;
  items: LayoutItem[];
}

export interface LayoutAnchor {
  pageNumber: number;
  x: number;
  y: number;
  eventId: string;
  measure?: number;
  noteIndex?: number;
}

export type LayoutItem =
  | TextItem
  | TitleKeyMeterItem
  | TempoItem
  | NoteItem
  | RestItem
  | RhythmItem
  | BarlineItem
  | MeterItem
  | LyricItem
  | DotItem
  | LineItem
  | PathItem
  | BeamItem
  | AttachmentItem
  | DiagnosticsItem;

export interface BaseLayoutItem {
  id: string;
  kind: string;
  x: number;
  y: number;
  eventId?: string;
  measure?: number;
  noteIndex?: number;
}

export interface TextItem extends BaseLayoutItem {
  kind: "text";
  text: string;
  size: number;
  anchor?: "start" | "middle" | "end";
  family?: string;
  className?: string;
}

export interface TitleKeyMeterItem extends BaseLayoutItem {
  kind: "title-key-meter";
  keyOfOne?: string;
  numerator?: number;
  denominator?: number;
  size: number;
  meterOffset: number;
  className?: string;
}

export interface TempoItem extends BaseLayoutItem {
  kind: "tempo";
  bpm: string;
  size: number;
  className?: string;
}

export interface NoteItem extends BaseLayoutItem, NoteDecorationsIR {
  kind: "note";
  degree: number;
  accidental?: Accidental;
  octave: number;
  duration: DurationIR;
  beatGroupId?: string;
  beamedUnderlineLevels?: number[];
  visualRole?: "normal" | "tie-ghost";
}

export interface RestItem extends BaseLayoutItem, NoteDecorationsIR {
  kind: "rest";
  duration: DurationIR;
  beatGroupId?: string;
  beamedUnderlineLevels?: number[];
}

export interface RhythmItem extends BaseLayoutItem, NoteDecorationsIR {
  kind: "rhythm";
  duration: DurationIR;
  beatGroupId?: string;
  beamedUnderlineLevels?: number[];
}

export interface BarlineItem extends BaseLayoutItem {
  kind: "barline";
  style: BarlineEvent["style"];
  height: number;
}

export interface MeterItem extends BaseLayoutItem {
  kind: "meter";
  numerator: number;
  denominator: number;
}

export interface LyricItem extends BaseLayoutItem {
  kind: "lyric";
  text: string;
  cellId: string;
  tokenId?: string;
  inheritedTokenId?: string;
  lyricKind: string;
}

export interface DotItem extends BaseLayoutItem {
  kind: "dot";
  r: number;
}

export interface LineItem extends BaseLayoutItem {
  kind: "line";
  x2: number;
  y2: number;
  strokeWidth: number;
  className?: string;
}

export interface PathItem extends BaseLayoutItem {
  kind: "path";
  d: string;
  strokeWidth: number;
  className?: string;
  filled?: boolean;
  curveId?: string;
  curveMode?: "arc" | "flat";
  transform?: string;
  continuedLeft?: boolean;
  continuedRight?: boolean;
}

export interface BeamItem extends BaseLayoutItem {
  kind: "beam";
  d: string;
  className?: string;
  level?: number;
  eventIds?: string[];
}

export interface AttachmentItem extends BaseLayoutItem {
  kind: "attachment";
  text: string;
  scaleX: number;
  scaleY: number;
  className?: string;
}

export interface DiagnosticsItem extends BaseLayoutItem {
  kind: "diagnostics";
  text: string;
}
