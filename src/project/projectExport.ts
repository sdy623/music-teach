import { createProjectPhrase, createTeachingProject } from "./projectBuilder";
import type { JianpuPhraseFrame } from "../slide/types";
import type {
  MorphologyToken,
  SectionId,
  SongSectionPreset,
  TeachingPhraseKind,
  TeachingProject,
  TeachingProjectKeyChange,
  TeachingProjectLyricCell,
  TeachingProjectPhrase,
  TeachingSectionBreak
} from "./types";

export function serializeTeachingProject(project: TeachingProject): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeTeachingProject(source: string): TeachingProject {
  return migrateTeachingProject(JSON.parse(source) as unknown);
}

export function migrateTeachingProject(value: unknown): TeachingProject {
  const raw = asRecord(value);
  if (!raw || typeof raw.title !== "string" || !Array.isArray(raw.phrases)) {
    throw new Error("Invalid teaching project");
  }

  const sourceLyrics = stringValue(raw.sourceLyrics);
  const base = createTeachingProject(raw.title, sourceLyrics);
  const phrases = raw.phrases.map((phrase, index) =>
    migratePhrase(phrase, index)
  );
  const sectionBreaks = migrateSectionBreaks(raw.sectionBreaks, phrases);
  if (sectionBreaks.length === 0) {
    migrateLegacyPhraseSections(raw.phrases, phrases, sectionBreaks);
  }

  return {
    ...base,
    formatVersion: 3,
    id: stringValue(raw.id) || base.id,
    title: raw.title,
    tags: stringArray(raw.tags),
    artist: stringValue(raw.artist),
    lyricist: stringValue(raw.lyricist),
    composer: stringValue(raw.composer),
    arranger: stringValue(raw.arranger),
    otherCredits: stringValue(raw.otherCredits),
    keyAndMeters: stringValue(raw.keyAndMeters) || base.keyAndMeters,
    expression: stringValue(raw.expression) || base.expression,
    sourceLyrics: sourceLyrics || phrases.map((phrase) => phrase.lyricText).join("\n\n"),
    phrases,
    customSections: migrateCustomSections(raw.customSections),
    sectionBreaks
  };
}

