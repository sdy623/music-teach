import type {
  JianpuPhraseFrame,
  PhraseCurve,
  PhraseKeyChange,
  PhraseSlot
} from "./types";
import type { BarlineEvent } from "../ir/voice";
import {
  JIANPU_METRICS,
  underlineY
} from "../notation/jianpuRules";

export interface PhraseLayoutOptions {
  width?: number;
  height?: number;
  contextWidth?: number;
}

export interface BeatGeometry {
  id: string;
  measure: number;
  index: number;
  startQuarter: number;
  durationQuarters: number;
  x: number;
  width: number;
}

export interface SlotGeometry {
  slot: PhraseSlot;
  index: number;
  x: number;
  beatX: number;
  beatWidth: number;
}

export interface MeasureGeometry {
  id: string;
  number: number;
  x: number;
  width: number;
  endX: number;
  showNumber: boolean;
  incomplete: boolean;
  startingBarline?: BarlineEvent["style"];
  endingBarline?: BarlineEvent["style"];
  meterChanged: boolean;
  numerator: number;
  denominator: number;
}

export interface BeamGeometry {
  id: string;
  level: number;
  x1: number;
  x2: number;
  y: number;
}

export interface CurveGeometry {
  curve: PhraseCurve;
  x1: number;
  x2: number;
  centerX: number;
  baseY: number;
  apexY: number;
  labelY: number;
}

export interface KeyChangeGeometry {
  change: PhraseKeyChange;
  x: number;
  anchorX: number;
}

