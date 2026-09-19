import { collectVoiceTuplets } from "../semantic/voiceSpans";
import type { ScoreIR } from "../ir/score";
import type { LyricCell } from "../ir/lyric";
import type { DurationIR, NoteEvent, RestEvent, RhythmEvent, TupletMarkerEvent, VoiceEvent } from "../ir/voice";
import { displayTitleText, parseKeyAndMeterMarks, parseTempoExpression } from "../parser/parseTitle";

export interface SparksConversionResult {
  source: string;
  warnings: string[];
}

export interface SparksConversionOptions {
  teachingGhost?: boolean;
  showKeyChanges?: boolean;
}

type ConnectorSuffix = "^" | "~";
type InlineInsert = string;

interface EventInserts {
  before: InlineInsert[];
  after: InlineInsert[];
}

interface ConnectorAnnotations {
  suffixes: Map<string, ConnectorSuffix[]>;
  inserts: Map<string, EventInserts>;
}

interface TimedSparksAtom {
  before: InlineInsert[];
  token: string;
  after: InlineInsert[];
  underlines: number;
  dashes: number;
  quarters: number;
}

interface PendingTuplet {
  marker: TupletMarkerEvent;
  atoms: TimedSparksAtom[];
  originalQuarters: number;
}

export function scoreIRToSparksNMN(score: ScoreIR, options: SparksConversionOptions = {}): SparksConversionResult {
  const teachingGhost = options.teachingGhost ?? true;
  const showKeyChanges = options.showKeyChanges ?? true;
  const warnings: string[] = [];
  const lines: string[] = [];

  pushTextLine(lines, "Dp", displayTitleText(score.title.intro));
  pushTextLine(lines, "Dt", displayTitleText(score.title.title) || "Untitled");
  pushTextLine(lines, "Ds", [displayTitleText(score.title.subTitle), displayTitleText(score.title.subTitle2)].filter(Boolean).join("  "));
  displayTitleText(score.title.wordsByAndMusicBy)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => pushTextLine(lines, "Da", line));

  lines.push(`P: ${buildMusicalProps(score)}`);
  lines.push(
    ["Rp: page_margin_x=8,8", "font_lyrics=CommonLight/700", "sectionorder=paren", teachingGhost ? "grayout=true" : ""]
      .filter(Boolean)
      .join(" ")
  );
  lines.push("===");

  const voice = score.voices[0];
  if (!voice) {
    warnings.push("No .Voice section found for Sparks conversion.");
    lines.push("N: 0 |");
    return { source: lines.join("\n"), warnings };
  }

  const connectorAnnotations = buildConnectorAnnotations(score, teachingGhost);
  const fragments = voiceToSparksFragments(voice.events, warnings, connectorAnnotations, beatUnitQuarters(score));
  const lyricLines = lyricBlocksToSparks(score, teachingGhost);
  const keyChangeLine = showKeyChanges ? keyChangesToSparksAnnotation(score) : "";

  fragments.forEach((fragment, index) => {
    if (index > 0) lines.push("---");
    lines.push(`N: ${fragment || "0 |"}`);
    if (index === 0) {
      if (keyChangeLine) lines.push(keyChangeLine);
      lyricLines.forEach((line) => lines.push(line));
    }
  });

  return { source: lines.join("\n"), warnings };
}

function keyChangesToSparksAnnotation(score: ScoreIR): string {
  const labelsByMeasure = new Map<number, string>();

  score.semantic.keyChanges.forEach((change) => {
    const measure = keyChangeMeasure(change.anchor);
    if (measure === undefined || measure < 1) return;
    labelsByMeasure.set(measure, change.display);
  });

  if (!labelsByMeasure.size) return "";
  const finalMeasure = Math.max(...labelsByMeasure.keys());
  const sections: string[] = [];

  for (let measure = 1; measure <= finalMeasure; measure += 1) {
    const label = labelsByMeasure.get(measure);
    sections.push(label ? `"${escapeSparksString(label)}" |` : "0 |");
  }

  return `A: ${sections.join(" ")}`;
}

