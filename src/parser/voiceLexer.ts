import type { Diagnostic, WithDiagnostics } from "../core/diagnostics";
import { warning } from "../core/diagnostics";
import type {
  Accidental,
  BarlineEvent,
  DurationIR,
  MeterEvent,
  NoteEvent,
  RestEvent,
  ReturnEvent,
  RhythmEvent,
  SlurMarkerEvent,
  StandardTextEvent,
  TupletMarkerEvent,
  VoltaMarkerEvent,
  UnknownEvent,
  VoiceEvent
} from "../ir/voice";
import { pitchKeyOf } from "../ir/voice";

let eventCounter = 0;

export function lexVoice(src: string): WithDiagnostics<VoiceEvent[]> {
  eventCounter = 0;
  const diagnostics: Diagnostic[] = [];
  const events: VoiceEvent[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i] ?? "";

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "{") {
      const brace = readBraced(src, i);
      const raw = brace.raw;
      const match = raw.match(/^\{\((\d+)\}$/);
      if (match) {
        events.push(makeTuplet(raw, i, Number(match[1])));
      } else if (/^\{BaoChiYin\}$/i.test(raw)) {
        events.push(makeUnknown(raw, i, "Known JPW hold-sound directive"));
      } else if (!brace.closed) {
        events.push(makeUnknown(raw, i, "Unterminated brace construct"));
        diagnostics.push(
          warning(
            "VOICE_UNTERMINATED_BRACE",
            "Stopped an unterminated brace construct at the local recovery boundary.",
            raw
          )
        );
      } else {
        events.push(makeUnknown(raw, i, "Unsupported brace construct"));
        diagnostics.push(
          warning("VOICE_UNSUPPORTED_BRACE", "Kept unsupported brace construct as UnknownEvent.", raw)
        );
      }
      i += raw.length;
      continue;
    }

    const volta = readVoltaMarker(src, i);
    if (volta) {
      events.push(makeVoltaMarker(volta.raw, i, volta.number));
      i += volta.raw.length;
      continue;
    }

    if (ch === "[" && !src.startsWith("[|", i)) {
      const bracket = readBracketed(src, i);
      events.push(
        makeUnknown(
          bracket.raw,
          i,
          bracket.closed ? "Unsupported chord construct" : "Unterminated chord construct"
        )
      );
      diagnostics.push(
        warning(
          bracket.closed ? "VOICE_UNSUPPORTED_CHORD" : "VOICE_UNTERMINATED_CHORD",
          bracket.closed
            ? "Kept unsupported chord construct as UnknownEvent."
            : "Stopped an unterminated chord construct at the local recovery boundary.",
          bracket.raw
        )
      );
      i += bracket.raw.length;
      continue;
    }

    if (ch === '"') {
      const parsed = readQuoted(src, i);
      events.push(makeStandardText(parsed.raw, i, parsed.text));
      if (!parsed.closed) {
        diagnostics.push(
          warning(
            "VOICE_UNTERMINATED_TEXT",
            "Stopped unterminated standard text at the end of its source line.",
            parsed.raw
          )
        );
      }
      i += parsed.raw.length;
      continue;
    }

    if (ch === "$") {
      const parsed = readReturn(src, i);
      events.push(makeReturn(parsed.raw, i));
      if (!parsed.closed) {
        diagnostics.push(
          warning(
            "VOICE_UNTERMINATED_RETURN",
            "Stopped an unterminated Return marker at the end of its source line.",
            parsed.raw
          )
        );
      }
      i += parsed.raw.length;
      continue;
    }

    const barline = readBarline(src, i);
    if (barline) {
      events.push(makeBarline(barline.raw, i, barline.style));
      i += barline.raw.length;
      continue;
    }

    if (ch === "(") {
      events.push(makeSlurMarker("(", i, "start"));
      i += 1;
      continue;
    }

    if (ch === ")") {
      events.push(makeSlurMarker(")", i, "end"));
      i += 1;
      continue;
    }

    const meter = readMeter(src, i);
    if (meter) {
      events.push(makeMeter(meter.raw, i, meter.numerator, meter.denominator));
      i += meter.raw.length;
      continue;
    }

    const note = readNoteLike(src, i);
    if (note) {
      events.push(note.event);
      i += note.raw.length;
      continue;
    }

    const raw = readUnknown(src, i);
    events.push(makeUnknown(raw, i, "Unrecognized voice token"));
    diagnostics.push(warning("VOICE_UNKNOWN_TOKEN", "Unrecognized voice token.", raw));
    i += raw.length;
  }

  return { value: events, diagnostics };
}

