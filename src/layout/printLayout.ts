import type { ScoreIR } from "../ir/score";
import type { LyricCell } from "../ir/lyric";
import type { DurationIR, VoiceEvent } from "../ir/voice";
import type { BeamItem, LayoutAnchor, NoteItem, PageLayout, PrintLayout, RestItem, RhythmItem } from "./types";
import { A4_HEIGHT_MM, A4_WIDTH_MM, LAYOUT } from "./constants";
import { estimateEventWidth } from "./horizontalSpacing";
import { breakMeasuresIntoLines } from "./lineBreaker";
import { buildLayoutMeasures } from "./measureBuilder";
import { displayTitleText, parseKeyAndMeterMarks, parseTempoExpression, type KeyMeterMark } from "../parser/parseTitle";

export interface LayoutOptions {
  teachingGhost?: boolean;
  showKeyChanges?: boolean;
  showReadingOverrides?: boolean;
}

interface BeatInfo {
  groupId: string;
  beatIndex: number;
}

interface BeamCandidate {
  page: PageLayout;
  item: NoteItem | RestItem | RhythmItem;
}

export function buildPrintLayout(score: ScoreIR, options: LayoutOptions = {}): PrintLayout {
  const pages: PageLayout[] = [newPage(1)];
  const anchors = new Map<string, LayoutAnchor>();
  const voice = score.voices[0];
  const measures = buildLayoutMeasures(voice);
  const lineWidth = A4_WIDTH_MM - LAYOUT.marginLeft - LAYOUT.marginRight;
  const lines = breakMeasuresIntoLines(measures, lineWidth);
  const lyricByEvent = buildLyricMap(score);
  const placedAnchors: LayoutAnchor[] = [];
  const beatMap = buildBeatMap(voice.events);
  const beamCandidates: BeamCandidate[] = [];

  addTitleBlock(pages[0]!, score);

  let page = pages[0]!;
  let y = LAYOUT.titleBottom;

  for (const line of lines) {
    if (y + LAYOUT.systemGap > A4_HEIGHT_MM - LAYOUT.marginBottom) {
      page = newPage(pages.length + 1);
      pages.push(page);
      y = LAYOUT.marginTop + 10;
    }

    const stretch = 0;
    let x = LAYOUT.marginLeft;
    let hasVisibleItem = false;
    let previousBeatGroupId: string | undefined;

    for (const measure of line.measures) {
      for (const event of measure.events) {
        if (event.kind === "return") continue;
        const width = estimateEventWidth(event);
        if (width <= 0) continue;
        const beatInfo = beatMap.get(event.id);
        if (hasVisibleItem) {
          x += gapBeforeEvent(event, previousBeatGroupId, beatInfo?.groupId) + stretch;
        }
        const item = addEventItem(page, event, x, y, options, beatInfo);
        if (item && (item.kind === "note" || item.kind === "rest" || item.kind === "rhythm") && item.duration.underlines > 0 && item.beatGroupId) {
          beamCandidates.push({ page, item });
        }
        anchors.set(event.id, {
          pageNumber: page.pageNumber,
          x,
          y,
          eventId: event.id,
          measure: event.measure,
          noteIndex: event.noteIndex
        });
        placedAnchors.push({
          pageNumber: page.pageNumber,
          x,
          y,
          eventId: event.id,
          measure: event.measure,
          noteIndex: event.noteIndex
        });

        const lyricCell = lyricByEvent.get(event.id);
        if (lyricCell) {
          page.items.push({
            id: `lyric-item-${lyricCell.id}`,
            kind: "lyric",
            x,
            y: y + LAYOUT.lyricGap,
            text: lyricCell.display,
            cellId: lyricCell.id,
            tokenId: lyricCell.tokenId,
            inheritedTokenId: lyricCell.inheritedTokenId,
            lyricKind: lyricCell.kind,
            eventId: event.id,
            measure: event.measure,
            noteIndex: event.noteIndex
          });
        }

        x += width;
        hasVisibleItem = true;
        previousBeatGroupId = beatInfo?.groupId;
      }
    }

    y += LAYOUT.systemGap;
  }

  addBeatBeams(beamCandidates);
  addSlurItems(score, pages, anchors);
  addAttachmentItems(score, pages, anchors, placedAnchors, options);
  addReadingOverrideItems(score, pages, anchors, options);

  if (score.diagnostics.length) {
    pages[0]?.items.push({
      id: "diagnostics-summary",
      kind: "diagnostics",
      x: LAYOUT.marginLeft,
      y: A4_HEIGHT_MM - 8,
      text: `${score.diagnostics.length} diagnostics`
    });
  }

  return { pages, anchors };
}

