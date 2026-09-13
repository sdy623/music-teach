import type { ScoreIR } from "../ir/score";
import type { LyricBlock, LyricCell } from "../ir/lyric";
import type { BarlineEvent, MeterEvent, NoteEvent, RestEvent, RhythmEvent, VoiceEvent } from "../ir/voice";
import { estimateEventWidth } from "../layout/horizontalSpacing";
import { buildEventTiming, type EventTiming } from "../notation/eventTiming";
import {
  durationWithoutAugmentation,
  locateBeat,
  meterBeatGroups,
  totalDurationQuarters
} from "../notation/jianpuRules";
import {
  displayTitleText,
  formatKeyOfOneForDisplay,
  parseKeyAndMeterMarks,
  parseTempoExpression,
  parseTitleCredits,
  parseTitleTags
} from "../parser/parseTitle";
import type {
  BuildLessonDeckOptions,
  JianpuLessonDeck,
  JianpuPhraseFrame,
  PhraseBreakStrength,
  PhraseCurve,
  PhraseLyricCell,
  PhraseMeasure,
  PhraseSlot
} from "./types";

interface AlignedCell {
  cell: LyricCell;
  event?: VoiceEvent;
  sustainIndex?: number;
}

interface LyricTarget {
  event: NoteEvent | RestEvent | RhythmEvent;
  sustainIndex: number;
  acceptsSyllable: boolean;
  acceptsExtension: boolean;
}

interface ResolvedKeyChange {
  id: string;
  keyOfOne: string;
  display: string;
  event: NoteEvent | RestEvent | RhythmEvent;
  semitoneShift?: number;
}

const NATURAL_KEY_PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

interface PhraseDraft {
  block: LyricBlock;
  cells: AlignedCell[];
  breakStrength: PhraseBreakStrength;
}

const DEFAULT_METER = { numerator: 4, denominator: 4 };

export function buildLessonDeck(score: ScoreIR, options: BuildLessonDeckOptions = {}): JianpuLessonDeck {
  const voice = score.voices[0];
  const title = displayTitleText(score.title.title) || "Untitled";
  const subtitle = displayTitleText(score.title.subTitle2 || score.title.subTitle) || undefined;
  const titleCredits = parseTitleCredits(score.title.wordsByAndMusicBy);
  const artist = titleCredits
    .filter((credit) => credit.role === "vocals")
    .map((credit) => credit.name)
    .join(" · ") || undefined;
  const credits = titleCredits.map((credit) =>
    `${credit.name}${credit.roleLabel ? ` ${credit.roleLabel}` : ""}`
  );
  const tags = [...new Set([...parseTitleTags(score.title), ...(options.tags ?? [])])];

  if (!voice) {
    return {
      id: options.id ?? slugify(title),
      title,
      subtitle,
      artist,
      credits,
      tags,
      phrases: [],
      diagnostics: score.diagnostics
    };
  }

  const timing = buildEventTiming(voice.events, score);
  const resolvedKeyChanges = resolveScoreKeyChanges(score, voice.events);
  const drafts = score.lyrics.flatMap((block) =>
    splitLyricBlock(
      block,
      voice.events,
      options.softBreakMode ?? "every-separator",
      options.joinSoftBreaks ?? [],
      options.splitPhrases ?? []
    )
  );
  const anchoredDrafts = applyPhraseAnchors(drafts, voice.events, options.phraseAnchors ?? []);
  const minimumCells = options.minimumCells ?? 1;
  const phrases = anchoredDrafts
    .filter((draft) => draft.cells.filter((entry) => entry.cell.consumesNoteSlot).length >= minimumCells)
    .map((draft, index) =>
      buildPhraseFrame(
        score,
        draft,
        index,
        timing,
        resolvedKeyChanges,
        options.teachingByPhrase?.[index]
      )
    );
  assignKeyChangesToPhrases(phrases, resolvedKeyChanges, voice.events);

  return {
    id: options.id ?? slugify(title),
    title,
    subtitle,
    artist,
    credits,
    tags,
    phrases,
    diagnostics: score.diagnostics
  };
}

export interface InstrumentalMeasureFrameOptions {
  idPrefix?: string;
  label?: string;
  annotation?: string;
}

export function buildInstrumentalMeasureFrame(
  score: ScoreIR,
  startMeasure: number,
  endMeasure: number,
  index: number,
  options: InstrumentalMeasureFrameOptions = {}
): JianpuPhraseFrame | undefined {
  const voice = score.voices[0];
  if (!voice || endMeasure < startMeasure) return undefined;

  const phraseEvents = voice.events.filter(
    (event) =>
      (event.measure ?? 0) >= startMeasure &&
      (event.measure ?? 0) <= endMeasure
  );
  const slotEvents = phraseEvents.filter(isSlotEvent);
  const firstEvent = slotEvents[0];
  const lastEvent = slotEvents.at(-1);
  if (!firstEvent || !lastEvent) return undefined;

  const timing = buildEventTiming(voice.events, score);
  const slots = buildPhraseSlots(phraseEvents, timing, new Map());
  const titleMeter = initialKeyMeter(score);
  const resolvedKeyChanges = resolveScoreKeyChanges(score, voice.events);
  const activeKeyChange = resolvedKeyChanges
    .filter((change) => change.event.position <= firstEvent.position)
    .at(-1);
  const tempo = parseTempoExpression(score.title.expression);
  const measureCount = endMeasure - startMeasure + 1;
  const label = options.label ?? "过门";
  const frame: JianpuPhraseFrame = {
    id: `${options.idPrefix ?? "instrumental"}-${startMeasure}-${endMeasure}`,
    index,
    kind: "instrumental",
    layoutDensity: "compact",
    sourceBlockId: `instrumental-${startMeasure}-${endMeasure}`,
    title: displayTitleText(score.title.title) || "Untitled",
    subtitle: displayTitleText(score.title.subTitle) || undefined,
    keyOfOne: formatKeyOfOneForDisplay(
      activeKeyChange?.keyOfOne ?? titleMeter.keyOfOne
    ),
    titleMeter: {
      numerator: titleMeter.numerator,
      denominator: titleMeter.denominator
    },
    tempo: tempo?.bpm,
    expression: tempo?.expressionText,
    lyricText: "",
    normalizedText: label,
    breakStrength: 3,
    sourceAnchor: {
      startMeasure,
      startNote: firstEvent.noteIndex ?? 1,
      endMeasure,
      endNote: lastEvent.noteIndex ?? 1,
      startsInsideMeasure: false,
      endsInsideMeasure: false
    },
    lyricCells: [],
    measures: buildPhraseMeasures(phraseEvents, slots, score),
    slots,
    curves: buildPhraseCurves(score, phraseEvents),
    keyChanges: [],
    teaching: {
      surface: label,
      coachNote:
        options.annotation ?? `原曲同步${label} · 连续 ${measureCount} 小节`
    }
  };

  assignKeyChangesToPhrases(
    [frame],
    resolvedKeyChanges.filter(
      (change) =>
        change.event.position >= firstEvent.position &&
        change.event.position <= lastEvent.position
    ),
    voice.events
  );
  return frame;
}

