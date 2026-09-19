import { analyzeParentheses, collectVoiceTuplets, isTimedEvent } from "./voiceSpans";
import type { Diagnostic } from "../core/diagnostics";
import { warning } from "../core/diagnostics";
import type { SemanticInfo, SlurCurve } from "../ir/semantic";
import type { NoteEvent, VoiceEvent, VoiceIR } from "../ir/voice";


export function classifyCurves(voice: VoiceIR): Pick<SemanticInfo, "slurs"> & { diagnostics: Diagnostic[] } {
  const slurs: SlurCurve[] = [];
  const diagnostics: Diagnostic[] = [];
  const { pairs, unmatched } = analyzeParentheses(voice.events);
  for (const pair of pairs) {
    const events = voice.events.slice(pair.start + 1, pair.end);
    if (pair.instrumental) {
      events.filter(isTimedEvent).forEach(event => { event.instrumental = true; });
      continue;
    }
    const spanNotes = events.filter((event): event is NoteEvent => event.kind === "note");
    const first = spanNotes[0], last = spanNotes.at(-1);
    if (!first || !last || first === last) continue;
    const type = !events.some(e => e.kind === "rest" || e.kind === "rhythm") && isTieSpan(spanNotes) ? "tie" : "slur";
    const id = `curve-${voice.events[pair.start]!.id}`;
    slurs.push({ id, type, startEventId: first.id, endEventId: last.id });
    if (type === "tie") applyTieRoles(spanNotes, id);
  }
  unmatched.forEach(index => diagnostics.push(warning("SLUR_UNMATCHED_START",
    "Ignored unmatched slur/phrase start marker.", describeMarker(voice.events, index))));
  for (const tuplet of collectVoiceTuplets(voice.events)) {
    slurs.push({ id: tuplet.id, type: "tuplet", startEventId: tuplet.members[0]!.id,
      endEventId: tuplet.members.at(-1)!.id, label: String(tuplet.count) });
  }

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


function describeMarker(events: VoiceEvent[], markerIndex: number): string {
  const event = events[markerIndex];
  if (!event) return "";
  if (event.kind !== "slurMarker") return `${event.raw} at measure ${event.measure}, slot ${event.noteIndex}`;
  const anchor = event.role === "start" ? findNextNote(events, markerIndex + 1) : findPreviousNote(events, markerIndex - 1);
  const measure = event.measure ?? anchor?.measure;
  const noteIndex = event.noteIndex ?? anchor?.noteIndex;
  return `${event.raw} at measure ${measure}, slot ${noteIndex}`;
}