function newPage(pageNumber: number): PageLayout {
  return {
    pageNumber,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    items: []
  };
}

function addTitleBlock(page: PageLayout, score: ScoreIR): void {
  const cx = A4_WIDTH_MM / 2;
  const subtitle2Y = 33;
  const authorY = subtitle2Y - LAYOUT.metaSize * 0.625;
  page.items.push({
    id: "title-intro",
    kind: "text",
    x: LAYOUT.marginLeft,
    y: 12,
    text: displayTitleText(score.title.intro),
    size: 3,
    anchor: "start",
    className: "title-intro"
  });
  page.items.push({
    id: "title-main",
    kind: "text",
    x: cx,
    y: 18,
    text: displayTitleText(score.title.title),
    size: LAYOUT.titleSize,
    anchor: "middle",
    className: "title-main"
  });
  page.items.push({
    id: "title-sub",
    kind: "text",
    x: cx,
    y: 26,
    text: displayTitleText(score.title.subTitle),
    size: LAYOUT.subtitleSize,
    anchor: "middle",
    className: "title-sub"
  });
  page.items.push({
    id: "title-sub2",
    kind: "text",
    x: cx,
    y: subtitle2Y,
    text: displayTitleText(score.title.subTitle2),
    size: 3.2,
    anchor: "middle",
    className: "title-sub2"
  });
  addTitleKeyAndMeters(page, score.title.keyAndMeters, LAYOUT.marginLeft, 42);
  addMultilineText(page, "title-author", A4_WIDTH_MM - LAYOUT.marginRight, authorY, displayTitleText(score.title.wordsByAndMusicBy), "end");
  addTempoExpression(page, score.title.expression, LAYOUT.marginLeft, 47);
}

function addMultilineText(page: PageLayout, id: string, x: number, y: number, text: string, anchor: "start" | "middle" | "end"): void {
  text.split("\n").forEach((line, index) => {
    page.items.push({
      id: `${id}-${index}`,
      kind: "text",
      x,
      y: y + index * 4,
      text: line,
      size: 3,
      anchor,
      className: id
    });
  });
}

function addTitleKeyAndMeters(page: PageLayout, value: string | undefined, x: number, y: number): void {
  const marks = parseKeyAndMeterMarks(value);
  if (!marks.length) {
    const text = displayTitleText(value);
    if (!text) return;
    page.items.push({
      id: "title-key",
      kind: "text",
      x,
      y,
      text,
      size: LAYOUT.metaSize,
      anchor: "start",
      className: "title-key"
    });
    return;
  }

  let cursor = x;
  marks.forEach((mark, index) => {
    page.items.push({
      id: `title-key-meter-${index}`,
      kind: "title-key-meter",
      x: cursor,
      y,
      keyOfOne: mark.keyOfOne,
      numerator: mark.numerator,
      denominator: mark.denominator,
      size: LAYOUT.metaSize,
      meterOffset: titleKeyTextWidth(mark) + 1.7,
      className: "title-key-meter"
    });
    cursor += estimateTitleKeyMeterWidth(mark);
  });
}