export interface ExpandPhraseFrameOptions {
  extendToBarline?: boolean;
  fullMeasures?: boolean;
}

export function expandPhraseFrameToMusicRange(
  score: ScoreIR,
  frame: JianpuPhraseFrame,
  options: ExpandPhraseFrameOptions = {}
): JianpuPhraseFrame {
  const voice = score.voices[0];
  if (!voice || frame.slots.length === 0) return frame;

  const sourceEventIds = new Set(frame.slots.map((slot) => slot.sourceEventId));
  const boundaryEvents = voice.events.filter(
    (event) => isSlotEvent(event) && sourceEventIds.has(event.id)
  );
  const firstEvent = boundaryEvents[0];
  const lastEvent = boundaryEvents.at(-1);
  if (!firstEvent || !lastEvent) return frame;

  let startPosition = firstEvent.position;
  let endPosition = lastEvent.position;
  if (options.fullMeasures) {
    const firstMeasure = firstEvent.measure ?? 1;
    const lastMeasure = lastEvent.measure ?? firstMeasure;
    const measureEvents = voice.events.filter((event) => {
      const measure = event.measure ?? 0;
      return measure >= firstMeasure && measure <= lastMeasure;
    });
    startPosition = measureEvents[0]?.position ?? startPosition;
    endPosition = measureEvents.at(-1)?.position ?? endPosition;
  } else if (options.extendToBarline) {
    const lastEventIndex = voice.events.indexOf(lastEvent);
    for (let index = lastEventIndex + 1; index < voice.events.length; index += 1) {
      const event = voice.events[index]!;
      if ((event.measure ?? lastEvent.measure) !== lastEvent.measure) break;
      endPosition = event.position;
      if (event.kind === "barline") break;
    }
  }

  const phraseEvents = voice.events.filter(
    (event) => event.position >= startPosition && event.position <= endPosition
  );
  const lyricBySlot = new Map(
    frame.lyricCells.flatMap((cell) => cell.eventId ? [[cell.eventId, cell] as const] : [])
  );
  const timing = buildEventTiming(voice.events, score);
  const eventPositions = new Map(
    phraseEvents.map((event) => [event.id, event.position] as const)
  );
  const slots = buildPhraseSlots(phraseEvents, timing, lyricBySlot).map((slot) => {
    const position = eventPositions.get(slot.sourceEventId);
    const contextRole: PhraseSlot["contextRole"] =
      options.fullMeasures && position !== undefined
      ? position < firstEvent.position
        ? "before"
        : position > lastEvent.position
          ? "after"
          : undefined
      : undefined;
    return contextRole
      ? { ...slot, context: true, contextRole }
      : slot;
  });

  return {
    ...frame,
    slots,
    measures: buildPhraseMeasures(phraseEvents, slots, score),
    curves: buildPhraseCurves(score, phraseEvents),
    sourceAnchor: options.fullMeasures
      ? frame.sourceAnchor
      : {
          ...frame.sourceAnchor,
          endsInsideMeasure: !phraseEndsAtBarline(phraseEvents)
        }
  };
}

export function synchronizePhraseKeyChanges(
  score: ScoreIR,
  phrases: JianpuPhraseFrame[]
): void {
  const events = score.voices[0]?.events;
  if (!events) return;
  phrases.forEach((phrase) => {
    phrase.keyChanges = [];
  });
  assignKeyChangesToPhrases(
    phrases,
    resolveScoreKeyChanges(score, events),
    events
  );
}