function readNoteLike(src: string, position: number): { raw: string; event: NoteEvent | RestEvent | RhythmEvent } | null {
  let i = position;
  let accidental: Accidental | undefined;

  const first = src[i] ?? "";
  if (first === "#" && src[i + 1] === "b" && /[1-7]/.test(src[i + 2] ?? "")) {
    accidental = "natural";
    i += 2;
  } else if ((first === "#" || first === "b" || first === "n") && /[1-7]/.test(src[i + 1] ?? "")) {
    accidental = first === "#" ? "sharp" : first === "b" ? "flat" : "natural";
    i += 1;
  }

  const symbol = src[i] ?? "";
  if (!/[0-7Xx]/.test(symbol)) return null;

  if (/[1-7]/.test(symbol)) {
    i += 1;
    let octave = 0;
    while ((src[i] ?? "") === "g" || (src[i] ?? "") === "'" || (src[i] ?? "") === "d" || (src[i] ?? "") === ",") {
      const octaveChar = src[i] ?? "";
      octave += octaveChar === "g" || octaveChar === "'" ? 1 : -1;
      i += 1;
    }
    const duration = readDuration(src, i);
    i += duration.raw.length;
    const raw = src.slice(position, i);
    const degree = Number(symbol) as NoteEvent["degree"];
    return {
      raw,
      event: {
        id: nextId("note"),
        kind: "note",
        raw,
        position,
        degree,
        accidental,
        octave,
        duration: duration.value,
        pitchKey: pitchKeyOf(degree, accidental, octave),
        attack: true,
        lyricAlignable: true,
        visualRole: "normal"
      }
    };
  }

  if (symbol === "0") {
    i += 1;
    const duration = readDuration(src, i);
    i += duration.raw.length;
    const raw = src.slice(position, i);
    return {
      raw,
      event: {
        id: nextId("rest"),
        kind: "rest",
        raw,
        position,
        duration: duration.value,
        attack: false,
        lyricAlignable: false
      }
    };
  }

  if (symbol === "X" || symbol === "x") {
    i += 1;
    const duration = readDuration(src, i);
    i += duration.raw.length;
    const raw = src.slice(position, i);
    return {
      raw,
      event: {
        id: nextId("rhythm"),
        kind: "rhythm",
        raw,
        position,
        duration: duration.value,
        pitchKey: null,
        lyricAlignable: true,
        semantic: "chant"
      }
    };
  }

  return null;
}

function readDuration(src: string, position: number): { raw: string; value: DurationIR } {
  let i = position;
  const value: DurationIR = { underlines: 0, dashes: 0, dots: 0 };
  while (i < src.length) {
    const ch = src[i] ?? "";
    if (ch === "_") value.underlines += 1;
    else if (ch === "-") value.dashes += 1;
    else if (ch === ".") value.dots += 1;
    else break;
    i += 1;
  }
  return { raw: src.slice(position, i), value };
}

