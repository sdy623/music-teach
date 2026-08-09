export interface DurationIR {
  underlines: number;
  dashes: number;
  dots: number;
}

export type Accidental = "sharp" | "flat" | "natural";

export interface BaseEvent {
  id: string;
  raw: string;
  kind: string;
  position: number;
  measure?: number;
  noteIndex?: number;
}

export interface NoteEvent extends BaseEvent {
  kind: "note";
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  accidental?: Accidental;
  octave: number;
  duration: DurationIR;
  pitchKey: string;
  attack: boolean;
  lyricAlignable: true;
  tieGroupId?: string;
  tieRole?: "start" | "continue" | "end" | "single";
  visualRole?: "normal" | "tie-ghost";
}

export interface RestEvent extends BaseEvent {
  kind: "rest";
  duration: DurationIR;
  attack: false;
  lyricAlignable: false;
}

export interface RhythmEvent extends BaseEvent {
  kind: "rhythm";
  duration: DurationIR;
  pitchKey: null;
  lyricAlignable: true;
  semantic?: "rap" | "spoken" | "percussion" | "chant";
}

export interface BarlineEvent extends BaseEvent {
  kind: "barline";
  style: "single" | "double" | "end" | "start-repeat" | "end-repeat" | "start" | "unknown";
}

export interface MeterEvent extends BaseEvent {
  kind: "meter";
  numerator: number;
  denominator: number;
}

export interface StandardTextEvent extends BaseEvent {
  kind: "standardText";
  text: string;
}

export interface ReturnEvent extends BaseEvent {
  kind: "return";
}

export interface SlurMarkerEvent extends BaseEvent {
  kind: "slurMarker";
  role: "start" | "end";
}

export interface TupletMarkerEvent extends BaseEvent {
  kind: "tupletMarker";
  count: number;
}

export interface VoltaMarkerEvent extends BaseEvent {
  kind: "voltaMarker";
  number: number;
}

export interface UnknownEvent extends BaseEvent {
  kind: "unknown";
  reason: string;
}

export type VoiceEvent =
  | NoteEvent
  | RestEvent
  | RhythmEvent
  | BarlineEvent
  | MeterEvent
  | StandardTextEvent
  | ReturnEvent
  | SlurMarkerEvent
  | TupletMarkerEvent
  | VoltaMarkerEvent
  | UnknownEvent;

export interface MeasureIR {
  number: number;
  events: VoiceEvent[];
  noteLikeCount: number;
  naturalWidth: number;
}

export interface AnchorRef {
  measure: number;
  note: number;
}

export interface VoiceIR {
  id: string;
  events: VoiceEvent[];
  measures: MeasureIR[];
  anchors: Map<string, string>;
}

export function emptyDuration(): DurationIR {
  return { underlines: 0, dashes: 0, dots: 0 };
}

export function pitchKeyOf(degree: number, accidental: Accidental | undefined, octave: number): string {
  const acc = accidental === "sharp" ? "#" : accidental === "flat" ? "b" : accidental === "natural" ? "n" : "";
  return `${acc}${degree}@${octave}`;
}
