import type { Diagnostic } from "../core/diagnostics";
import { warning } from "../core/diagnostics";
import type { SemanticInfo, SlurCurve } from "../ir/semantic";
import type { NoteEvent, VoiceEvent, VoiceIR } from "../ir/voice";

interface OpenSlur {
  id: string;
  markerIndex: number;
  startNote?: NoteEvent;
}

export function classifyCurves(voice: VoiceIR): Pick<SemanticInfo, "slurs"> & { diagnostics: Diagnostic[] } {
  const slurs: SlurCurve[] = [];
  const stack: OpenSlur[] = [];
  const diagnostics: Diagnostic[] = [];

  voice.events.forEach((event, index) => {
    if (event.kind === "slurMarker" && event.role === "start") {
      stack.push({
        id: `curve-${slurs.length + stack.length + 1}`,
        markerIndex: index,
        startNote: findNextNote(voice.events, index + 1)
      });
    }

    if (event.kind === "slurMarker" && event.role === "end") {
      const open = stack.pop();
      const endNote = findPreviousNote(voice.events, index - 1);
      if (!open?.startNote || !endNote) {
        // JPW also uses ')' to close tuplets and instrumental phrase groups.
        // Without an open slur this marker is semantically neutral.
        return;
      }

      const spanNotes = notesBetween(voice.events, open.markerIndex, index);
      const type = isTieSpan(spanNotes) ? "tie" : "slur";
      slurs.push({
        id: open.id,
        type,
        startEventId: open.startNote.id,
        endEventId: endNote.id
      });

      if (type === "tie") {
        applyTieRoles(spanNotes, open.id);
      }
    }
  });

  stack.forEach((open) => {
    diagnostics.push(warning("SLUR_UNMATCHED_START", "Ignored unmatched slur/phrase start marker.", describeMarker(voice.events, open.markerIndex)));
  });

  return { slurs, diagnostics };
}

function isTieSpan(notes: NoteEvent[]): boolean {
  if (notes.length < 2) return false;
  return notes.every((note) => note.pitchKey === notes[0]?.pitchKey);
}

function applyTieRoles(notes: NoteEvent[], tieGroupId: string): void {
  notes.forEach((note, index) => {
    note.tieGroupId = tieGroupId;
    note.tieRole = index === 0 ? "start" : index === notes.length - 1 ? "end" : "continue";
    if (index > 0) {
      note.attack = false;
      note.visualRole = "tie-ghost";
    }
  });
}

function findNextNote(events: VoiceEvent[], start: number): NoteEvent | undefined {
  for (let i = start; i < events.length; i += 1) {
    if (events[i]?.kind === "note") return events[i] as NoteEvent;
    if (events[i]?.kind === "barline") return undefined;
  }
  return undefined;
}

function findPreviousNote(events: VoiceEvent[], start: number): NoteEvent | undefined {
  for (let i = start; i >= 0; i -= 1) {
    if (events[i]?.kind === "note") return events[i] as NoteEvent;
    if (events[i]?.kind === "barline") return undefined;
  }
  return undefined;
}

function notesBetween(events: VoiceEvent[], start: number, end: number): NoteEvent[] {
  return events.slice(start, end + 1).filter((event): event is NoteEvent => event.kind === "note");
}

function describeMarker(events: VoiceEvent[], markerIndex: number): string {
  const event = events[markerIndex];
  if (!event) return "";
  if (event.kind !== "slurMarker") return `${event.raw} at measure ${event.measure}, slot ${event.noteIndex}`;
  const anchor = event.role === "start" ? findNextNote(events, markerIndex + 1) : findPreviousNote(events, markerIndex - 1);
  const measure = event.measure ?? anchor?.measure;
  const noteIndex = event.noteIndex ?? anchor?.noteIndex;
  return `${event.raw} at measure ${measure}, slot ${noteIndex}`;
}