function readMeter(src: string, position: number): { raw: string; numerator: number; denominator: number } | null {
  const match = src.slice(position).match(/^(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  return {
    raw: match[0],
    numerator: Number(match[1]),
    denominator: Number(match[2])
  };
}

function readBarline(src: string, position: number): { raw: string; style: BarlineEvent["style"] } | null {
  const pair = src.slice(position, position + 2);
  if (pair === "||") return { raw: "||", style: "double" };
  if (pair === "|]") return { raw: "|]", style: "end" };
  if (pair === "[|") return { raw: "[|", style: "start" };
  if (pair === "|:") return { raw: "|:", style: "start-repeat" };
  if (pair === ":|") return { raw: ":|", style: "end-repeat" };
  if (pair === "|[" && /^\[\d+\./.test(src.slice(position + 1))) {
    return { raw: "|", style: "single" };
  }
  if (pair === "|[") return { raw: "|[", style: "unknown" };
  if (src[position] === "|") return { raw: "|", style: "single" };
  return null;
}

function readVoltaMarker(
  src: string,
  position: number
): { raw: string; number: number } | null {
  const match = src.slice(position).match(/^\[(\d+)\./);
  if (!match) return null;
  return { raw: match[0], number: Number(match[1]) };
}

function readBraced(src: string, position: number): { raw: string; closed: boolean } {
  const lineEnd = findLineEnd(src, position + 1);
  const end = src.indexOf("}", position + 1);
  if (end >= 0 && end < lineEnd) {
    return { raw: src.slice(position, end + 1), closed: true };
  }
  return { raw: src.slice(position, Math.min(position + 1, lineEnd)), closed: false };
}

function readBracketed(src: string, position: number): { raw: string; closed: boolean } {
  const lineEnd = findLineEnd(src, position + 1);
  const end = src.indexOf("]", position + 1);
  if (end >= 0 && end < lineEnd) {
    let durationEnd = end + 1;
    while (durationEnd < lineEnd && /[_\-.]/.test(src[durationEnd] ?? "")) durationEnd += 1;
    return { raw: src.slice(position, durationEnd), closed: true };
  }
  return { raw: src.slice(position, Math.min(position + 1, lineEnd)), closed: false };
}

function readQuoted(src: string, position: number): { raw: string; text: string; closed: boolean } {
  let i = position + 1;
  const lineEnd = findLineEnd(src, i);
  while (i < lineEnd) {
    if (src[i] === '"' && src[i - 1] !== "\\") break;
    i += 1;
  }
  const closed = i < lineEnd && src[i] === '"';
  const end = closed ? i + 1 : lineEnd;
  const raw = src.slice(position, end);
  return { raw, text: raw.slice(1, closed ? -1 : undefined), closed };
}

function readReturn(src: string, position: number): { raw: string; closed: boolean } {
  if (src[position + 1] !== "(") return { raw: "$", closed: true };
  const lineEnd = findLineEnd(src, position + 2);
  const end = src.indexOf(")", position + 2);
  if (end >= 0 && end < lineEnd) {
    return { raw: src.slice(position, end + 1), closed: true };
  }
  return { raw: src.slice(position, lineEnd), closed: false };
}

function readUnknown(src: string, position: number): string {
  let i = position + 1;
  while (
    i < src.length &&
    !/\s/.test(src[i] ?? "") &&
    !isKnownTokenStart(src, i)
  ) {
    i += 1;
  }
  return src.slice(position, i);
}

function isKnownTokenStart(src: string, position: number): boolean {
  const ch = src[position] ?? "";
  if (
    ch === "{" ||
    ch === "[" ||
    ch === "|" ||
    ch === ":" ||
    ch === "(" ||
    ch === ")" ||
    ch === "$" ||
    ch === '"'
  ) {
    return true;
  }
  if (/[0-7Xx]/.test(ch)) return true;
  return (
    ((ch === "#" || ch === "b" || ch === "n") && /[1-7]/.test(src[position + 1] ?? "")) ||
    (ch === "#" && src[position + 1] === "b" && /[1-7]/.test(src[position + 2] ?? ""))
  );
}

function findLineEnd(src: string, position: number): number {
  const match = /[\r\n]/.exec(src.slice(position));
  return match ? position + match.index : src.length;
}

function makeBarline(raw: string, position: number, style: BarlineEvent["style"]): BarlineEvent {
  return { id: nextId("bar"), kind: "barline", raw, position, style };
}

function makeMeter(raw: string, position: number, numerator: number, denominator: number): MeterEvent {
  return { id: nextId("meter"), kind: "meter", raw, position, numerator, denominator };
}

function makeStandardText(raw: string, position: number, text: string): StandardTextEvent {
  return { id: nextId("text"), kind: "standardText", raw, position, text };
}

function makeReturn(raw: string, position: number): ReturnEvent {
  return { id: nextId("return"), kind: "return", raw, position };
}

function makeSlurMarker(raw: string, position: number, role: SlurMarkerEvent["role"]): SlurMarkerEvent {
  return { id: nextId("slur"), kind: "slurMarker", raw, position, role };
}

function makeTuplet(raw: string, position: number, count: number): TupletMarkerEvent {
  return { id: nextId("tuplet"), kind: "tupletMarker", raw, position, count };
}

function makeVoltaMarker(raw: string, position: number, number: number): VoltaMarkerEvent {
  return { id: nextId("volta"), kind: "voltaMarker", raw, position, number };
}

function makeUnknown(raw: string, position: number, reason: string): UnknownEvent {
  return { id: nextId("unknown"), kind: "unknown", raw, position, reason };
}

function nextId(prefix: string): string {
  eventCounter += 1;
  return `${prefix}-${eventCounter}`;
}