export function rebuildPhraseFrameToPerformanceRange(
  score: ScoreIR,
  frame: JianpuPhraseFrame,
  nextFrame?: JianpuPhraseFrame,
  previousFrame?: JianpuPhraseFrame,
  leadingRestMeasures: readonly number[] = []
): JianpuPhraseFrame {
  const voice = score.voices[0];
  if (!voice) return frame;

  const findAnchorEvent = (anchor: { startMeasure: number; startNote: number }) =>
    voice.events.find(
      (event) =>
        isSlotEvent(event) &&
        event.measure === anchor.startMeasure &&
        event.noteIndex === anchor.startNote
    );
  const firstEvent = findAnchorEvent(frame.sourceAnchor);
  const lastEvent = voice.events.find(
    (event) =>
      isSlotEvent(event) &&
      event.measure === frame.sourceAnchor.endMeasure &&
      event.noteIndex === frame.sourceAnchor.endNote
  );
  if (!firstEvent || !lastEvent) return frame;

  const timing = buildEventTiming(voice.events, score);
  const nextEvent = nextFrame ? findAnchorEvent(nextFrame.sourceAnchor) : undefined;
  const nextLeadingRestPosition = nextFrame
    ? leadingRestPosition(
        score,
        voice.events,
        timing,
        nextFrame,
        frame,
        leadingRestMeasures
      )
    : undefined;
  const nextBoundaryPosition = nextLeadingRestPosition ?? nextEvent?.position;
  const lastMeasure = lastEvent.measure ?? frame.sourceAnchor.endMeasure;
  const maximumTrailingMeasure = lastMeasure + 1;
  const lastIndex = voice.events.indexOf(lastEvent);
  let endPosition = lastEvent.position;
  for (let index = lastIndex + 1; index < voice.events.length; index += 1) {
    const event = voice.events[index]!;
    if (nextBoundaryPosition !== undefined && event.position >= nextBoundaryPosition) break;
    if ((event.measure ?? lastMeasure) > maximumTrailingMeasure) break;
    if (isSlotEvent(event)) {
      const belongsToPhraseEnd =
        event.kind === "rest" ||
        (event.kind === "note" && event.visualRole === "tie-ghost");
      if (!belongsToPhraseEnd) break;
    }
    endPosition = event.position;
    if (event.kind === "return") break;
  }

  const phraseLeadingRestPosition = previousFrame
    ? leadingRestPosition(
        score,
        voice.events,
        timing,
        frame,
        previousFrame,
        leadingRestMeasures
      )
    : undefined;
  const startEvent = phraseLeadingRestPosition === undefined
    ? firstEvent
    : voice.events.find((event) => event.position === phraseLeadingRestPosition) ?? firstEvent;
  const firstIndex = voice.events.indexOf(startEvent);
  let startPosition = startEvent.position;
  for (let index = firstIndex - 1; index >= 0; index -= 1) {
    const event = voice.events[index]!;
    if (isSlotEvent(event)) break;
    startPosition = event.position;
    if (event.kind === "barline") break;
  }

  const phraseEvents = voice.events.filter(
    (event) => event.position >= startPosition && event.position <= endPosition
  );
  const lyricBySlot = new Map(
    frame.lyricCells.flatMap((cell) =>
      cell.eventId ? [[cell.eventId, cell] as const] : []
    )
  );
  const slots = buildPhraseSlots(
    phraseEvents,
    timing,
    lyricBySlot
  );
  return {
    ...frame,
    slots,
    measures: buildPhraseMeasures(phraseEvents, slots, score),
    curves: buildPhraseCurves(score, phraseEvents),
    sourceAnchor: {
      ...frame.sourceAnchor,
      endsInsideMeasure: !phraseEndsAtBarline(phraseEvents)
    }
  };
}

function leadingRestPosition(
  score: ScoreIR,
  events: VoiceEvent[],
  timing: Map<string, EventTiming>,
  frame: JianpuPhraseFrame,
  previousFrame: JianpuPhraseFrame,
  alignedMeasures: readonly number[]
): number | undefined {
  if (alignedMeasures.includes(frame.sourceAnchor.startMeasure)) {
    const alignedPosition = leadingRestRunBeforePhrase(
      events,
      frame.sourceAnchor.startMeasure,
      frame.sourceAnchor.startNote
    );
    if (alignedPosition !== undefined) return alignedPosition;
  }
  return leadingCompleteRestMeasurePosition(
    score,
    events,
    timing,
    frame,
    previousFrame
  );
}

function leadingRestRunBeforePhrase(
  events: VoiceEvent[],
  measure: number,
  firstNote: number
): number | undefined {
  const firstEventIndex = events.findIndex(
    (event) =>
      isSlotEvent(event) &&
      event.measure === measure &&
      event.noteIndex === firstNote
  );
  if (firstEventIndex < 0) return undefined;

  let firstRestPosition: number | undefined;
  for (let index = firstEventIndex - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.measure !== measure) break;
    if (!isSlotEvent(event)) continue;
    if (event.kind !== "rest") break;
    firstRestPosition = event.position;
  }
  return firstRestPosition;
}

function leadingCompleteRestMeasurePosition(
  score: ScoreIR,
  events: VoiceEvent[],
  timing: Map<string, EventTiming>,
  frame: JianpuPhraseFrame,
  previousFrame: JianpuPhraseFrame
): number | undefined {
  const firstMeasure = frame.sourceAnchor.startMeasure;
  const candidateMeasure = firstMeasure - 1;
  if (candidateMeasure < previousFrame.sourceAnchor.endMeasure) return undefined;

  const measureSlots = events.filter(
    (event): event is NoteEvent | RestEvent | RhythmEvent =>
      isSlotEvent(event) && event.measure === candidateMeasure
  );
  if (!measureSlots.length || measureSlots.some((event) => event.kind !== "rest")) {
    return undefined;
  }

  const activeMeter = meterAtMeasure(score, candidateMeasure);
  const nominalDurationQuarters = (activeMeter.numerator * 4) / activeMeter.denominator;
  const timedSlots = measureSlots.flatMap((event) => {
    const eventTiming = timing.get(event.id);
    return eventTiming ? [{ event, timing: eventTiming }] : [];
  });
  if (timedSlots.length !== measureSlots.length) return undefined;

  const firstOffset = Math.min(
    ...timedSlots.map(({ timing: eventTiming }) => eventTiming.measureOffsetQuarter)
  );
  const lastEnd = Math.max(
    ...timedSlots.map(
      ({ timing: eventTiming }) =>
        eventTiming.measureOffsetQuarter + eventTiming.durationQuarters
    )
  );
  if (firstOffset > 1e-6 || lastEnd < nominalDurationQuarters - 1e-6) {
    return undefined;
  }

  return measureSlots[0]?.position;
}

function splitLyricBlock(
  block: LyricBlock,
  events: VoiceEvent[],
  softBreakMode: NonNullable<BuildLessonDeckOptions["softBreakMode"]>,
  joinRules: NonNullable<BuildLessonDeckOptions["joinSoftBreaks"]>,
  splitRules: NonNullable<BuildLessonDeckOptions["splitPhrases"]>
): PhraseDraft[] {
  const aligned = alignLyricCells(block, events);
  const drafts: PhraseDraft[] = [];
  let current: AlignedCell[] = [];

  const flush = (strength: PhraseBreakStrength): void => {
    if (current.some((entry) => entry.cell.consumesNoteSlot)) {
      drafts.push({ block, cells: current, breakStrength: strength });
    }
    current = [];
  };

  for (const entry of aligned) {
    if (entry.cell.kind === "separator") {
      flush(Math.min(3, entry.cell.raw.length) as PhraseBreakStrength);
      continue;
    }
    current.push(entry);
  }

  flush(1);
  const autoMerged = softBreakMode === "linguistic" ? mergeShortSoftPhrases(drafts) : drafts;
  const joined = joinConfiguredSoftBreaks(autoMerged, joinRules);
  return splitConfiguredPhrases(joined, splitRules);
}

