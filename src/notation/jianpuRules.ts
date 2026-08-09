import type { DurationIR } from "../ir/voice";

export interface MeterBeatGroup {
  index: number;
  startQuarter: number;
  durationQuarters: number;
  denominatorUnits: number;
}

export interface LocatedBeat {
  index: number;
  offset: number;
  duration: number;
}

export const JIANPU_METRICS = {
  digitFontSize: 43,
  digitHalfWidth: 13,
  noteY: 126,
  lyricY: 188,
  firstUnderlineOffset: 8,
  underlineGap: 6,
  underlineStrokeWidth: 2.4,
  highOctaveDotOffset: 38,
  octaveDotGap: 8,
  lowOctaveDotOffset: 10,
  lowOctaveDotClearance: 8,
  durationDotXOffset: 16,
  durationDotGap: 8,
  durationDotYOffset: -13,
  barlineTop: 91,
  barlineBottom: 164,
  repeatDotOffset: 13
} as const;

export function durationWithoutAugmentation(duration: Pick<DurationIR, "underlines" | "dots">): number {
  const base = 1 / 2 ** duration.underlines;
  const dotFactor = duration.dots <= 0 ? 1 : 2 - 1 / 2 ** duration.dots;
  return base * dotFactor;
}

export function totalDurationQuarters(duration: DurationIR): number {
  return durationWithoutAugmentation(duration) + duration.dashes;
}

export function meterBeatPattern(numerator: number, denominator: number): number[] {
  if (denominator === 8) {
    if (numerator === 3) return [3];
    if (numerator >= 6 && numerator % 3 === 0) {
      return Array.from({ length: numerator / 3 }, () => 3);
    }
    if (numerator === 5) return [2, 3];
    if (numerator === 7) return [2, 2, 3];
  }

  if (numerator === 5) return [3, 2];
  if (numerator === 7) return [4, 3];
  return Array.from({ length: Math.max(1, numerator) }, () => 1);
}

export function meterBeatGroups(numerator: number, denominator: number): MeterBeatGroup[] {
  const quarterPerDenominatorUnit = 4 / denominator;
  let cursor = 0;
  return meterBeatPattern(numerator, denominator).map((denominatorUnits, index) => {
    const durationQuarters = denominatorUnits * quarterPerDenominatorUnit;
    const group: MeterBeatGroup = {
      index,
      startQuarter: cursor,
      durationQuarters,
      denominatorUnits
    };
    cursor += durationQuarters;
    return group;
  });
}

export function locateBeat(
  measureOffsetQuarter: number,
  numerator: number,
  denominator: number
): LocatedBeat {
  const groups = meterBeatGroups(numerator, denominator);
  const last = groups.at(-1) ?? { index: 0, startQuarter: 0, durationQuarters: 1 };
  const group =
    groups.find(
      (candidate) =>
        measureOffsetQuarter >= candidate.startQuarter - 1e-6 &&
        measureOffsetQuarter < candidate.startQuarter + candidate.durationQuarters - 1e-6
    ) ?? last;
  return {
    index: group.index,
    offset: Math.max(0, (measureOffsetQuarter - group.startQuarter) / group.durationQuarters),
    duration: group.durationQuarters
  };
}

export function underlineY(level: number, noteY: number = JIANPU_METRICS.noteY): number {
  return noteY + JIANPU_METRICS.firstUnderlineOffset + (level - 1) * JIANPU_METRICS.underlineGap;
}

export function highOctaveDotY(dotIndex: number, noteY: number = JIANPU_METRICS.noteY): number {
  return noteY - JIANPU_METRICS.highOctaveDotOffset - dotIndex * JIANPU_METRICS.octaveDotGap;
}

export function lowOctaveDotY(
  dotIndex: number,
  underlineCount: number,
  noteY: number = JIANPU_METRICS.noteY
): number {
  const clearDigit = noteY + JIANPU_METRICS.lowOctaveDotOffset;
  const clearUnderlines =
    underlineCount > 0
      ? underlineY(underlineCount, noteY) +
        JIANPU_METRICS.underlineStrokeWidth / 2 +
        JIANPU_METRICS.lowOctaveDotClearance
      : clearDigit;
  return Math.max(clearDigit, clearUnderlines) + dotIndex * JIANPU_METRICS.octaveDotGap;
}
