export function findNextPlayablePhraseIndex<T extends { id: string }>(
  phrases: readonly T[],
  fromIndex: number,
  omitMarkedPhrases: boolean,
  shouldSkip: (phrase: T) => boolean
): number {
  for (let index = fromIndex + 1; index < phrases.length; index += 1) {
    const phrase = phrases[index]!;
    if (!omitMarkedPhrases || !shouldSkip(phrase)) return index;
  }
  return -1;
}

interface PerformanceSlot {
  context?: boolean;
  contextRole?: "before" | "after";
  tieGhost?: boolean;
}

interface TimedPerformanceSlot {
  durationQuarters?: number;
  durationBeats?: number;
}

const DEFAULT_BPM = 73;
const DEFAULT_DURATION_QUARTERS = 0.5;

export function slotDurationMilliseconds(
  slot: TimedPerformanceSlot,
  bpm: number
): number {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : DEFAULT_BPM;
  const rawDuration =
    slot.durationQuarters ?? slot.durationBeats ?? DEFAULT_DURATION_QUARTERS;
  const durationQuarters = Number.isFinite(rawDuration)
    ? Math.max(0, rawDuration)
    : DEFAULT_DURATION_QUARTERS;
  return (60_000 / safeBpm) * durationQuarters;
}

export function nextPlaybackDeadline(
  previousDeadline: number | undefined,
  now: number,
  durationMilliseconds: number
): number {
  return (previousDeadline ?? now) + Math.max(0, durationMilliseconds);
}

export function playbackDelayMilliseconds(
  deadline: number,
  now: number
): number {
  return Math.max(0, deadline - now);
}

export function isPerformedSlot(slot: PerformanceSlot): boolean {
  return !slot.context || (slot.contextRole === "after" && Boolean(slot.tieGhost));
}

export function firstPerformedSlotIndex<T extends PerformanceSlot>(
  slots: readonly T[]
): number {
  return slots.findIndex(isPerformedSlot);
}

export function nextPerformedSlotIndex<T extends PerformanceSlot>(
  slots: readonly T[],
  fromIndex: number
): number {
  for (let index = fromIndex + 1; index < slots.length; index += 1) {
    if (isPerformedSlot(slots[index]!)) return index;
  }
  return -1;
}