function addTempoExpression(page: PageLayout, value: string | undefined, x: number, y: number): void {
  const tempo = parseTempoExpression(value);
  if (tempo) {
    page.items.push({
      id: "title-tempo",
      kind: "tempo",
      x,
      y,
      bpm: tempo.bpm,
      size: 3.2,
      className: "title-tempo"
    });
    return;
  }

  const text = displayTitleText(value);
  if (!text) return;
  page.items.push({
    id: "title-expression",
    kind: "text",
    x,
    y,
    text,
    size: 3,
    anchor: "start",
    className: "title-expression"
  });
}

function estimateTitleKeyMeterWidth(mark: KeyMeterMark): number {
  return titleKeyTextWidth(mark) + (mark.numerator && mark.denominator ? 5.6 : 0) + 3.2;
}

function titleKeyTextWidth(mark: KeyMeterMark): number {
  if (!mark.keyOfOne) return Math.max(5, mark.raw.length * 1.8);
  return 6.4 + normalizedKeyLetter(mark.keyOfOne).length * 2.15 + (keyAccidental(mark.keyOfOne) ? 2.1 : 0);
}

function keyAccidental(keyOfOne: string): string | undefined {
  return keyOfOne.match(/^[#bn]/i)?.[0];
}

function normalizedKeyLetter(keyOfOne: string): string {
  return keyOfOne.replace(/^[#bn]/i, "");
}

function addEventItem(page: PageLayout, event: VoiceEvent, x: number, y: number, options: LayoutOptions, beatInfo?: BeatInfo): NoteItem | RestItem | RhythmItem | undefined {
  switch (event.kind) {
    case "note": {
      const item: NoteItem = {
        id: `layout-${event.id}`,
        kind: "note",
        x,
        y,
        eventId: event.id,
        measure: event.measure,
        noteIndex: event.noteIndex,
        degree: event.degree,
        accidental: event.accidental,
        octave: event.octave,
        duration: event.duration,
        beatGroupId: beatInfo?.groupId,
        visualRole: options.teachingGhost ? event.visualRole : "normal"
      };
      page.items.push(item);
      return item;
    }
    case "rest": {
      const item: RestItem = {
        id: `layout-${event.id}`,
        kind: "rest",
        x,
        y,
        eventId: event.id,
        measure: event.measure,
        noteIndex: event.noteIndex,
        duration: event.duration,
        beatGroupId: beatInfo?.groupId
      };
      page.items.push(item);
      return item;
    }
    case "rhythm": {
      const item: RhythmItem = {
        id: `layout-${event.id}`,
        kind: "rhythm",
        x,
        y,
        eventId: event.id,
        measure: event.measure,
        noteIndex: event.noteIndex,
        duration: event.duration,
        beatGroupId: beatInfo?.groupId
      };
      page.items.push(item);
      return item;
    }
    case "barline":
      page.items.push({
        id: `layout-${event.id}`,
        kind: "barline",
        x,
        y: y - 7,
        eventId: event.id,
        measure: event.measure,
        noteIndex: event.noteIndex,
        style: event.style,
        height: LAYOUT.barlineHeight
      });
      break;
    case "meter":
      page.items.push({
        id: `layout-${event.id}`,
        kind: "meter",
        x,
        y,
        eventId: event.id,
        measure: event.measure,
        numerator: event.numerator,
        denominator: event.denominator
      });
      break;
    case "standardText":
      page.items.push({
        id: `layout-${event.id}`,
        kind: "text",
        x,
        y,
        eventId: event.id,
        measure: event.measure,
        text: event.text,
        size: 3.2,
        className: "standard-text"
      });
      break;
    case "unknown":
      page.items.push({
        id: `layout-${event.id}`,
        kind: "text",
        x,
        y,
        eventId: event.id,
        measure: event.measure,
        text: event.raw,
        size: 2.4,
        className: "unknown-token"
      });
      break;
    case "return":
    case "slurMarker":
    case "tupletMarker":
    case "voltaMarker":
      break;
  }
  return undefined;
}

function buildLyricMap(score: ScoreIR): Map<string, LyricCell> {
  const cells = new Map(score.lyrics.flatMap((block) => block.cells.map((cell) => [cell.id, cell] as const)));
  const map = new Map<string, LyricCell>();
  score.lyricAlignments.forEach((alignment) => {
    const cell = cells.get(alignment.cellId);
    if (cell) map.set(alignment.eventId, cell);
  });
  return map;
}

function addSlurItems(score: ScoreIR, pages: PageLayout[], anchors: Map<string, LayoutAnchor>): void {
  for (const slur of score.semantic.slurs) {
    const start = anchors.get(slur.startEventId);
    const end = anchors.get(slur.endEventId);
    if (!start || !end || start.pageNumber !== end.pageNumber) continue;
    const page = pages[start.pageNumber - 1];
    if (!page) continue;
    const span = Math.max(1.8, end.x - start.x);
    const y = Math.min(start.y, end.y) - 5.6;
    const arch = Math.min(5, Math.max(2.2, span * 0.18));
    const c1x = start.x + span / 3;
    const c2x = start.x + (span * 2) / 3;
    page.items.push({
      id: `slur-${slur.id}`,
      kind: "path",
      x: 0,
      y: 0,
      d: `M ${start.x} ${y} C ${c1x} ${y - arch}, ${c2x} ${y - arch}, ${end.x} ${y}`,
      strokeWidth: slur.type === "tie" ? 0.45 : 0.35,
      className: slur.type
    });
  }
}

function addAttachmentItems(
  score: ScoreIR,
  pages: PageLayout[],
  anchors: Map<string, LayoutAnchor>,
  placedAnchors: LayoutAnchor[],
  options: LayoutOptions
): void {
  for (const attachment of score.attachments) {
    if (attachment.type !== "text") continue;
    const anchor = resolveAttachmentAnchor(score, anchors, placedAnchors, attachment.anchor);
    const page = pages[(anchor?.pageNumber ?? 1) - 1];
    if (!page) continue;
    const isKeyChange = score.semantic.keyChanges.some((key) => key.display === attachment.contentDisplay);
    if (isKeyChange && options.showKeyChanges === false) continue;
    page.items.push({
      id: `attachment-${attachment.id}`,
      kind: "attachment",
      x: (anchor?.x ?? LAYOUT.marginLeft) + attachment.dx * LAYOUT.attachmentScaleMm,
      y: (anchor?.y ?? LAYOUT.titleBottom) + attachment.dy * LAYOUT.attachmentScaleMm,
      text: attachment.contentDisplay,
      scaleX: attachment.scaleX,
      scaleY: attachment.scaleY,
      className: isKeyChange ? "key-change" : "attachment-text"
    });
  }
}

function resolveAttachmentAnchor(
  score: ScoreIR,
  anchors: Map<string, LayoutAnchor>,
  placedAnchors: LayoutAnchor[],
  anchor: ScoreIR["attachments"][number] extends infer Attachment
    ? Attachment extends { anchor: infer Anchor }
      ? Anchor
      : never
    : never
): LayoutAnchor | undefined {
  if (anchor.kind === "measure-note") {
    return anchors.get(score.voices[0]?.anchors.get(`${anchor.measure}:${anchor.note}`) ?? "");
  }

  if (anchor.kind === "absolute-symbol-index") {
    const index = Math.max(0, anchor.index - 1);
    return placedAnchors[index] ?? placedAnchors.at(-1);
  }

  if (anchor.kind === "return-or-row") {
    const measure = Number(anchor.raw.match(/^(\d+)/)?.[1]);
    if (Number.isFinite(measure)) {
      return placedAnchors.find((candidate) => (candidate.measure ?? 0) >= measure) ?? placedAnchors.at(-1);
    }
  }

  return undefined;
}

function addReadingOverrideItems(score: ScoreIR, pages: PageLayout[], anchors: Map<string, LayoutAnchor>, options: LayoutOptions): void {
  if (options.showReadingOverrides === false) return;
  for (const override of score.semantic.readingOverrides) {
    const eventId = score.voices[0]?.anchors.get(`${override.anchor.bar}:${override.anchor.slot}`);
    const anchor = eventId ? anchors.get(eventId) : undefined;
    const page = anchor ? pages[anchor.pageNumber - 1] : undefined;
    if (!anchor || !page) continue;
    page.items.push({
      id: `reading-${override.anchor.bar}-${override.anchor.slot}`,
      kind: "text",
      x: anchor.x,
      y: anchor.y - 10,
      text: override.reading,
      size: 2.4,
      anchor: "middle",
      className: "reading-override"
    });
  }
}

function gapBeforeEvent(event: VoiceEvent, previousBeatGroupId: string | undefined, currentBeatGroupId: string | undefined): number {
  if (event.kind === "barline") return 1.1;
  if (!previousBeatGroupId || !currentBeatGroupId) return 1.0;
  return previousBeatGroupId === currentBeatGroupId ? 0.35 : 2.6;
}

function buildBeatMap(events: VoiceEvent[]): Map<string, BeatInfo> {
  const map = new Map<string, BeatInfo>();
  let denominator = 4;
  let currentMeasure = 0;
  let beatIndex = 1;
  let beatCursor = 0;

  for (const event of events) {
    if (event.kind === "meter") {
      denominator = event.denominator || 4;
      continue;
    }

    const measure = event.measure ?? currentMeasure;
    if (measure !== currentMeasure) {
      currentMeasure = measure;
      beatIndex = 1;
      beatCursor = 0;
    }

    if (!isTimedEvent(event)) continue;

    map.set(event.id, {
      groupId: `${measure}:${beatIndex}`,
      beatIndex
    });

    beatCursor += durationToQuarterUnits(event.duration);
    const beatUnit = denominator === 8 ? 0.5 : 1;
    while (beatCursor >= beatUnit - 0.0001) {
      beatCursor -= beatUnit;
      beatIndex += 1;
    }
  }

  return map;
}

function isTimedEvent(event: VoiceEvent): event is Extract<VoiceEvent, { kind: "note" | "rest" | "rhythm" }> {
  return event.kind === "note" || event.kind === "rest" || event.kind === "rhythm";
}

function durationToQuarterUnits(duration: DurationIR): number {
  const base = 1 / 2 ** duration.underlines;
  let dots = 0;
  for (let index = 0; index < duration.dots; index += 1) {
    dots += base / 2 ** (index + 1);
  }
  return base + dots + duration.dashes * base;
}

function addBeatBeams(candidates: BeamCandidate[]): void {
  const groups = new Map<string, BeamCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.page.pageNumber}:${candidate.item.beatGroupId}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const maxUnderlines = Math.max(...group.map((candidate) => candidate.item.duration.underlines));
    for (let level = 0; level < maxUnderlines; level += 1) {
      const levelItems = group.filter((candidate) => candidate.item.duration.underlines > level);
      if (levelItems.length < 2) continue;

      for (const candidate of levelItems) {
        candidate.item.beamedUnderlineLevels = [...(candidate.item.beamedUnderlineLevels ?? []), level];
      }

      const page = levelItems[0]!.page;
      const y = Math.max(...levelItems.map((candidate) => underlineYForLayout(candidate.item, level)));
      const x1 = Math.min(...levelItems.map((candidate) => candidate.item.x)) - 1.55;
      const x2 = Math.max(...levelItems.map((candidate) => candidate.item.x)) + 1.55;
      const thickness = 0.34;
      const beam: BeamItem = {
        id: `beam-${page.pageNumber}-${levelItems[0]!.item.beatGroupId}-${level}`,
        kind: "beam",
        x: x1,
        y,
        d: `M ${x1} ${y - thickness} L ${x2} ${y - thickness} L ${x2} ${y} L ${x1} ${y} Z`,
        className: "duration-beam"
      };
      page.items.push(beam);
    }
  }
}

function underlineYForLayout(item: NoteItem | RestItem | RhythmItem, line: number): number {
  if (item.kind === "note" && item.octave < 0) {
    return item.y + 2.25 + Math.abs(item.octave) * 1.15 + line * 0.92;
  }
  return item.y + 1.55 + line * 0.92;
}
