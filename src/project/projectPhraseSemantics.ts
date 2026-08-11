import type {
  JianpuPhraseFrame,
  PhraseKeyChange,
  PhraseLyricCell
} from "../slide/types";
import type {
  TeachingProjectKeyChange,
  TeachingProjectLyricCell
} from "./types";

export function restoreProjectPhraseSemantics(
  frame: JianpuPhraseFrame,
  lyricCells: readonly TeachingProjectLyricCell[],
  keyChanges: readonly TeachingProjectKeyChange[],
  keyOfOne?: string
): JianpuPhraseFrame {
  const slots: JianpuPhraseFrame["slots"] = lyricCells.length
    ? frame.slots.map((slot) => ({ ...slot, lyricCell: undefined }))
    : frame.slots;
  const restoredCells = lyricCells.length
    ? lyricCells.map((cell): PhraseLyricCell => {
        const slot = validSlot(slots, cell.slotIndex);
        const restored: PhraseLyricCell = {
          id: cell.id,
          kind: cell.kind,
          raw: cell.raw,
          display: cell.display,
          normalizedText: cell.normalizedText,
          tokenId: cell.tokenId,
          inheritedTokenId: cell.inheritedTokenId,
          eventId: slot?.eventId
        };
        if (slot && cell.slotIndex !== undefined) {
          slots[cell.slotIndex] = { ...slot, lyricCell: restored };
        }
        return restored;
      })
    : frame.lyricCells;

  const restoredKeyChanges = keyChanges.flatMap(
    (change): PhraseKeyChange[] => {
      const slot = validSlot(slots, change.slotIndex);
      if (!slot) return [];
      return [
        {
          id: change.id,
          eventId: slot.eventId,
          measure: slot.measure,
          noteIndex: slot.noteIndex,
          keyOfOne: change.keyOfOne,
          display: change.display,
          semitoneShift: change.semitoneShift
        }
      ];
    }
  );

  return {
    ...frame,
    keyOfOne: keyOfOne?.trim() || frame.keyOfOne,
    lyricText: lyricCells.length
      ? restoredCells.map((cell) => cell.display).join("").replace(/\s+/g, " ").trim()
      : frame.lyricText,
    normalizedText: lyricCells.length
      ? restoredCells
          .filter((cell) => cell.kind === "syllable" || cell.kind === "multiChar")
          .map((cell) => cell.normalizedText || cell.display)
          .join("")
          .replace(/[\sー]+/g, "")
      : frame.normalizedText,
    lyricCells: restoredCells,
    slots,
    keyChanges: keyChanges.length ? restoredKeyChanges : frame.keyChanges
  };
}

function validSlot(
  slots: JianpuPhraseFrame["slots"],
  slotIndex: number | undefined
): JianpuPhraseFrame["slots"][number] | undefined {
  return Number.isInteger(slotIndex) && slotIndex !== undefined && slotIndex >= 0
    ? slots[slotIndex]
    : undefined;
}