function alignLyricCells(block: LyricBlock, events: VoiceEvent[]): AlignedCell[] {
  const slots = events.filter(isSlotEvent);
  const startPosition = resolveBlockStartPosition(block, slots);
  return alignCellSequence(block.cells, events, startPosition);
}

function alignCellSequence(
  cells: LyricCell[],
  events: VoiceEvent[],
  startPosition: number
): AlignedCell[] {
  const targets = buildLyricTargets(events);
  const firstTarget = targets.findIndex((target) => target.event.position >= startPosition);
  let cursor = firstTarget < 0 ? targets.length : firstTarget;

  return cells.map((cell): AlignedCell => {
    if (!cell.consumesNoteSlot) {
      if (cell.kind !== "separator") return { cell };
      const skipSlots = cell.skipSlots ?? cell.raw.length;
      cursor = Math.min(targets.length, cursor + skipSlots);
      return { cell };
    }

    const acceptsCell = (target: LyricTarget): boolean =>
      cell.kind === "extension" ? target.acceptsExtension : target.acceptsSyllable;
    while (cursor < targets.length && !acceptsCell(targets[cursor]!)) cursor += 1;

    const target = targets[cursor];
    if (target) cursor += 1;
    return {
      cell,
      event: target?.event,
      sustainIndex: target?.sustainIndex
    };
  });
}

function applyPhraseAnchors(
  drafts: PhraseDraft[],
  events: VoiceEvent[],
  rules: NonNullable<BuildLessonDeckOptions["phraseAnchors"]>
): PhraseDraft[] {
  if (!rules.length) return drafts;

  return drafts.map((draft) => {
    const rule = rules.find(
      (candidate) => normalizeDraft(draft) === normalizeRuleText(candidate.text)
    );
    if (!rule) return draft;

    const firstEvent = events.find(
      (event) =>
        isSlotEvent(event) &&
        event.measure === rule.measure &&
        event.noteIndex === rule.note
    );
    if (!firstEvent) return draft;

    return {
      ...draft,
      cells: alignCellSequence(
        draft.cells.map((entry) => entry.cell),
        events,
        firstEvent.position
      )
    };
  });
}

function buildLyricTargets(events: VoiceEvent[]): LyricTarget[] {
  return events.flatMap((event): LyricTarget[] => {
    if (!isSlotEvent(event)) return [];

    const targets: LyricTarget[] = [
      {
        event,
        sustainIndex: 0,
        acceptsSyllable: event.kind === "rest" ? false : event.lyricAlignable,
        acceptsExtension: event.kind !== "rest"
      }
    ];
    const dashCount = event.duration.dashes;
    for (let sustainIndex = 1; sustainIndex <= dashCount; sustainIndex += 1) {
      targets.push({
        event,
        sustainIndex,
        acceptsSyllable: false,
        acceptsExtension: event.kind !== "rest"
      });
    }
    return targets;
  });
}

function resolveBlockStartPosition(block: LyricBlock, slots: VoiceEvent[]): number {
  const inMeasure = slots.filter((event) => event.measure === block.anchor.measure);
  const local = inMeasure.find((event) => (event.noteIndex ?? 0) >= block.anchor.note);
  const maxLocalNote = inMeasure.reduce((max, event) => Math.max(max, event.noteIndex ?? 0), 0);

  if (local && block.anchor.note <= maxLocalNote) return local.position;
  return slots[block.anchor.note - 1]?.position ?? Number.POSITIVE_INFINITY;
}

function buildPhraseFrame(
  score: ScoreIR,
  draft: PhraseDraft,
  index: number,
  timing: Map<string, EventTiming>,
  resolvedKeyChanges: ResolvedKeyChange[],
  teaching: JianpuPhraseFrame["teaching"]
): JianpuPhraseFrame {
  const voice = score.voices[0]!;
  const alignedEvents = draft.cells.map((entry) => entry.event).filter((event): event is VoiceEvent => Boolean(event));
  const firstEvent = alignedEvents[0];
  const lastEvent = alignedEvents[alignedEvents.length - 1];
  const startPosition = startPositionWithContext(voice.events, firstEvent);
  const endPosition = endPositionWithBarline(voice.events, lastEvent);
  const lyricBySlot = new Map<string, PhraseLyricCell>();
  const lyricCells = draft.cells.map((entry) => {
    const cell = toPhraseLyricCell(entry);
    if (cell.eventId) lyricBySlot.set(cell.eventId, cell);
    return cell;
  });
  const phraseEvents = voice.events.filter((event) => event.position >= startPosition && event.position <= endPosition);
  const slots = buildPhraseSlots(phraseEvents, timing, lyricBySlot);
  const measures = buildPhraseMeasures(phraseEvents, slots, score);
  const curves = buildPhraseCurves(score, phraseEvents);
  const titleMeter = initialKeyMeter(score);
  const activeKeyChange = resolvedKeyChanges
    .filter((change) => change.event.position <= (firstEvent?.position ?? Number.NEGATIVE_INFINITY))
    .at(-1);
  const tempo = parseTempoExpression(score.title.expression);
  const normalizedText = draft.cells
    .filter((entry) => entry.cell.kind === "syllable" || entry.cell.kind === "multiChar")
    .map((entry) => entry.cell.normalizedText ?? entry.cell.display)
    .join("")
    .replace(/[\sー]+/g, "");

  return {
    id: `${draft.block.id}-phrase-${index + 1}`,
    index,
    sourceBlockId: draft.block.id,
    title: displayTitleText(score.title.title) || "Untitled",
    subtitle: displayTitleText(score.title.subTitle) || undefined,
    keyOfOne: formatKeyOfOneForDisplay(activeKeyChange?.keyOfOne ?? titleMeter.keyOfOne),
    titleMeter: {
      numerator: titleMeter.numerator,
      denominator: titleMeter.denominator
    },
    tempo: tempo?.bpm,
    expression: tempo?.expressionText,
    lyricText: draft.cells
      .filter((entry) => entry.cell.kind !== "separator")
      .map((entry) => entry.cell.display)
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
    normalizedText,
    breakStrength: draft.breakStrength,
    sourceAnchor: {
      startMeasure: firstEvent?.measure ?? draft.block.anchor.measure,
      startNote: firstEvent?.noteIndex ?? draft.block.anchor.note,
      endMeasure: lastEvent?.measure ?? draft.block.anchor.measure,
      endNote: lastEvent?.noteIndex ?? draft.block.anchor.note,
      startsInsideMeasure: (firstEvent?.noteIndex ?? 1) > 1,
      endsInsideMeasure: !phraseEndsAtBarline(phraseEvents)
    },
    lyricCells,
    measures,
    slots,
    curves,
    keyChanges: [],
    teaching
  };
}

