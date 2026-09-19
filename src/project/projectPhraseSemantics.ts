import type {
  JianpuPhraseFrame,
  PhraseKeyChange,
  PhraseLyricCell,
  PhraseTeachingContent
} from "../slide/types";
import { parseJPWABC } from "../parser/parseJPWABC";
import { buildInstrumentalMeasureFrame, buildLessonDeck } from "../slide/buildLessonDeck";
import { buildPhraseJPWABC } from "../teaching/lesson";
import type {
  MorphologyToken,
  TeachingPhraseKind,
  TeachingProjectKeyChange,
  TeachingProjectLyricCell
} from "./types";

export interface RenderableProjectPhraseInput {
  kind?: TeachingPhraseKind;
  phrase?: JianpuPhraseFrame;
  sourceText?: string;
  voiceLine?: string;
  lyricText?: string;
  lyricJpwabc?: string;
  lyricCells?: readonly TeachingProjectLyricCell[];
  referenceReading?: string;
  morphology?: readonly MorphologyToken[];
  keyOfOne?: string;
  keyChanges?: readonly TeachingProjectKeyChange[];
  title?: string;
  keyAndMeters?: string;
  expression?: string;
  annotation?: string;
  phraseIndex?: number;
  teaching?: PhraseTeachingContent;
}

export function buildRenderableProjectPhrase(
  input: RenderableProjectPhraseInput
): JianpuPhraseFrame | undefined {
  if (input.kind === "blank") return undefined;
  const sourceText = input.sourceText?.trim()
    ? input.sourceText
    : input.voiceLine?.trim()
      ? buildPhraseJPWABC({
          title: input.title || "教学乐句",
          keyAndMeters: input.keyAndMeters || "1=C,4/4",
          expression: input.expression || "J=80",
          voice: input.voiceLine,
          words:
            input.lyricJpwabc || input.referenceReading || input.lyricText || ""
        })
      : "";

  let base = input.phrase;
  if (!base && sourceText) {
    try {
      const score = parseJPWABC(sourceText).value;
      const measures = score.voices[0]?.measures ?? [];
      base = input.kind === "instrumental" && measures.length
        ? buildInstrumentalMeasureFrame(score, measures[0]!.number, measures.at(-1)!.number, 0)
        : buildLessonDeck(score, { id: "project-phrase" }).phrases[0];
    } catch {
      base = undefined;
    }
  }
  if (!base) return undefined;

  base = restoreProjectPhraseSemantics(
    base,
    input.lyricCells ?? [],
    input.keyChanges ?? [],
    input.keyOfOne
  );

  const morphology = input.morphology ?? [];
  return {
    ...base,
    kind: input.kind ?? base.kind,
    normalizedText: input.kind === "instrumental" && base.kind !== "instrumental"
      ? "过门"
      : base.normalizedText,
    index: input.phraseIndex ?? base.index,
    title: input.title || base.title,
    teaching: {
      ...base.teaching,
      ...input.teaching,
      originalText:
        input.lyricText || input.teaching?.originalText || base.teaching?.originalText,
      surface: input.lyricText || input.teaching?.surface || base.teaching?.surface,
      reading:
        input.referenceReading || input.teaching?.reading || base.teaching?.reading,
      rubyTokens: morphology.length
        ? morphology.map((token) => ({
            id: token.id,
            surface: token.surface,
            reading: token.needsReview ? undefined : token.reading
          }))
        : input.teaching?.rubyTokens ?? base.teaching?.rubyTokens,
      coachNote:
        input.annotation || input.teaching?.coachNote || base.teaching?.coachNote
    }
  };
}

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