export function downloadTeachingProject(
  project: TeachingProject,
  filename = `${project.id || "teaching-project"}.json`
): void {
  const blob = new Blob([serializeTeachingProject(project)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function migratePhrase(value: unknown, index: number): TeachingProjectPhrase {
  const raw = asRecord(value) ?? {};
  const lyricText = stringValue(raw.lyricText);
  const base = createProjectPhrase(lyricText, index);
  const lyricCells = migrateLyricCells(raw.lyricCells);
  const referenceReading = stringValue(raw.referenceReading) || base.referenceReading;
  const morphology = migrateMorphology(raw.morphology);

  return {
    ...base,
    id: stringValue(raw.id) || base.id,
    lyricText,
    referenceReading,
    morphology: morphology.length ? morphology : base.morphology,
    kind: phraseKind(raw.kind),
    voiceLine: stringValue(raw.voiceLine),
    lyricJpwabc:
      stringValue(raw.lyricJpwabc) ||
      lyricCells.map((cell) => cell.raw).join("") ||
      referenceReading ||
      lyricText,
    lyricCells,
    keyOfOne: stringValue(raw.keyOfOne),
    keyChanges: migrateKeyChanges(raw.keyChanges),
    frame: migratePhraseFrame(raw.frame),
    annotation: stringValue(raw.annotation),
    showMetronome: booleanValue(raw.showMetronome, true),
    skipDuringPlayback: booleanValue(raw.skipDuringPlayback, false)
  };
}

function migratePhraseFrame(value: unknown): JianpuPhraseFrame | undefined {
  const raw = asRecord(value);
  const titleMeter = asRecord(raw?.titleMeter);
  const sourceAnchor = asRecord(raw?.sourceAnchor);
  if (
    !raw ||
    typeof raw.id !== "string" ||
    typeof raw.index !== "number" ||
    typeof raw.sourceBlockId !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.keyOfOne !== "string" ||
    !titleMeter ||
    typeof titleMeter.numerator !== "number" ||
    typeof titleMeter.denominator !== "number" ||
    !sourceAnchor ||
    typeof sourceAnchor.startMeasure !== "number" ||
    typeof sourceAnchor.startNote !== "number" ||
    typeof sourceAnchor.endMeasure !== "number" ||
    typeof sourceAnchor.endNote !== "number" ||
    !Array.isArray(raw.lyricCells) ||
    !Array.isArray(raw.measures) ||
    !Array.isArray(raw.slots) ||
    !Array.isArray(raw.curves) ||
    !Array.isArray(raw.keyChanges)
  ) {
    return undefined;
  }
  return value as JianpuPhraseFrame;
}

function migrateLyricCells(value: unknown): TeachingProjectLyricCell[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): TeachingProjectLyricCell[] => {
    const raw = asRecord(entry);
    const kind = raw?.kind;
    if (
      !raw ||
      (kind !== "syllable" &&
        kind !== "multiChar" &&
        kind !== "extension" &&
        kind !== "space")
    ) {
      return [];
    }
    const display = stringValue(raw.display);
    return [{
      id: stringValue(raw.id) || `project-lyric-cell-${index + 1}`,
      kind,
      raw:
        stringValue(raw.raw) ||
        (kind === "multiChar" ? `{${display}}` : display),
      display,
      normalizedText: stringValue(raw.normalizedText),
      tokenId: optionalString(raw.tokenId),
      inheritedTokenId: optionalString(raw.inheritedTokenId),
      slotIndex: optionalNonNegativeInteger(raw.slotIndex)
    }];
  });
}

function migrateKeyChanges(value: unknown): TeachingProjectKeyChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): TeachingProjectKeyChange[] => {
    const raw = asRecord(entry);
    const slotIndex = optionalNonNegativeInteger(raw?.slotIndex);
    const keyOfOne = stringValue(raw?.keyOfOne);
    if (!raw || slotIndex === undefined || !keyOfOne) return [];
    return [{
      id: stringValue(raw.id) || `project-key-change-${index + 1}`,
      slotIndex,
      keyOfOne,
      display: stringValue(raw.display) || `转1=${keyOfOne}`,
      semitoneShift: optionalNumber(raw.semitoneShift)
    }];
  });
}

function migrateMorphology(value: unknown): MorphologyToken[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): MorphologyToken[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    return [{
      id: stringValue(raw.id) || `morph-${index + 1}`,
      surface: stringValue(raw.surface),
      reading: stringValue(raw.reading),
      needsReview: booleanValue(raw.needsReview, false)
    }];
  });
}

function migrateSectionBreaks(
  value: unknown,
  phrases: TeachingProjectPhrase[]
): TeachingSectionBreak[] {
  if (!Array.isArray(value)) return [];
  const phraseIds = new Set(phrases.map((phrase) => phrase.id));
  return value.flatMap((entry): TeachingSectionBreak[] => {
    const raw = asRecord(entry);
    const phraseId = stringValue(raw?.phraseId);
    const section = optionalString(raw?.section) as SectionId | undefined;
    return phraseId && section && phraseIds.has(phraseId)
      ? [{ phraseId, section }]
      : [];
  });
}

function migrateLegacyPhraseSections(
  rawPhrases: unknown[],
  phrases: TeachingProjectPhrase[],
  sectionBreaks: TeachingSectionBreak[]
): void {
  let previousSection: SectionId | undefined;
  rawPhrases.forEach((entry, index) => {
    const raw = asRecord(entry);
    const section = (optionalString(raw?.section) as SectionId | undefined) ??
      (index === 0 ? "verse" : previousSection);
    const phrase = phrases[index];
    if (phrase && section && section !== previousSection) {
      sectionBreaks.push({ phraseId: phrase.id, section });
    }
    previousSection = section;
  });
}

function migrateCustomSections(value: unknown): SongSectionPreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SongSectionPreset[] => {
    const raw = asRecord(entry);
    const id = optionalString(raw?.id) as SectionId | undefined;
    const label = optionalString(raw?.label);
    return id?.startsWith("custom:") && label ? [{ id, label }] : [];
  });
}

function phraseKind(value: unknown): TeachingPhraseKind {
  return value === "instrumental" || value === "blank" ? value : "vocal";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  const result = stringValue(value);
  return result || undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}