function resolveScoreKeyChanges(score: ScoreIR, events: VoiceEvent[]): ResolvedKeyChange[] {
  const slotEvents = events.filter(isSlotEvent);
  const absoluteSymbolEvents = events.filter(isJPWAbsoluteSymbolEvent);

  const resolved = score.semantic.keyChanges
    .map((change): ResolvedKeyChange | undefined => {
      let sourceEvent: VoiceEvent | undefined;
      const anchor = change.anchor;

      if (anchor.kind === "measure-note") {
        sourceEvent = slotEvents.find(
          (event) =>
            event.measure === anchor.measure &&
            event.noteIndex === anchor.note
        );
      } else if (anchor.kind === "absolute-symbol-index") {
        sourceEvent =
          absoluteSymbolEvents[Math.max(0, anchor.index - 1)] ??
          absoluteSymbolEvents.at(-1);
      } else if (anchor.kind === "return-or-row") {
        const measure = Number(anchor.raw.match(/^(\d+)/)?.[1]);
        if (Number.isFinite(measure)) {
          sourceEvent =
            absoluteSymbolEvents.find((event) => (event.measure ?? 0) >= measure) ??
            absoluteSymbolEvents.at(-1);
        }
      }

      if (!sourceEvent) return undefined;
      const event = isSlotEvent(sourceEvent)
        ? sourceEvent
        : slotEvents.find((candidate) => candidate.position >= sourceEvent.position) ??
          slotEvents.at(-1);
      if (!event) return undefined;

      return {
        id: change.id,
        keyOfOne: change.keyOfOne,
        display: change.display,
        event
      };
    })
    .filter((change): change is ResolvedKeyChange => Boolean(change))
    .sort((left, right) => left.event.position - right.event.position);

  let previousKey = initialKeyMeter(score).keyOfOne;
  return resolved.map((change) => {
    const semitoneShift = keySemitoneShift(previousKey, change.keyOfOne);
    previousKey = change.keyOfOne;
    return { ...change, semitoneShift };
  });
}

function isJPWAbsoluteSymbolEvent(event: VoiceEvent): boolean {
  if (
    event.kind === "return" ||
    event.kind === "slurMarker" ||
    event.kind === "tupletMarker" ||
    event.kind === "voltaMarker"
  ) {
    return false;
  }
  if (
    event.kind === "unknown" &&
    /^\{(?:C:[^{}]*|YanYin|BaoChiYin)\}$/i.test(event.raw.trim())
  ) {
    return false;
  }
  return estimateEventWidth(event) > 0;
}

function assignKeyChangesToPhrases(
  phrases: JianpuPhraseFrame[],
  keyChanges: ResolvedKeyChange[],
  events: VoiceEvent[]
): void {
  const eventPositions = new Map(events.map((event) => [event.id, event.position]));
  const phraseStartPosition = (phrase: JianpuPhraseFrame): number =>
    Math.min(
      ...phrase.slots
        .filter((slot) => slot.kind !== "sustain")
        .map((slot) => eventPositions.get(slot.sourceEventId) ?? Number.POSITIVE_INFINITY)
    );

  const containsSourceAnchor = (
    phrase: JianpuPhraseFrame,
    event: NoteEvent | RestEvent | RhythmEvent
  ): boolean => {
    const measure = event.measure ?? 0;
    const note = event.noteIndex ?? 0;
    const start = phrase.sourceAnchor;
    if (measure < start.startMeasure || measure > start.endMeasure) return false;
    if (measure === start.startMeasure && note < start.startNote) return false;
    if (measure === start.endMeasure && note > start.endNote) return false;
    return true;
  };

  keyChanges.forEach((change) => {
    const containing =
      phrases.find((phrase) => containsSourceAnchor(phrase, change.event)) ??
      phrases.find((phrase) =>
        phrase.slots.some(
          (slot) => slot.sourceEventId === change.event.id && !slot.context
        )
      ) ??
      phrases.find((phrase) =>
        phrase.slots.some((slot) => slot.sourceEventId === change.event.id)
      );
    const target =
      containing ??
      phrases.find((phrase) => phraseStartPosition(phrase) >= change.event.position) ??
      phrases.at(-1);
    if (!target) return;

    const renderSlot =
      target.slots.find(
        (slot) =>
          slot.kind !== "sustain" && slot.sourceEventId === change.event.id
      ) ??
      target.slots
        .filter((slot) => slot.kind !== "sustain")
        .find(
          (slot) =>
            (eventPositions.get(slot.sourceEventId) ?? Number.POSITIVE_INFINITY) >=
            change.event.position
        ) ??
      target.slots.filter((slot) => slot.kind !== "sustain").at(-1);
    if (!renderSlot) return;

    target.keyChanges.push({
      id: change.id,
      eventId: renderSlot.sourceEventId,
      measure: change.event.measure ?? renderSlot.measure,
      noteIndex: change.event.noteIndex ?? renderSlot.noteIndex,
      keyOfOne: formatKeyOfOneForDisplay(change.keyOfOne),
      display: change.display,
      semitoneShift: change.semitoneShift
    });
  });
}