function keyChangeMeasure(anchor: ScoreIR["semantic"]["keyChanges"][number]["anchor"]): number | undefined {
  if (anchor.kind === "measure-note") return anchor.measure;
  if (anchor.kind === "return-or-row") {
    const measure = Number(anchor.raw.match(/^(\d+)/)?.[1]);
    return Number.isFinite(measure) ? measure : undefined;
  }
  return undefined;
}

function escapeSparksString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pushTextLine(lines: string[], head: string, value: string): void {
  const text = value.trim();
  if (text) lines.push(`${head}: ${text}`);
}

function buildMusicalProps(score: ScoreIR): string {
  const firstMark = parseKeyAndMeterMarks(score.title.keyAndMeters).find((mark) => mark.keyOfOne || mark.numerator);
  const key = firstMark?.keyOfOne ? `1=${normalizeKeyOfOne(firstMark.keyOfOne)}` : "1=C";
  const meter = firstMark?.numerator && firstMark.denominator ? `${firstMark.numerator}/${firstMark.denominator}` : "4/4";
  const tempo = parseTempoExpression(score.title.expression);
  return [key, meter, tempo ? `qpm=${tempo.bpm}` : ""].filter(Boolean).join(" ");
}

function normalizeKeyOfOne(keyOfOne: string): string {
  if (keyOfOne.startsWith("b")) return "b" + keyOfOne.slice(1);
  if (keyOfOne.startsWith("#")) return "#" + keyOfOne.slice(1);
  if (keyOfOne.startsWith("n")) return keyOfOne.slice(1);
  return keyOfOne;
}

function buildConnectorAnnotations(score: ScoreIR, teachingGhost: boolean): ConnectorAnnotations {
  const events = score.voices[0]?.events ?? [];
  const suffixes = new Map<string, ConnectorSuffix[]>();
  const inserts = new Map<string, EventInserts>();

  const add = (eventId: string, suffix: ConnectorSuffix) => {
    const list = suffixes.get(eventId) ?? [];
    list.push(suffix);
    suffixes.set(eventId, list);
  };

  const addInsert = (eventId: string, side: "before" | "after", insert: InlineInsert) => {
    const value = inserts.get(eventId) ?? { before: [], after: [] };
    if (side === "before") value.before.push(insert);
    else value.after.push(insert);
    inserts.set(eventId, value);
  };

  score.semantic.slurs.forEach((curve) => {
    if (curve.type === "tuplet") return;
    const spanEvents = eventsBetween(events, curve.startEventId, curve.endEventId);
    const spanNotes = spanEvents.filter((event): event is NoteEvent => event.kind === "note");
    if (spanNotes.length < 2) return;

    if (curve.type === "tie" && teachingGhost) {
      spanNotes.slice(0, -1).forEach((note) => add(note.id, "~"));
      return;
    }

    if (curve.type === "slur" && isPhraseSpanTooLargeForSparks(spanEvents, spanNotes)) {
      addInsert(spanNotes[0]!.id, "before", "&lpr;");
      addInsert(spanNotes[spanNotes.length - 1]!.id, "after", "&rpr;");
      return;
    }

    add(spanNotes[0]!.id, "^");
    add(spanNotes[spanNotes.length - 1]!.id, "^");
  });

  return { suffixes, inserts };
}

function eventsBetween(events: VoiceEvent[], startEventId: string, endEventId: string): VoiceEvent[] {
  const startIndex = events.findIndex((event) => event.id === startEventId);
  const endIndex = events.findIndex((event) => event.id === endEventId);
  if (startIndex < 0 || endIndex < 0) return [];
  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return events.slice(from, to + 1);
}

function isPhraseSpanTooLargeForSparks(spanEvents: VoiceEvent[], spanNotes: NoteEvent[]): boolean {
  return spanNotes.length > 8 || spanEvents.some((event) => event.kind === "barline" || event.kind === "return" || event.kind === "meter");
}

