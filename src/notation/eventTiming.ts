import type { ScoreIR } from "../ir/score";
import type { VoiceEvent } from "../ir/voice";
import { parseKeyAndMeterMarks } from "../parser/parseTitle";
import { totalDurationQuarters } from "./jianpuRules";

export interface EventTiming {
  measureOffsetQuarter: number;
  durationQuarters: number;
  durationScale: number;
  numerator: number;
  denominator: number;
}

/** Shared performed beat positions for print beams and teaching slots. */
export function buildEventTiming(events: VoiceEvent[], score: ScoreIR): Map<string, EventTiming> {
  const result = new Map<string, EventTiming>();
  const initial = parseKeyAndMeterMarks(score.title.keyAndMeters).find(mark => mark.keyOfOne || mark.numerator);
  let numerator = initial?.numerator ?? 4;
  let denominator = initial?.denominator ?? 4;
  let measure = events[0]?.measure ?? 1;
  let measureCursorQuarter = 0;
  let activeTuplet: { count: number; writtenQuarters: number } | undefined;

  for (const event of events) {
    if ((event.measure ?? measure) !== measure) {
      measure = event.measure ?? measure + 1;
      measureCursorQuarter = 0;
    }
    if (event.kind === "meter") {
      activeTuplet = undefined;
      numerator = event.numerator;
      denominator = event.denominator;
      continue;
    }
    if (event.kind === "tupletMarker") {
      activeTuplet = { count: event.count, writtenQuarters: 0 };
      continue;
    }
    if (event.kind === "barline" || event.kind === "return" || event.kind === "standardText" ||
        (event.kind === "slurMarker" && event.role === "end")) {
      activeTuplet = undefined;
      continue;
    }
    if (event.kind !== "note" && event.kind !== "rest" && event.kind !== "rhythm") continue;
    const writtenQuarters = totalDurationQuarters(event.duration);
    const durationScale = activeTuplet && activeTuplet.count > 1 ? (activeTuplet.count - 1) / activeTuplet.count : 1;
    const durationQuarters = writtenQuarters * durationScale;
    result.set(event.id, { measureOffsetQuarter: measureCursorQuarter, durationQuarters,
      durationScale, numerator, denominator });
    measureCursorQuarter += durationQuarters;
    if (activeTuplet) {
      activeTuplet.writtenQuarters += writtenQuarters;
      if (activeTuplet.writtenQuarters >= activeTuplet.count / 2 - 1e-6) activeTuplet = undefined;
    }
  }
  return result;
}