function toPhraseLyricCell(entry: AlignedCell): PhraseLyricCell {
  const cell = entry.cell;
  return {
    id: cell.id,
    kind: cell.kind === "separator" ? "space" : cell.kind,
    raw: cell.raw,
    display: cell.kind === "separator" ? "" : cell.display,
    normalizedText: cell.normalizedText ?? "",
    tokenId: cell.tokenId,
    inheritedTokenId: cell.inheritedTokenId,
    eventId: entry.event && cell.kind !== "separator"
      ? phraseSlotEventId(entry.event.id, entry.sustainIndex ?? 0)
      : undefined
  };
}

function buildPhraseSlots(
  events: VoiceEvent[],
  timing: Map<string, EventTiming>,
  lyricBySlot: Map<string, PhraseLyricCell>
): PhraseSlot[] {
  const slots: PhraseSlot[] = [];

  for (const event of events) {
    if (!isSlotEvent(event)) continue;
    const eventTiming = timing.get(event.id);
    if (!eventTiming) continue;
    const duration = event.kind === "note" || event.kind === "rest" || event.kind === "rhythm" ? event.duration : undefined;
    const baseDurationQuarter =
      durationWithoutAugmentation(duration ?? { underlines: 0, dots: 0 }) * eventTiming.durationScale;
    const locatedBeat = locateBeat(
      eventTiming.measureOffsetQuarter,
      eventTiming.numerator,
      eventTiming.denominator
    );
    const baseSlot: PhraseSlot = {
      id: `slot-${event.id}`,
      eventId: event.id,
      sourceEventId: event.id,
      raw: event.raw,
      kind: event.kind,
      measure: event.measure ?? 0,
      noteIndex: event.noteIndex ?? 0,
      measureOffsetQuarter: eventTiming.measureOffsetQuarter,
      durationQuarters: baseDurationQuarter,
      beatIndex: locatedBeat.index,
      beatOffset: locatedBeat.offset,
      durationBeats: baseDurationQuarter / locatedBeat.duration,
      degree: event.kind === "note" ? event.degree : undefined,
      accidental: event.kind === "note" ? event.accidental : undefined,
      octave: event.kind === "note" ? event.octave : 0,
      underlines: duration?.underlines ?? 0,
      dots: duration?.dots ?? 0,
      attack: event.kind === "note" ? event.attack : event.kind === "rhythm",
      tieGhost: event.kind === "note" && event.visualRole === "tie-ghost",
      lyricCell: lyricBySlot.get(event.id)
    };
    slots.push(baseSlot);

    const dashCount = duration?.dashes ?? 0;
    for (let dashIndex = 0; dashIndex < dashCount; dashIndex += 1) {
      const sustainIndex = dashIndex + 1;
      const sustainEventId = phraseSlotEventId(event.id, sustainIndex);
      const measureOffsetQuarter =
        eventTiming.measureOffsetQuarter +
        baseDurationQuarter +
        dashIndex * eventTiming.durationScale;
      const dashBeat = locateBeat(measureOffsetQuarter, eventTiming.numerator, eventTiming.denominator);
      slots.push({
        ...baseSlot,
        id: `slot-${sustainEventId}`,
        eventId: sustainEventId,
        raw: "-",
        kind: "sustain",
        measureOffsetQuarter,
        durationQuarters: eventTiming.durationScale,
        beatIndex: dashBeat.index,
        beatOffset: dashBeat.offset,
        durationBeats: eventTiming.durationScale / dashBeat.duration,
        degree: undefined,
        accidental: undefined,
        octave: 0,
        underlines: 0,
        dots: 0,
        attack: false,
        tieGhost: baseSlot.tieGhost,
        lyricCell: lyricBySlot.get(sustainEventId)
      });
    }
  }

  return slots;
}

function phraseSlotEventId(eventId: string, sustainIndex: number): string {
  return sustainIndex > 0 ? `${eventId}-dash-${sustainIndex}` : eventId;
}