function voiceToSparksFragments(
  events: VoiceEvent[],
  warnings: string[],
  connectorAnnotations: ConnectorAnnotations,
  initialBeatUnitQuarters: number
): string[] {
  const fragments: string[] = [];
  let current: string[] = [];
  let measureAtoms: TimedSparksAtom[] = [];
  let beatUnitQuartersValue = initialBeatUnitQuarters;
  let pendingTuplet: PendingTuplet | undefined;
  const tupleEnds = new Set(collectVoiceTuplets(events).map(group => group.members.at(-1)!.id));
  let hasVisibleVoiceContent = false;

  const flush = () => {
    flushMeasure();
    const text = tidySparksTokens(current);
    if (text) fragments.push(text);
    current = [];
  };

  const flushMeasure = () => {
    flushTuplet();
    if (!measureAtoms.length) return;
    current.push(...renderTimedAtomsByBeat(measureAtoms, beatUnitQuartersValue));
    measureAtoms = [];
  };

  const flushTuplet = () => {
    if (!pendingTuplet) return;
    if (pendingTuplet.atoms.length > 0) {
      measureAtoms.push(tupletAtom(pendingTuplet));
    }
    pendingTuplet = undefined;
  };

  const pushTimedEvent = (event: NoteEvent | RestEvent | RhythmEvent, core: string) => {
    hasVisibleVoiceContent = true;
    if (event.graceNotes?.length || event.ornaments?.length) warnings.push("Sparks preview omits grace/ornament marks; use the score or teaching view.");
    if (!pendingTuplet) {
      measureAtoms.push(timedAtom(core, event.duration, connectorAnnotations.suffixes.get(event.id), connectorAnnotations.inserts.get(event.id)));
      return;
    }

    const atom = timedAtom(
      core,
      durationForTupletDisplay(event.duration),
      connectorAnnotations.suffixes.get(event.id),
      connectorAnnotations.inserts.get(event.id)
    );
    pendingTuplet.atoms.push(atom);
    pendingTuplet.originalQuarters += durationQuarters(event.duration);
    if (tupleEnds.has(event.id)) {
      flushTuplet();
    }
  };

  for (const event of events) {
    switch (event.kind) {
      case "note":
        pushTimedEvent(event, noteCore(event));
        break;
      case "rest":
        pushTimedEvent(event, "0");
        break;
      case "rhythm":
        pushTimedEvent(event, "X");
        break;
      case "barline":
        flushMeasure();
        pushBarlineToken(current, event, connectorAnnotations.inserts.get(event.id));
        hasVisibleVoiceContent = true;
        break;
      case "meter":
        flushMeasure();
        current.push(...(connectorAnnotations.inserts.get(event.id)?.before ?? []));
        if (hasVisibleVoiceContent) {
          attachVisibleMeterToCurrentBar(current, event.numerator, event.denominator);
        }
        current.push(...(connectorAnnotations.inserts.get(event.id)?.after ?? []));
        beatUnitQuartersValue = beatUnitFromDenominator(event.denominator);
        break;
      case "return":
        flushMeasure();
        break;
      case "standardText":
        flushMeasure();
        current.push(`&${sanitizeInlineText(event.text)};`);
        break;
      case "tupletMarker":
        flushTuplet();
        pendingTuplet = { marker: event, atoms: [], originalQuarters: 0 };
        break;
      case "slurMarker":
        break;
      case "voltaMarker":
        break;
      case "unknown":
        warnings.push(`Unknown JPW token kept out of Sparks source: ${event.raw}`);
        break;
    }
  }

  flush();
  return fragments.length ? fragments : [tidySparksTokens(current)];
}

function noteCore(event: NoteEvent): string {
  return `${accidentalPrefix(event.accidental)}${event.degree}${octaveSuffix(event.octave)}`;
}

function accidentalPrefix(accidental: NoteEvent["accidental"]): string {
  if (accidental === "sharp") return "#";
  if (accidental === "flat") return "b";
  if (accidental === "natural") return "=";
  return "";
}

function octaveSuffix(octave: number): string {
  if (octave > 0) return "e".repeat(octave);
  if (octave < 0) return "d".repeat(Math.abs(octave));
  return "";
}

function timedToken(core: string, duration: DurationIR, connectorSuffixes: ConnectorSuffix[] = []): string {
  const dotted = core + connectorSuffixes.join("") + ".".repeat(duration.dots);
  const reduced = wrapReduction(dotted, duration.underlines);
  const extenders = Array.from({ length: duration.dashes }, () => "-");
  return [reduced, ...extenders].join(" ");
}