export interface PhraseGeometry {
  width: number;
  height: number;
  contextWidth: number;
  noteY: number;
  lyricY: number;
  beats: BeatGeometry[];
  slots: SlotGeometry[];
  measures: MeasureGeometry[];
  beams: BeamGeometry[];
  curves: CurveGeometry[];
  keyChanges: KeyChangeGeometry[];
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 300;
const DEFAULT_CONTEXT_WIDTH = 150;
const METER_CHANGE_LEAD = 42;
const KEY_CHANGE_HALF_WIDTH = 76;

export function layoutPhrase(phrase: JianpuPhraseFrame, options: PhraseLayoutOptions = {}): PhraseGeometry {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const contextWidth = options.contextWidth ?? DEFAULT_CONTEXT_WIDTH;
  const compact = phrase.layoutDensity === "compact";
  const left = contextWidth + (compact ? 30 : 16);
  const right = compact ? 44 : 30;
  const beatGap = compact ? 5 : 8;
  const measureGap = compact ? 24 : 10;
  const flatBeats = phrase.measures.flatMap((measure) =>
    measure.beats.map((beat, beatIndex) => ({
      beat,
      measure,
      isFirstInMeasure: beatIndex === 0,
      weight: beatNaturalWeight(beat.slots, beat.durationQuarters)
    }))
  );
  const totalGap = flatBeats.reduce((sum, entry, index) => {
    const previous = flatBeats[index - 1];
    const between = index === 0 ? 0 : previous?.measure.number === entry.measure.number ? beatGap : measureGap;
    const meterLead = entry.isFirstInMeasure && entry.measure.meterChanged ? METER_CHANGE_LEAD : 0;
    return sum + between + meterLead;
  }, 0);
  const totalWeight = flatBeats.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  const contentWidth = Math.max(100, width - left - right - totalGap);
  let cursor = left;
  const beats: BeatGeometry[] = [];

  flatBeats.forEach((entry, index) => {
    const previous = flatBeats[index - 1];
    if (index > 0) cursor += previous?.measure.number === entry.measure.number ? beatGap : measureGap;
    if (entry.isFirstInMeasure && entry.measure.meterChanged) cursor += METER_CHANGE_LEAD;
    const beatWidth = (contentWidth * entry.weight) / totalWeight;
    beats.push({
      id: entry.beat.id,
      measure: entry.measure.number,
      index: entry.beat.index,
      startQuarter: entry.beat.startQuarter,
      durationQuarters: entry.beat.durationQuarters,
      x: cursor,
      width: beatWidth
    });
    cursor += beatWidth;
  });

  const slotOrder = new Map(phrase.slots.map((slot, index) => [slot.id, index]));
  const slots = beats.flatMap((beatGeometry) => {
    const beat = phrase.measures
      .find((measure) => measure.number === beatGeometry.measure)
      ?.beats.find((candidate) => candidate.index === beatGeometry.index);
    const beatSlots = beat?.slots ?? [];
    const positioned = beatSlots.map((slot, slotIndex): SlotGeometry => {
      const innerPadding = Math.min(16, beatGeometry.width * 0.12);
      const usableWidth = Math.max(0, beatGeometry.width - innerPadding * 2);
      const availableDuration = Math.max(0, 1 - slot.beatOffset);
      const temporalCenter = clamp(
        slot.beatOffset + Math.min(slot.durationBeats, availableDuration) / 2,
        0.06,
        0.94
      );
      const opticalCenter = beatSlots.length <= 1 ? 0.5 : (slotIndex + 0.5) / beatSlots.length;
      const blendedCenter = temporalCenter * 0.48 + opticalCenter * 0.52;
      return {
        slot,
        index: slotOrder.get(slot.id) ?? 0,
        x: beatGeometry.x + innerPadding + usableWidth * blendedCenter,
        beatX: beatGeometry.x,
        beatWidth: beatGeometry.width
      };
    });
    return resolveSlotCollisions(positioned, beatGeometry, compact);
  });

  const measures = phrase.measures.map((measure): MeasureGeometry => {
    const measureBeats = beats.filter((beat) => beat.measure === measure.number);
    const first = measureBeats[0];
    const last = measureBeats.at(-1);
    const x = first ? first.x - (measure.meterChanged ? METER_CHANGE_LEAD : 0) : left;
    const endX = last ? last.x + last.width + measureGap / 2 : x;
    return {
      id: measure.id,
      number: measure.number,
      x,
      width: Math.max(0, endX - x),
      endX,
      showNumber: measure.showNumber,
      incomplete: measure.incomplete,
      startingBarline: measure.startingBarline,
      endingBarline: measure.endingBarline,
      meterChanged: measure.meterChanged,
      numerator: measure.numerator,
      denominator: measure.denominator
    };
  });

  const beams = buildBeams(phrase, beats, slots);
  const bySourceEvent = new Map<string, SlotGeometry>();
  slots.forEach((slotGeometry) => {
    if (slotGeometry.slot.kind !== "sustain" && !bySourceEvent.has(slotGeometry.slot.sourceEventId)) {
      bySourceEvent.set(slotGeometry.slot.sourceEventId, slotGeometry);
    }
  });
  const rawCurves = phrase.curves
    .map((curve): CurveGeometry | undefined => {
      const start = bySourceEvent.get(curve.startEventId);
      const end = bySourceEvent.get(curve.endEventId);
      if (!start || !end) return undefined;
      const centerStart = Math.min(start.x, end.x);
      const centerEnd = Math.max(start.x, end.x);
      const x1 = centerStart - 10;
      const x2 = centerEnd + 10;
      const spanSlots = slots.filter((slot) => slot.x >= centerStart - 0.001 && slot.x <= centerEnd + 0.001);
      const highestOctave = Math.max(0, ...spanSlots.map((slot) => Math.max(0, slot.slot.octave)));
      const baseY = JIANPU_METRICS.noteY - 46 - highestOctave * JIANPU_METRICS.octaveDotGap;
      const width = Math.max(20, x2 - x1);
      const minimumRise = curve.type === "tie" ? 11 : 14;
      const maximumRise = curve.type === "tie" ? 19 : 27;
      const rise = clamp(width * (curve.type === "tie" ? 0.055 : 0.075), minimumRise, maximumRise);
      const apexY = baseY - rise;
      return {
        curve,
        x1,
        x2,
        centerX: (x1 + x2) / 2,
        baseY,
        apexY,
        labelY: apexY + 6
      };
    })
    .filter((curve): curve is CurveGeometry => Boolean(curve));
  const curves = stackCurveLanes(rawCurves);
  const keyChanges = phrase.keyChanges
    .map((change): KeyChangeGeometry | undefined => {
      const anchor = bySourceEvent.get(change.eventId);
      if (!anchor) return undefined;
      return {
        change,
        x: clamp(
          anchor.x,
          left + KEY_CHANGE_HALF_WIDTH,
          width - right - KEY_CHANGE_HALF_WIDTH
        ),
        anchorX: anchor.x
      };
    })
    .filter((change): change is KeyChangeGeometry => Boolean(change));

  return {
    width,
    height,
    contextWidth,
    noteY: JIANPU_METRICS.noteY,
    lyricY: JIANPU_METRICS.lyricY,
    beats,
    slots,
    measures,
    beams,
    curves,
    keyChanges
  };
}

function buildBeams(
  phrase: JianpuPhraseFrame,
  beats: BeatGeometry[],
  slots: SlotGeometry[]
): BeamGeometry[] {
  const beams: BeamGeometry[] = [];

  for (const beat of beats) {
    const beatSlots = slots.filter(
      (entry) =>
        entry.slot.measure === beat.measure &&
        entry.slot.beatIndex === beat.index
    );
    beatSlots.sort(
      (left, right) =>
        left.slot.measureOffsetQuarter - right.slot.measureOffsetQuarter || left.index - right.index
    );
    const maxLevel = Math.max(0, ...beatSlots.map((entry) => entry.slot.underlines));

    for (let level = 1; level <= maxLevel; level += 1) {
      const runs = beamRuns(beatSlots, level);
      runs.filter((run) => run.length > 0).forEach((run, runIndex) => {
        const first = run[0]!;
        const last = run.at(-1)!;
        const half = Math.min(JIANPU_METRICS.digitHalfWidth, beat.width * 0.18);
        beams.push({
          id: `${phrase.id}-${beat.id}-beam-${level}-${runIndex}`,
          level,
          x1: Math.max(beat.x, first.x - half),
          x2: Math.min(beat.x + beat.width, last.x + half),
          y: underlineY(level)
        });
      });
    }
  }

  return beams;
}

function beamRuns(slots: SlotGeometry[], level: number): SlotGeometry[][] {
  const runs: SlotGeometry[][] = [];
  let current: SlotGeometry[] = [];

  slots.forEach((slot) => {
    if (slot.slot.kind === "sustain" || slot.slot.underlines < level) {
      if (current.length) runs.push(current);
      current = [];
      return;
    }
    current.push(slot);
  });

  if (current.length) runs.push(current);
  return runs;
}

function beatNaturalWeight(slots: PhraseSlot[], durationQuarters: number): number {
  const glyphDemand = slots.reduce(
    (sum, slot) =>
      sum +
      (slot.kind === "sustain" ? 0.72 : 1) +
      (slot.accidental ? 0.34 : 0) +
      Math.min(0.4, slot.dots * 0.16),
    0
  );
  const lyricDemand = slots.reduce(
    (max, slot) => Math.max(max, slot.lyricCell?.display.replace(/\s+/g, "").length ?? 0),
    0
  );
  return Math.max(1, durationQuarters * 0.9, 0.72 + glyphDemand * 0.42 + lyricDemand * 0.28);
}

function resolveSlotCollisions(
  slots: SlotGeometry[],
  beat: BeatGeometry,
  compact: boolean
): SlotGeometry[] {
  if (slots.length < 2) return slots;
  const minimumGap = compact ? 2 : 4;
  const digitHalfWidth = compact ? 8 : JIANPU_METRICS.digitHalfWidth;
  const accidentalLead = compact ? 9 : 14;
  let previousRight = beat.x;

  slots.forEach((geometry) => {
    const lyricLength = geometry.slot.lyricCell?.display.replace(/\s+/g, "").length ?? 0;
    const lyricHalfWidth = lyricLength * 13.5;
    const leftReserve = Math.max(
      digitHalfWidth + (geometry.slot.accidental ? accidentalLead : 0),
      lyricHalfWidth
    );
    const rightReserve =
      Math.max(
        digitHalfWidth +
          Math.max(0, geometry.slot.dots - 1) * JIANPU_METRICS.durationDotGap +
          (geometry.slot.dots ? 6 : 0),
        lyricHalfWidth
      );
    geometry.x = Math.max(geometry.x, previousRight + minimumGap + leftReserve);
    previousRight = geometry.x + rightReserve;
  });

  const rightLimit = beat.x + beat.width;
  const overflow = Math.max(0, previousRight - rightLimit);
  if (overflow > 0) {
    slots.forEach((geometry) => {
      geometry.x -= overflow;
    });
  }

  const first = slots[0]!;
  const firstLyricLength = first.slot.lyricCell?.display.replace(/\s+/g, "").length ?? 0;
  const firstReserve = Math.max(
    digitHalfWidth + (first.slot.accidental ? accidentalLead : 0),
    firstLyricLength * 13.5
  );
  const leftOverflow = Math.max(0, beat.x - (first.x - firstReserve));
  if (leftOverflow > 0) {
    slots.forEach((geometry) => {
      geometry.x += leftOverflow;
    });
  }

  return slots;
}

function stackCurveLanes(curves: CurveGeometry[]): CurveGeometry[] {
  const occupied: Array<Array<{ x1: number; x2: number }>> = [];
  return curves.map((curve) => {
    let lane = 0;
    while (
      occupied[lane]?.some(
        (candidate) => curve.x1 < candidate.x2 - 6 && curve.x2 > candidate.x1 + 6
      )
    ) {
      lane += 1;
    }
    occupied[lane] ??= [];
    occupied[lane]!.push({ x1: curve.x1, x2: curve.x2 });
    if (lane === 0) return curve;
    const offset = lane * 12;
    return {
      ...curve,
      baseY: curve.baseY - offset,
      apexY: curve.apexY - offset,
      labelY: curve.labelY - offset
    };
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