function buildPhraseMeasures(events: VoiceEvent[], slots: PhraseSlot[], score: ScoreIR): PhraseMeasure[] {
  const measureNumbers = [...new Set(slots.map((slot) => slot.measure))];
  return measureNumbers.map((measureNumber, measureIndex) => {
    const measureEvents = events.filter((event) => event.measure === measureNumber);
    const activeMeter = meterAtMeasure(score, measureNumber);
    const meterEvent = measureEvents.find((event): event is MeterEvent => event.kind === "meter");
    const numerator = meterEvent?.numerator ?? activeMeter.numerator;
    const denominator = meterEvent?.denominator ?? activeMeter.denominator;
    const groupDefinitions = meterBeatGroups(numerator, denominator);
    const measureSlots = slots.filter((slot) => slot.measure === measureNumber);
    const usedBeatIndexes = [...new Set(measureSlots.map((slot) => slot.beatIndex))].sort((a, b) => a - b);
    const sourceIds = new Set(measureSlots.map((slot) => slot.sourceEventId));
    const firstSourceSlot = measureSlots.find((slot) => slot.kind !== "sustain");
    const lastSlotEventIndex = findLastMatchingIndex(measureEvents, (event) =>
      sourceIds.has(event.id)
    );
    const startingBarline =
      measureIndex === 0
        ? findStartingBarline(events, firstSourceSlot?.sourceEventId)
        : undefined;
    const endingBarline =
      lastSlotEventIndex >= 0
        ? measureEvents
            .slice(lastSlotEventIndex + 1)
            .find((event): event is BarlineEvent => event.kind === "barline")
        : undefined;
    const firstBeatIndex = usedBeatIndexes[0] ?? 0;
    const lastUsedBeatIndex = usedBeatIndexes.at(-1) ?? firstBeatIndex;
    const nominalLastBeatIndex = Math.max(0, groupDefinitions.length - 1);
    const lastBeatIndex = endingBarline ? Math.max(lastUsedBeatIndex, nominalLastBeatIndex) : lastUsedBeatIndex;
    const beatIndexes = Array.from(
      { length: Math.max(1, lastBeatIndex - firstBeatIndex + 1) },
      (_, offset) => firstBeatIndex + offset
    );
    const beats = beatIndexes.map((beatIndex) => ({
      id: `measure-${measureNumber}-beat-${beatIndex + 1}`,
      measure: measureNumber,
      index: beatIndex,
      startQuarter: groupDefinitions[beatIndex]?.startQuarter ?? 0,
      durationQuarters: groupDefinitions[beatIndex]?.durationQuarters ?? 1,
      slots: measureSlots
        .filter((slot) => slot.beatIndex === beatIndex)
        .sort((a, b) => a.beatOffset - b.beatOffset || a.noteIndex - b.noteIndex)
    }));
    const nominalDurationQuarters = (numerator * 4) / denominator;
    const firstOffset = Math.min(
      ...measureSlots.map((slot) => slot.measureOffsetQuarter)
    );
    const lastEnd = Math.max(
      ...measureSlots.map(
        (slot) => slot.measureOffsetQuarter + slot.durationQuarters
      )
    );
    const incomplete =
      firstOffset > 1e-6 ||
      lastEnd < nominalDurationQuarters - 1e-6;

    return {
      id: `phrase-measure-${measureNumber}`,
      number: measureNumber,
      numerator,
      denominator,
      meterChanged: shouldRenderInlineMeter(
        score,
        meterEvent,
        activeMeter,
        measureIndex
      ),
      showNumber: firstSourceSlot?.noteIndex === 1 || incomplete,
      incomplete,
      beats,
      startingBarline: startingBarline?.style,
      endingBarline: endingBarline?.style
    };
  });
}

function findLastMatchingIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

function findStartingBarline(
  events: VoiceEvent[],
  firstSourceEventId: string | undefined
): BarlineEvent | undefined {
  if (!firstSourceEventId) return undefined;
  const firstIndex = events.findIndex((event) => event.id === firstSourceEventId);
  for (let index = firstIndex - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.kind === "barline") return event;
    if (isSlotEvent(event)) return undefined;
  }
  return undefined;
}

function shouldRenderInlineMeter(
  score: ScoreIR,
  meterEvent: MeterEvent | undefined,
  activeMeter: { numerator: number; denominator: number },
  measureIndex: number
): boolean {
  if (meterEvent) {
    const previous = meterBeforePosition(score, meterEvent.position);
    return !sameMeter(previous, meterEvent);
  }
  const titleMeter = initialKeyMeter(score);
  return measureIndex === 0 && !sameMeter(titleMeter, activeMeter);
}

function meterBeforePosition(
  score: ScoreIR,
  position: number
): { numerator: number; denominator: number } {
  const initial = initialKeyMeter(score);
  const previous = score.voices[0]?.events
    .filter((event): event is MeterEvent => event.kind === "meter" && event.position < position)
    .at(-1);
  return {
    numerator: previous?.numerator ?? initial.numerator,
    denominator: previous?.denominator ?? initial.denominator
  };
}

function sameMeter(
  left: { numerator: number; denominator: number },
  right: { numerator: number; denominator: number }
): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function buildPhraseCurves(score: ScoreIR, events: VoiceEvent[]): PhraseCurve[] {
  const eventIds = new Set(events.map((event) => event.id));
  const curves: PhraseCurve[] = score.semantic.slurs
    .filter((curve) => eventIds.has(curve.startEventId) && eventIds.has(curve.endEventId))
    .map((curve) => ({ ...curve }));

  events.forEach((event, eventIndex) => {
    if (event.kind !== "tupletMarker") return;
    const tupleEvents = collectTupletEvents(events, eventIndex + 1, event.count);
    const startEvent = tupleEvents[0];
    const endEvent = tupleEvents[tupleEvents.length - 1];
    if (!startEvent || !endEvent) return;
    curves.push({
      id: `tuplet-${event.id}`,
      type: "tuplet",
      startEventId: startEvent.id,
      endEventId: endEvent.id,
      label: String(event.count)
    });
  });

  return curves;
}

function collectTupletEvents(
  events: VoiceEvent[],
  startIndex: number,
  count: number
): Array<NoteEvent | RestEvent | RhythmEvent> {
  const tupleEvents: Array<NoteEvent | RestEvent | RhythmEvent> = [];
  let writtenQuarters = 0;
  const target = tupletWrittenQuarterTarget(count);

  for (let index = startIndex; index < events.length; index += 1) {
    const event = events[index]!;
    if (
      event.kind === "barline" ||
      event.kind === "meter" ||
      event.kind === "return" ||
      event.kind === "standardText" ||
      (event.kind === "slurMarker" && event.role === "end")
    ) {
      break;
    }
    if (!isSlotEvent(event)) continue;
    tupleEvents.push(event);
    writtenQuarters += totalDurationQuarters(event.duration);
    if (writtenQuarters >= target - 1e-6) break;
  }

  return tupleEvents;
}

function tupletWrittenQuarterTarget(count: number): number {
  return count / 2;
}

function initialKeyMeter(score: ScoreIR): { keyOfOne: string; numerator: number; denominator: number } {
  const marks = parseKeyAndMeterMarks(score.title.keyAndMeters);
  const mark = marks.find((candidate) => candidate.keyOfOne || candidate.numerator);
  return {
    keyOfOne: mark?.keyOfOne ?? "C",
    numerator: mark?.numerator ?? DEFAULT_METER.numerator,
    denominator: mark?.denominator ?? DEFAULT_METER.denominator
  };
}

function keySemitoneShift(fromKey: string, toKey: string): number | undefined {
  const from = keyPitchClass(fromKey);
  const to = keyPitchClass(toKey);
  if (from === undefined || to === undefined) return undefined;
  const ascending = (to - from + 12) % 12;
  return ascending > 6 ? ascending - 12 : ascending;
}