function timedAtom(
  core: string,
  duration: DurationIR,
  connectorSuffixes: ConnectorSuffix[] = [],
  inserts: EventInserts = { before: [], after: [] }
): TimedSparksAtom {
  return {
    before: [...inserts.before],
    token: core + connectorSuffixes.join("") + ".".repeat(duration.dots),
    after: [...inserts.after],
    underlines: duration.underlines,
    dashes: duration.dashes,
    quarters: durationQuarters(duration)
  };
}

function tupletAtom(tuplet: PendingTuplet): TimedSparksAtom {
  const inner = renderReductionGroups(tuplet.atoms).join(" ");
  return {
    before: [],
    token: `T(${inner})`,
    after: [],
    underlines: 0,
    dashes: 0,
    quarters: tuplet.originalQuarters * tupletRealDurationRatio(tuplet.marker.count)
  };
}


function tupletRealDurationRatio(count: number): number {
  return count > 1 ? (count - 1) / count : 1;
}

function durationForTupletDisplay(duration: DurationIR): DurationIR {
  return closestDuration(durationQuarters(duration) * 2);
}

function closestDuration(targetQuarters: number): DurationIR {
  let best: DurationIR = { underlines: 0, dashes: 0, dots: 0 };
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let underlines = 0; underlines <= 4; underlines += 1) {
    for (let dots = 0; dots <= 2; dots += 1) {
      for (let dashes = 0; dashes <= 8; dashes += 1) {
        const candidate = { underlines, dots, dashes };
        const delta = Math.abs(durationQuarters(candidate) - targetQuarters);
        if (delta < bestDelta) {
          best = candidate;
          bestDelta = delta;
        }
      }
    }
  }

  return best;
}

function durationQuarters(duration: DurationIR): number {
  let value = 1 / 2 ** duration.underlines;
  let dotAdd = value / 2;
  for (let index = 0; index < duration.dots; index += 1) {
    value += dotAdd;
    dotAdd /= 2;
  }
  return value + duration.dashes;
}

function beatUnitQuarters(score: ScoreIR): number {
  const titleMeter = parseKeyAndMeterMarks(score.title.keyAndMeters).find((mark) => mark.denominator);
  if (titleMeter?.denominator) return beatUnitFromDenominator(titleMeter.denominator);
  const voiceMeter = score.voices[0]?.events.find((event) => event.kind === "meter");
  if (voiceMeter?.kind === "meter") return beatUnitFromDenominator(voiceMeter.denominator);
  return 1;
}

function beatUnitFromDenominator(denominator: number): number {
  return denominator > 0 ? 4 / denominator : 1;
}

function renderTimedAtomsByBeat(atoms: TimedSparksAtom[], beatUnitQuartersValue: number): string[] {
  const output: string[] = [];
  let beatAtoms: TimedSparksAtom[] = [];
  let beatPosition = 0;
  const unit = beatUnitQuartersValue > 0 ? beatUnitQuartersValue : 1;

  const flushBeat = () => {
    if (!beatAtoms.length) return;
    output.push(...renderReductionGroups(beatAtoms));
    beatAtoms = [];
    beatPosition = 0;
  };

  atoms.forEach((atom) => {
    if (beatAtoms.length && beatPosition + atom.quarters > unit + 1e-6) {
      flushBeat();
    }
    beatAtoms.push(atom);
    beatPosition += atom.quarters;
    if (beatPosition >= unit - 1e-6) {
      flushBeat();
    }
  });

  flushBeat();
  return output;
}

function renderReductionGroups(atoms: TimedSparksAtom[], level = 1): string[] {
  const rendered: string[] = [];
  let index = 0;

  while (index < atoms.length) {
    const atom = atoms[index]!;
    if (atom.underlines >= level) {
      const group: TimedSparksAtom[] = [];
      while (index < atoms.length && atoms[index]!.underlines >= level) {
        group.push(atoms[index]!);
        index += 1;
      }
      rendered.push(wrapReduction(renderReductionGroups(group, level + 1).join(" "), 1));
    } else {
      rendered.push(...atom.before, atom.token, ...Array.from({ length: atom.dashes }, () => "-"), ...atom.after);
      index += 1;
    }
  }

  return rendered;
}

