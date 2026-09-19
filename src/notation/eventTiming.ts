import { collectVoiceTuplets } from "../semantic/voiceSpans";
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
  const scales = new Map(collectVoiceTuplets(events).flatMap(group =>
    group.members.map(event => [event.id, group.count > 1 ? (group.count - 1) / group.count : 1] as const)));

  for (const event of events) {
    if ((event.measure ?? measure) !== measure) {
      measure = event.measure ?? measure + 1;
      measureCursorQuarter = 0;
    }
    if (event.kind === "meter") {
      numerator = event.numerator;
      denominator = event.denominator;
      continue;
    }
    if (event.kind !== "note" && event.kind !== "rest" && event.kind !== "rhythm") continue;
    const writtenQuarters = totalDurationQuarters(event.duration);
    const durationScale = scales.get(event.id) ?? 1;
    const durationQuarters = writtenQuarters * durationScale;
    result.set(event.id, { measureOffsetQuarter: measureCursorQuarter, durationQuarters,
      durationScale, numerator, denominator });
    measureCursorQuarter += durationQuarters;

  }
  return result;
}
