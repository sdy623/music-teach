import { isPerformedSlot, slotDurationMilliseconds } from "./playback";
import type {
  JianpuPhraseFrame,
  SongProgressSection,
  TeachingHighlightPalette,
  TeachingMark,
  TeachingRubyToken,
  TeachingTextSegment
} from "./types";

export const DEFAULT_TEACHING_HIGHLIGHT_PALETTE: Required<TeachingHighlightPalette> = {
  grammar: "#d64f5f",
  vocabulary: "#16836c",
  pronunciation: "#2f70c7"
};

export function buildTeachingTextSegments(
  text: string,
  marks: readonly TeachingMark[],
  palette: TeachingHighlightPalette = {}
): TeachingTextSegment[] {
  if (!text) return [];
  const resolvedPalette = { ...DEFAULT_TEACHING_HIGHLIGHT_PALETTE, ...palette };
  const occupied: Array<{ start: number; end: number }> = [];
  const ranges = marks.flatMap((mark) => {
    const range = resolveMarkRange(text, mark, occupied);
    if (!range) return [];
    occupied.push(range);
    return [{ ...range, mark }];
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  const segments: TeachingTextSegment[] = [];
  let cursor = 0;
  ranges.forEach(({ start, end, mark }) => {
    if (start > cursor) {
      segments.push({ id: `plain-${cursor}`, text: text.slice(cursor, start) });
    }
    segments.push({
      id: mark.id,
      text: text.slice(start, end),
      mark,
      color: mark.color || resolvedPalette[mark.tone]
    });
    cursor = end;
  });
  if (cursor < text.length) {
    segments.push({ id: `plain-${cursor}`, text: text.slice(cursor) });
  }
  return segments;
}

export function buildTeachingRubyTokens(
  text: string,
  reading: string,
  explicitTokens: readonly TeachingRubyToken[] = []
): TeachingRubyToken[] {
  if (!text) return [];
  const explicit = materializeExplicitRubyTokens(text, explicitTokens);
  if (explicit?.some((token) => token.reading)) return explicit;
  if (!reading || !containsHan(text)) return [plainRubyToken(text)];

  const alignedReading = normalizeRubyReading(reading);
  if (!alignedReading) return [plainRubyToken(text)];
  const sourceRuns = splitOrthographicRuns(text);
  const result: TeachingRubyToken[] = [];
  let readingCursor = 0;

  for (let index = 0; index < sourceRuns.length; index += 1) {
    const run = sourceRuns[index]!;
    if (containsHan(run.surface)) {
      const nextAnchorIndex = sourceRuns.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index &&
          !containsHan(candidate.surface) &&
          Boolean(normalizeRubyReading(candidate.surface))
      );
      const clusterEnd = nextAnchorIndex >= 0 ? nextAnchorIndex : sourceRuns.length;
      const clusterRuns = sourceRuns.slice(index, clusterEnd);
      const hanRuns = clusterRuns.filter((candidate) => containsHan(candidate.surface));
      const nextAnchorRun = nextAnchorIndex >= 0 ? sourceRuns[nextAnchorIndex] : undefined;
      const nextAnchor = nextAnchorRun
        ? normalizeRubyReading(nextAnchorRun.surface)
        : undefined;
      const boundary = nextAnchor
        ? alignedReading.indexOf(nextAnchor, readingCursor + hanRuns.length)
        : alignedReading.length;
      if (boundary < readingCursor) return [plainRubyToken(text)];
      const clusterReading = alignedReading.slice(readingCursor, boundary);
      const readings = splitReadingAcrossHanRuns(clusterReading, hanRuns);
      if (!readings) return [plainRubyToken(text)];
      let hanIndex = 0;
      clusterRuns.forEach((candidate) => {
        const reading = containsHan(candidate.surface)
          ? readings[hanIndex++]
          : undefined;
        result.push({
          id: `ruby-${candidate.start}`,
          surface: candidate.surface,
          reading,
          start: candidate.start,
          end: candidate.end
        });
      });
      readingCursor = boundary;
      index = clusterEnd - 1;
      continue;
    }

    const anchor = normalizeRubyReading(run.surface);
    if (anchor && !alignedReading.startsWith(anchor, readingCursor)) {
      return [plainRubyToken(text)];
    }
    if (anchor) readingCursor += anchor.length;
    result.push({
      id: `ruby-${run.start}`,
      surface: run.surface,
      start: run.start,
      end: run.end
    });
  }

  return readingCursor === alignedReading.length
    ? result
    : [plainRubyToken(text)];
}

export function teachingSentenceFontSize(text: string): number {
  const length = Array.from(text).length;
  if (length > 26) return 32;
  if (length > 20) return 34;
  return 36;
}

function splitReadingAcrossHanRuns(
  reading: string,
  runs: ReadonlyArray<{ surface: string }>
): string[] | undefined {
  if (!runs.length || reading.length < runs.length) return undefined;
  if (runs.length === 1) return [reading];

  const totalHan = runs.reduce((sum, run) => sum + Array.from(run.surface).length, 0);
  const result: string[] = [];
  let consumedHan = 0;
  let cursor = 0;

  runs.forEach((run, index) => {
    consumedHan += Array.from(run.surface).length;
    const remainingRuns = runs.length - index - 1;
    const proportionalEnd = Math.round((reading.length * consumedHan) / totalHan);
    const end = index === runs.length - 1
      ? reading.length
      : Math.min(
          reading.length - remainingRuns,
          Math.max(cursor + 1, proportionalEnd)
        );
    result.push(reading.slice(cursor, end));
    cursor = end;
  });

  return result.every(Boolean) ? result : undefined;
}

export function buildSongProgressSections(
  phraseIds: readonly string[],
  sectionBreaks: Readonly<Record<string, string>>,
  labelOf: (section: string) => string
): SongProgressSection[] {
  const starts = phraseIds.flatMap((phraseId, index) => {
    const section = sectionBreaks[phraseId];
    return section ? [{ id: section, label: labelOf(section), startPhrase: index }] : [];
  });
  return starts.map((section, index) => ({
    ...section,
    endPhrase: (starts[index + 1]?.startPhrase ?? phraseIds.length) - 1
  }));
}

function resolveMarkRange(
  text: string,
  mark: TeachingMark,
  occupied: ReadonlyArray<{ start: number; end: number }>
): { start: number; end: number } | undefined {
  if (
    mark.start !== undefined &&
    mark.end !== undefined &&
    mark.start >= 0 &&
    mark.end > mark.start &&
    mark.end <= text.length &&
    !overlaps(occupied, mark.start, mark.end)
  ) {
    return { start: mark.start, end: mark.end };
  }
  if (!mark.surface) return undefined;
  let start = text.indexOf(mark.surface);
  while (start >= 0) {
    const end = start + mark.surface.length;
    if (!overlaps(occupied, start, end)) return { start, end };
    start = text.indexOf(mark.surface, start + 1);
  }
  return undefined;
}

function overlaps(
  occupied: ReadonlyArray<{ start: number; end: number }>,
  start: number,
  end: number
): boolean {
  return occupied.some((range) => start < range.end && end > range.start);
}

function materializeExplicitRubyTokens(
  text: string,
  tokens: readonly TeachingRubyToken[]
): TeachingRubyToken[] | undefined {
  if (!tokens.length) return undefined;
  const result: TeachingRubyToken[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (!token.surface) continue;
    const start = text.indexOf(token.surface, cursor);
    if (start < 0) return undefined;
    if (start > cursor) {
      result.push({
        id: `ruby-gap-${cursor}`,
        surface: text.slice(cursor, start),
        start: cursor,
        end: start
      });
    }
    const end = start + token.surface.length;
    const reading =
      token.reading &&
      containsHan(token.surface) &&
      normalizeRubyReading(token.reading) !== normalizeRubyReading(token.surface)
        ? token.reading
        : undefined;
    result.push({ ...token, reading, start, end });
    cursor = end;
  }
  if (cursor < text.length) {
    result.push({
      id: `ruby-gap-${cursor}`,
      surface: text.slice(cursor),
      start: cursor,
      end: text.length
    });
  }
  return result;
}

function splitOrthographicRuns(text: string): Array<{
  surface: string;
  start: number;
  end: number;
}> {
  const runs: Array<{ surface: string; start: number; end: number }> = [];
  const matcher = /\p{Script=Han}+|[^\p{Script=Han}]+/gu;
  for (const match of text.matchAll(matcher)) {
    const start = match.index ?? 0;
    runs.push({ surface: match[0], start, end: start + match[0].length });
  }
  return runs;
}

function normalizeRubyReading(value: string): string {
  return Array.from(value.normalize("NFKC"))
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 0x30a1 && codePoint <= 0x30f6
        ? String.fromCodePoint(codePoint - 0x60)
        : character;
    })
    .join("")
    .replace(/[\sー\p{Punctuation}\p{Symbol}]/gu, "");
}

function containsHan(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function plainRubyToken(text: string): TeachingRubyToken {
  return { id: "ruby-plain", surface: text, start: 0, end: text.length };
}

/** Uses the same performed slots and tempo fallback as the phrase player. */
export function formatInstrumentalCaption(phrase: Pick<JianpuPhraseFrame, "slots" | "tempo">): string {
  const slots = phrase.slots.filter(isPerformedSlot);
  const milliseconds = slots.reduce(
    (total, slot) => total + slotDurationMilliseconds(slot, Number(phrase.tempo)),
    0
  );
  const seconds = Math.round(milliseconds / 100) / 10;
  const measures = new Set(slots.map((slot) => slot.measure)).size;
  return `伴奏 ${seconds} 秒 · ${measures} 小节`;
}