function wrapReduction(token: string, underlines: number): string {
  let out = token;
  for (let index = 0; index < underlines; index += 1) {
    out = `(${out})`;
  }
  return out;
}

function barlineToken(raw: string, style: string): string {
  if (style === "start-repeat") return "||:";
  if (style === "end-repeat") return ":||";
  if (style === "double" || style === "end" || raw === "|]") return "||";
  if (style === "start") return "||";
  return "|";
}

function pushBarlineToken(tokens: string[], event: VoiceEvent, inserts?: EventInserts): void {
  const before = inserts?.before ?? [];
  const after = inserts?.after ?? [];
  const token = barlineToken(event.raw, event.kind === "barline" ? event.style : "");

  if (!tokens.length && !before.length && !after.length && token === "|") {
    return;
  }

  tokens.push(...before, token, ...after);
}

function attachVisibleMeterToCurrentBar(tokens: string[], numerator: number, denominator: number): void {
  const meterAttr = `{${numerator}/${denominator}}`;
  const last = tokens[tokens.length - 1];
  if (last && /^[:|/]+$/.test(last)) {
    tokens[tokens.length - 1] = `${last}${meterAttr}`;
    return;
  }
  tokens.push(`|${meterAttr}`);
}

function sanitizeInlineText(text: string): string {
  return text.replace(/[;&]/g, " ").trim();
}

function tidySparksTokens(tokens: string[]): string {
  return tokens
    .join(" ")
    .replace(/\s+\|/g, " |")
    .replace(/\|\s+\|/g, "||")
    .replace(/\s+/g, " ")
    .trim();
}

function lyricBlocksToSparks(score: ScoreIR, teachingGhost: boolean): string[] {
  const voice = score.voices[0];
  if (!voice || !score.lyrics.length) return [];

  const cellIndexById = buildSparksLyricCellIndexById(score, teachingGhost);

  return Array.from(groupLyricsByTrack(score).entries())
    .sort(([trackA], [trackB]) => trackA - trackB)
    .map(([, blocks]) => {
      const text = blocksToAlignedSparksLyric(blocks, cellIndexById);
      return text ? `Lc: ${text}` : "";
    })
    .filter(Boolean);
}

function buildSparksLyricCellIndexById(score: ScoreIR, teachingGhost: boolean): Map<string, number> {
  const voice = score.voices[0];
  if (!voice) return new Map();

  const rawAlignable = voice.events.filter(isRawLyricAlignable);
  const slotEvents = voice.events.filter(isLyricSlotEvent);
  const visibleAlignable = voice.events.filter((event) => isSparksLyricAlignable(event, teachingGhost));
  const visibleIndexByEventId = new Map(visibleAlignable.map((event, index) => [event.id, index] as const));
  const cellIndexById = new Map<string, number>();

  for (const block of score.lyrics) {
    let rawIndex = findLyricStartIndex(rawAlignable, slotEvents, block);

    for (const cell of block.cells) {
      if (!cell.consumesNoteSlot) continue;
      const rawEvent = rawAlignable[rawIndex];
      if (!rawEvent) break;

      if (teachingGhost && cell.kind === "extension" && isTieGhostEvent(rawEvent)) {
        rawIndex += 1;
        continue;
      }

      const visibleIndex = visibleIndexByEventId.get(rawEvent.id) ?? nextVisibleIndex(rawAlignable, rawIndex + 1, visibleIndexByEventId);
      if (visibleIndex !== undefined) {
        cellIndexById.set(cell.id, visibleIndex);
      }
      rawIndex += 1;
    }
  }

  return cellIndexById;
}

export function eventToSparksToken(event: NoteEvent | RestEvent | RhythmEvent): string {
  if (event.kind === "note") return timedToken(noteCore(event), event.duration);
  if (event.kind === "rest") return timedToken("0", event.duration);
  return timedToken("X", event.duration);
}

function groupLyricsByTrack(score: ScoreIR): Map<number, ScoreIR["lyrics"]> {
  const grouped = new Map<number, ScoreIR["lyrics"]>();
  for (const block of score.lyrics) {
    const list = grouped.get(block.track) ?? [];
    list.push(block);
    grouped.set(block.track, list);
  }
  return grouped;
}

