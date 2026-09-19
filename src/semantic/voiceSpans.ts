import type { NoteEvent, RestEvent, RhythmEvent, VoiceEvent } from "../ir/voice";
import { durationWithoutAugmentation, totalDurationQuarters } from "../notation/jianpuRules";

type TimedEvent = NoteEvent | RestEvent | RhythmEvent;
export const isTimedEvent = (event: VoiceEvent): event is TimedEvent =>
  event.kind === "note" || event.kind === "rest" || event.kind === "rhythm";

/** A closing parenthesis after a barline closes a section; before it closes notes.
 * Nested note slurs remain independent of the surrounding instrumental section. */
export function analyzeParentheses(events: VoiceEvent[]) {
  const structural = (event: VoiceEvent) => event.kind !== "return" && event.kind !== "meter" &&
    !(event.kind === "unknown" && /^\{C:[^{}]*\}$/i.test(event.raw));
  // Locate section boundaries with balanced note/tuplet delimiters first.
  // A later, unrelated interlude must not change an earlier note slur.
  const delimiters: Array<{ index: number; tuplet: boolean }> = [];
  const sectionEnds = new Map<number, number>();
  events.forEach((event, index) => {
    if (["barline", "meter", "return", "standardText"].includes(event.kind)) {
      // A tuplet may end implicitly at a structural boundary.
      for (let i = delimiters.length - 1; i >= 0; i--) {
        if (delimiters[i]!.tuplet) delimiters.splice(i, 1);
      }
    }
    if (event.kind === "tupletMarker") {
      // Consecutive tuplets cannot contain one another.
      for (let i = delimiters.length - 1; i >= 0; i--) {
        if (delimiters[i]!.tuplet) delimiters.splice(i, 1);
      }
      delimiters.push({ index, tuplet: true });
    } else if (event.kind === "slurMarker" && event.role === "start") {
      delimiters.push({ index, tuplet: false });
    } else if (event.kind === "slurMarker" && event.role === "end") {
      const opener = delimiters.pop();
      if (!opener || opener.tuplet) return;
      const inner = events.slice(opener.index + 1, index).filter(structural);
      const before = events.slice(0, opener.index).filter(structural).at(-1);
      if ((!before || before.kind === "barline" || inner[0]?.kind === "barline") &&
          inner.some(isTimedEvent) && inner.at(-1)?.kind === "barline") {
        sectionEnds.set(opener.index, index);
      }
    }
  });
  const stack: number[] = [];
  const pairs: Array<{ start: number; end: number; instrumental: boolean }> = [];
  const slurEnds = new Set<string>();
  events.forEach((event, index) => {
    if (event.kind !== "slurMarker") return;
    if (event.role === "start") { stack.push(index); return; }
    const start = stack.at(-1);
    if (start === undefined) return;
    // Protect a known outer section while closing its inner tuplet.
    const sectionEnd = sectionEnds.get(start);
    if (sectionEnd !== undefined && sectionEnd !== index) return;
    stack.pop();
    const inner = events.slice(start + 1, index).filter(structural);
    const before = events.slice(0, start).filter(structural).at(-1);
    const opensAtBoundary = !before || before.kind === "barline" || inner[0]?.kind === "barline";
    const instrumental = opensAtBoundary && inner.some(isTimedEvent) && inner.at(-1)?.kind === "barline";
    pairs.push({ start, end: index, instrumental });
    slurEnds.add(event.id);
  });
  return { pairs, slurEnds, unmatched: stack };
}

/** One tuplet interpretation feeds playback, print and teaching views. */
export function collectVoiceTuplets(events: VoiceEvent[]) {
  const { slurEnds } = analyzeParentheses(events);
  return events.flatMap((marker, index) => {
    if (marker.kind !== "tupletMarker") return [];
    const candidates: TimedEvent[] = [];
    let explicitEnd = false;
    for (const event of events.slice(index + 1)) {
      if (["barline", "meter", "return", "standardText", "tupletMarker"].includes(event.kind)) break;
      if (event.kind === "slurMarker" && event.role === "end" && !slurEnds.has(event.id)) {
        explicitEnd = true;
        break;
      }
      if (isTimedEvent(event)) candidates.push(event);
    }
    if (!candidates.length) return [];
    let members = candidates;
    if (!explicitEnd) {
      const target = durationWithoutAugmentation({ ...candidates[0]!.duration, dots: 0 }) * marker.count;
      let written = 0;
      members = [];
      for (const event of candidates) {
        members.push(event);
        written += totalDurationQuarters(event.duration);
        if (written >= target - 1e-6 || members.length >= marker.count) break;
      }
    }
    return [{ id: `tuplet-${marker.id}`, count: marker.count, members }];
  });
}
