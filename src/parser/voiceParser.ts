import type { Diagnostic, WithDiagnostics } from "../core/diagnostics";
import type { MeasureIR, VoiceEvent, VoiceIR } from "../ir/voice";
import { lexVoice } from "./voiceLexer";

export function parseVoice(src: string, id = "voice-1"): WithDiagnostics<VoiceIR> {
  const lexed = lexVoice(src);
  const grouped = buildMeasures(lexed.value);
  return {
    value: {
      id,
      events: grouped.events,
      measures: grouped.measures,
      anchors: grouped.anchors
    },
    diagnostics: lexed.diagnostics
  };
}

function buildMeasures(events: VoiceEvent[]): {
  events: VoiceEvent[];
  measures: MeasureIR[];
  anchors: Map<string, string>;
  diagnostics: Diagnostic[];
} {
  const measures: MeasureIR[] = [];
  const anchors = new Map<string, string>();
  let current: VoiceEvent[] = [];
  let measureNumber = 1;
  let noteIndex = 0;

  for (const event of events) {
    const stamped = event;
    stamped.measure = measureNumber;

    if (isNoteSlotEvent(stamped)) {
      noteIndex += 1;
      stamped.noteIndex = noteIndex;
      anchors.set(`${measureNumber}:${noteIndex}`, stamped.id);
    }

    current.push(stamped);

    if (stamped.kind === "barline" && noteIndex > 0) {
      measures.push(makeMeasure(measureNumber, current, noteIndex));
      measureNumber += 1;
      current = [];
      noteIndex = 0;
    }
  }

  if (current.length > 0) {
    measures.push(makeMeasure(measureNumber, current, noteIndex));
  }

  return { events, measures, anchors, diagnostics: [] };
}

function makeMeasure(number: number, events: VoiceEvent[], noteLikeCount: number): MeasureIR {
  return {
    number,
    events,
    noteLikeCount,
    naturalWidth: 0
  };
}

function isNoteSlotEvent(event: VoiceEvent): boolean {
  return event.kind === "note" || event.kind === "rest" || event.kind === "rhythm";
}