function blocksToAlignedSparksLyric(blocks: ScoreIR["lyrics"], cellIndexById: Map<string, number>): string {
  const parts: string[] = [];
  let cursor = 0;

  const sortedBlocks = [...blocks].sort((left, right) => blockStartIndex(left, cellIndexById) - blockStartIndex(right, cellIndexById));

  for (const block of sortedBlocks) {
    for (const cell of block.cells) {
      if (!cell.consumesNoteSlot) {
        parts.push(nonSlotLyricCellToSparks(cell));
        continue;
      }

      const targetIndex = cellIndexById.get(cell.id);
      if (targetIndex === undefined) continue;

      if (targetIndex > cursor) {
        parts.push(lyricPlaceholderRepeat(targetIndex - cursor));
      }

      parts.push(slotLyricCellToSparks(cell));
      cursor = Math.max(cursor, targetIndex + 1);
    }
  }

  return tidySparksLyric(parts.join(""));
}

function blockStartIndex(block: ScoreIR["lyrics"][number], cellIndexById: Map<string, number>): number {
  for (const cell of block.cells) {
    if (!cell.consumesNoteSlot) continue;
    const index = cellIndexById.get(cell.id);
    if (index !== undefined) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

function slotLyricCellToSparks(cell: LyricCell): string {
  if (cell.kind === "extension") return "_";
  if (cell.kind === "multiChar") return `(${sanitizeGroupedLyricText(cell.display)})`;
  return sanitizeLyricText(cell.display);
}

function nonSlotLyricCellToSparks(cell: LyricCell): string {
  if (cell.kind === "separator" || cell.kind === "space") return " ";
  return "";
}

function lyricPlaceholderRepeat(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "%";
  return `%{${count}}`;
}

function tidySparksLyric(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeLyricText(text: string): string {
  return text.replace(/[%_]/g, " ");
}

function sanitizeGroupedLyricText(text: string): string {
  return sanitizeLyricText(text).replace(/[()]/g, "");
}

function findLyricStartIndex(alignable: VoiceEvent[], slotEvents: VoiceEvent[], block: ScoreIR["lyrics"][number]): number {
  const measureSlotCount = slotEvents
    .filter((event) => event.measure === block.anchor.measure)
    .reduce((max, event) => Math.max(max, event.noteIndex ?? 0), 0);

  if (measureSlotCount > 0 && block.anchor.note <= measureSlotCount) {
    const measureIndex = alignable.findIndex(
      (event) =>
        (event.measure ?? 0) > block.anchor.measure ||
        ((event.measure ?? 0) === block.anchor.measure && (event.noteIndex ?? 0) >= block.anchor.note)
    );
    return measureIndex < 0 ? alignable.length : measureIndex;
  }

  const globalSlot = slotEvents[block.anchor.note - 1];
  if (globalSlot) {
    const globalIndex = alignable.findIndex((event) => event.position >= globalSlot.position);
    return globalIndex < 0 ? alignable.length : globalIndex;
  }

  return alignable.length;
}

function nextVisibleIndex(
  rawAlignable: VoiceEvent[],
  startIndex: number,
  visibleIndexByEventId: Map<string, number>
): number | undefined {
  for (let index = startIndex; index < rawAlignable.length; index += 1) {
    const visibleIndex = visibleIndexByEventId.get(rawAlignable[index]!.id);
    if (visibleIndex !== undefined) return visibleIndex;
  }
  return undefined;
}

function isRawLyricAlignable(event: VoiceEvent): boolean {
  if (event.kind === "rhythm") return event.lyricAlignable;
  return event.kind === "note" && event.lyricAlignable;
}

function isSparksLyricAlignable(event: VoiceEvent, teachingGhost = false): boolean {
  if (event.kind === "rhythm") return event.lyricAlignable;
  if (event.kind !== "note" || !event.lyricAlignable) return false;
  return !(teachingGhost && event.attack === false);
}

function isLyricSlotEvent(event: VoiceEvent): boolean {
  return event.kind === "note" || event.kind === "rest" || event.kind === "rhythm";
}

function isTieGhostEvent(event: VoiceEvent): event is NoteEvent {
  return event.kind === "note" && event.attack === false;
}
