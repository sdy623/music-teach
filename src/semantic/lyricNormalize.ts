import type { LyricAlignment, LyricBlock, LyricLayer } from "../ir/lyric";
import type { VoiceEvent, VoiceIR } from "../ir/voice";

export function buildLyricToNoteAlignment(voice: VoiceIR, blocks: LyricBlock[]): LyricAlignment[] {
  const slotEvents = voice.events.filter(isLyricSlotEvent);
  const targets = slotEvents;
  const alignments: LyricAlignment[] = [];

  for (const block of blocks) {
    let eventIndex = findLyricStartIndex(targets, slotEvents, block);

    for (const cell of block.cells) {
      if (!cell.consumesNoteSlot) {
        if (cell.kind === "separator") {
          eventIndex = Math.min(
            targets.length,
            eventIndex + (cell.skipSlots ?? cell.raw.length)
          );
        }
        continue;
      }
      while (
        targets[eventIndex] &&
        (cell.kind === "extension"
          ? targets[eventIndex]!.kind === "rest"
          : !acceptsSyllable(targets[eventIndex]!))
      ) {
        eventIndex += 1;
      }
      const event = targets[eventIndex];
      if (!event) break;
      alignments.push({
        cellId: cell.id,
        eventId: event.id,
        measure: event.measure ?? 0,
        noteIndex: event.noteIndex ?? 0
      });
      eventIndex += 1;
    }
  }

  return alignments;
}

export function buildDemoEnglishLayer(alignments: LyricAlignment[]): LyricLayer {
  return {
    id: "en-demo",
    lang: "en-translation",
    source: "demo",
    cells: [],
    alignments
  };
}

function findLyricStartIndex(alignable: VoiceEvent[], slotEvents: VoiceEvent[], block: LyricBlock): number {
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

function acceptsSyllable(event: VoiceEvent): boolean {
  if (event.kind === "rhythm") return event.lyricAlignable;
  return event.kind === "note" && event.lyricAlignable;
}

function isLyricSlotEvent(event: VoiceEvent): boolean {
  return event.kind === "note" || event.kind === "rest" || event.kind === "rhythm";
}