function keyPitchClass(value: string): number | undefined {
  const match = value
    .trim()
    .normalize("NFKC")
    .match(/^([#♯b♭n♮]?)([A-Ga-g])([#♯b♭]?)$/);
  if (!match) return undefined;
  const natural = NATURAL_KEY_PITCH_CLASS[match[2]!.toUpperCase()];
  if (natural === undefined) return undefined;
  const accidental = match[1] || match[3];
  const offset = accidental === "#" || accidental === "♯"
    ? 1
    : accidental === "b" || accidental === "♭"
      ? -1
      : 0;
  return (natural + offset + 12) % 12;
}

function meterAtMeasure(score: ScoreIR, measure: number): { numerator: number; denominator: number } {
  const initial = initialKeyMeter(score);
  const meter = score.voices[0]?.events
    .filter((event): event is MeterEvent => event.kind === "meter" && (event.measure ?? 0) <= measure)
    .at(-1);
  return {
    numerator: meter?.numerator ?? initial.numerator,
    denominator: meter?.denominator ?? initial.denominator
  };
}

function endPositionWithBarline(events: VoiceEvent[], lastEvent: VoiceEvent | undefined): number {
  if (!lastEvent) return 0;
  const startIndex = events.indexOf(lastEvent);
  for (let index = startIndex + 1; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.kind === "barline") return event.position;
    if (isSlotEvent(event)) break;
  }
  return lastEvent.position;
}

function startPositionWithContext(events: VoiceEvent[], firstEvent: VoiceEvent | undefined): number {
  if (!firstEvent) return 0;
  const firstIndex = events.indexOf(firstEvent);
  let startPosition = firstEvent.position;

  for (let index = firstIndex - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (isSingableEvent(event)) break;
    startPosition = event.position;
    if (event.kind === "barline") break;
  }

  return startPosition;
}

function phraseEndsAtBarline(events: VoiceEvent[]): boolean {
  return events.at(-1)?.kind === "barline";
}

function isSlotEvent(event: VoiceEvent): event is NoteEvent | RestEvent | RhythmEvent {
  return event.kind === "note" || event.kind === "rest" || event.kind === "rhythm";
}

function isSingableEvent(event: VoiceEvent): event is NoteEvent | RhythmEvent {
  return event.kind === "note" || event.kind === "rhythm";
}

function slugify(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "jianpu-lesson";
}

function mergeShortSoftPhrases(drafts: PhraseDraft[]): PhraseDraft[] {
  const merged: PhraseDraft[] = [];

  drafts.forEach((draft) => {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.breakStrength === 1 &&
      Math.min(phraseCellCount(previous), phraseCellCount(draft)) <= 4 &&
      phraseCellCount(previous) + phraseCellCount(draft) <= 22
    ) {
      previous.cells.push(...draft.cells);
      previous.breakStrength = draft.breakStrength;
      return;
    }
    merged.push({
      ...draft,
      cells: [...draft.cells]
    });
  });

  return merged;
}

function phraseCellCount(draft: PhraseDraft): number {
  return draft.cells
    .filter((entry) => entry.cell.kind === "syllable" || entry.cell.kind === "multiChar")
    .reduce(
      (count, entry) =>
        count + (entry.cell.normalizedText ?? entry.cell.display).replace(/[\sー]+/g, "").length,
      0
    );
}

function joinConfiguredSoftBreaks(
  drafts: PhraseDraft[],
  rules: NonNullable<BuildLessonDeckOptions["joinSoftBreaks"]>
): PhraseDraft[] {
  if (!rules.length) return drafts;
  const joined: PhraseDraft[] = [];

  drafts.forEach((draft) => {
    const previous = joined.at(-1);
    const ruleMatches =
      previous &&
      previous.breakStrength === 1 &&
      rules.some(
        (rule) =>
          normalizeDraft(previous) === normalizeRuleText(rule.left) &&
          normalizeDraft(draft) === normalizeRuleText(rule.right)
      );

    if (previous && ruleMatches) {
      previous.cells.push(...draft.cells);
      previous.breakStrength = draft.breakStrength;
      return;
    }
    joined.push({ ...draft, cells: [...draft.cells] });
  });

  return joined;
}

function normalizeDraft(draft: PhraseDraft): string {
  return draft.cells
    .filter((entry) => entry.cell.kind === "syllable" || entry.cell.kind === "multiChar")
    .map((entry) => entry.cell.normalizedText ?? entry.cell.display)
    .join("")
    .replace(/[\sー]+/g, "");
}

function normalizeRuleText(value: string): string {
  return value.replace(/[\sー]+/g, "");
}

function splitConfiguredPhrases(
  drafts: PhraseDraft[],
  rules: NonNullable<BuildLessonDeckOptions["splitPhrases"]>
): PhraseDraft[] {
  if (!rules.length) return drafts;

  return drafts.flatMap((draft) => {
    const rule = rules.find((candidate) => normalizeDraft(draft) === normalizeRuleText(candidate.text));
    const slotCount = draft.cells.filter((entry) => entry.cell.consumesNoteSlot).length;
    const cuts = [...new Set(rule?.afterSlots ?? [])]
      .filter((cut) => Number.isInteger(cut) && cut > 0 && cut < slotCount)
      .sort((left, right) => left - right);

    if (!cuts.length) return [{ ...draft, cells: [...draft.cells] }];

    const segments: AlignedCell[][] = [];
    let segment: AlignedCell[] = [];
    let consumedSlots = 0;
    let cutIndex = 0;

    draft.cells.forEach((entry) => {
      segment.push(entry);
      if (entry.cell.consumesNoteSlot) consumedSlots += 1;
      if (consumedSlots === cuts[cutIndex]) {
        segments.push(segment);
        segment = [];
        cutIndex += 1;
      }
    });
    if (segment.length) segments.push(segment);

    return segments.map((cells, index) => ({
      ...draft,
      cells,
      breakStrength: index === segments.length - 1 ? draft.breakStrength : 1
    }));
  });
}
