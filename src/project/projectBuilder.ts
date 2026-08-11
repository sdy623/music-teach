import type {
  MorphologyResult,
  MorphologyToken,
  SectionId,
  SongSectionPreset,
  TeachingProject,
  TeachingProjectPhrase,
  TeachingSectionBreak
} from "./types";
import { parseTitleCredits } from "../parser/parseTitle";

export const LETTER_SECTION_PRESETS: SongSectionPreset[] = [
  { id: "A", label: "A" },
  { id: "B", label: "B" },
  { id: "C", label: "C" },
  { id: "D", label: "D" },
  { id: "E", label: "E" },
  { id: "F", label: "F" },
  { id: "G", label: "G" }
];

export const POP_SECTION_PRESETS: SongSectionPreset[] = [
  { id: "intro", label: "Intro" },
  { id: "verse", label: "Verse" },
  { id: "pre-chorus", label: "Pre-Chorus" },
  { id: "chorus", label: "Chorus" },
  { id: "interlude", label: "Interlude" },
  { id: "verse-2", label: "Verse 2" },
  { id: "chorus-2", label: "Chorus 2" },
  { id: "bridge", label: "Bridge" },
  { id: "refrain", label: "Refrain" },
  { id: "outro", label: "Outro" }
];

export const SONG_SECTION_PRESETS = [
  ...LETTER_SECTION_PRESETS,
  ...POP_SECTION_PRESETS
];

export function formatProjectCredits(
  project: Pick<TeachingProject, "lyricist" | "composer" | "arranger" | "otherCredits">
): string {
  const lyricist = project.lyricist.trim();
  const composer = project.composer.trim();
  const arranger = project.arranger.trim();
  const lyricistKey = lyricist.normalize("NFKC");
  const composerKey = composer.normalize("NFKC");
  const arrangerKey = arranger.normalize("NFKC");
  const sameWriter =
    lyricist.length > 0 &&
    composer.length > 0 &&
    lyricistKey === composerKey;
  const credits = sameWriter
    ? [`${lyricist} 词曲`]
    : [lyricist && `作词 ${lyricist}`, composer && `作曲 ${composer}`];
  const structuredOtherCredits = parseTitleCredits(
    project.otherCredits.replace(/\s*·\s*/g, ",")
  );
  const otherCredits = structuredOtherCredits.length
    ? structuredOtherCredits
        .filter((credit) => {
          const name = credit.name.normalize("NFKC");
          if (credit.role === "lyrics-music") {
            return name !== lyricistKey && name !== composerKey;
          }
          if (credit.role === "lyrics") return name !== lyricistKey;
          if (credit.role === "music") return name !== composerKey;
          if (credit.role === "arrangement") return name !== arrangerKey;
          return true;
        })
        .map((credit) => `${credit.name} ${credit.roleLabel}`.trim())
    : [project.otherCredits.trim()];
  const allCredits = [
    ...credits,
    arranger && `编曲 ${arranger}`,
    ...otherCredits
  ].filter((credit): credit is string => Boolean(credit));

  return [...new Set(allCredits)].join(" · ");
}

export function createCustomSectionPreset(
  label: string,
  existing: SongSectionPreset[]
): SongSectionPreset | undefined {
  const normalizedLabel = label.normalize("NFKC").trim();
  if (!normalizedLabel) return undefined;
  if (
    [...SONG_SECTION_PRESETS, ...existing].some(
      (preset) => preset.label.localeCompare(normalizedLabel, undefined, { sensitivity: "accent" }) === 0
    )
  ) {
    return undefined;
  }

  const base = slugify(normalizedLabel);
  const occupied = new Set(existing.map((preset) => preset.id));
  let suffix = 1;
  let id: `custom:${string}` = `custom:${base}`;
  while (occupied.has(id)) {
    suffix += 1;
    id = `custom:${base}-${suffix}`;
  }
  return { id, label: normalizedLabel };
}

export function splitLyricsOnBlankLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("")
    )
    .filter(Boolean);
}

export function analyzeJapaneseReference(text: string): MorphologyResult {
  const segments = segmentJapanese(text);
  const tokens: MorphologyToken[] = segments.map((surface, index) => {
    const reading = referenceReadingForSurface(surface);
    return {
      id: `morph-${index + 1}`,
      surface,
      reading,
      needsReview: containsHan(surface)
    };
  });

  return {
    referenceReading: tokens.map((token) => token.reading || token.surface).join(""),
    tokens
  };
}

export function createTeachingProject(
  title: string,
  sourceLyrics: string
): TeachingProject {
  const phrases = splitLyricsOnBlankLines(sourceLyrics).map((lyricText, index) =>
    createProjectPhrase(lyricText, index)
  );

  return {
    formatVersion: 3,
    id: slugify(title || "teaching-project"),
    title: title.trim() || "新建教学工程",
    tags: [],
    artist: "",
    lyricist: "",
    composer: "",
    arranger: "",
    otherCredits: "",
    keyAndMeters: "1=C,4/4",
    expression: "J=80",
    sourceLyrics,
    phrases,
    customSections: [],
    sectionBreaks: phrases[0]
      ? [{ phraseId: phrases[0].id, section: "verse" }]
      : []
  };
}

export function createProjectPhrase(
  lyricText: string,
  index: number
): TeachingProjectPhrase {
  const morphology = analyzeJapaneseReference(lyricText);
  return {
    id: `project-phrase-${index + 1}`,
    lyricText,
    referenceReading: morphology.referenceReading,
    morphology: morphology.tokens,
    kind: "vocal",
    voiceLine: "",
    lyricJpwabc: morphology.referenceReading,
    lyricCells: [],
    keyOfOne: "",
    keyChanges: [],
    frame: undefined,
    annotation: "",
    showMetronome: true,
    skipDuringPlayback: false
  };
}

export function splitProjectPhrase(
  phrase: TeachingProjectPhrase,
  codePointOffset: number,
  nextIndex: number
): [TeachingProjectPhrase, TeachingProjectPhrase] | null {
  const characters = Array.from(phrase.lyricText);
  if (
    !Number.isInteger(codePointOffset) ||
    codePointOffset <= 0 ||
    codePointOffset >= characters.length
  ) {
    return null;
  }

  const left = characters.slice(0, codePointOffset).join("").trim();
  const right = characters.slice(codePointOffset).join("").trim();
  if (!left || !right) return null;

  return [
    {
      ...createProjectPhrase(left, nextIndex),
      id: phrase.id,
      kind: phrase.kind,
      voiceLine: phrase.voiceLine,
      annotation: phrase.annotation,
      showMetronome: phrase.showMetronome,
      skipDuringPlayback: phrase.skipDuringPlayback
    },
    {
      ...createProjectPhrase(right, nextIndex + 1),
      id: `${phrase.id}-split-${codePointOffset}-${nextIndex + 2}`,
      kind: phrase.kind,
      showMetronome: phrase.showMetronome,
      skipDuringPlayback: phrase.skipDuringPlayback
    }
  ];
}

export function resolvePhraseSection(
  project: TeachingProject,
  phraseIndex: number
): SectionId | undefined {
  if (phraseIndex < 0 || phraseIndex >= project.phrases.length) return undefined;
  const breaks = new Map(
    project.sectionBreaks.map((sectionBreak) => [
      sectionBreak.phraseId,
      sectionBreak.section
    ])
  );
  let current: SectionId | undefined;
  for (let index = 0; index <= phraseIndex; index += 1) {
    const phrase = project.phrases[index];
    if (!phrase) continue;
    current = breaks.get(phrase.id) ?? current;
  }
  return current;
}

export function setSectionBreak(
  project: TeachingProject,
  phraseId: string,
  section: SectionId
): TeachingProject {
  if (!project.phrases.some((phrase) => phrase.id === phraseId)) return project;
  const sectionBreaks = project.sectionBreaks.filter(
    (sectionBreak) => sectionBreak.phraseId !== phraseId
  );
  sectionBreaks.push({ phraseId, section });
  return {
    ...project,
    sectionBreaks: sortSectionBreaks(project.phrases, sectionBreaks)
  };
}

export function removeSectionBreak(
  project: TeachingProject,
  phraseId: string
): TeachingProject {
  return {
    ...project,
    sectionBreaks: project.sectionBreaks.filter(
      (sectionBreak) => sectionBreak.phraseId !== phraseId
    )
  };
}

function sortSectionBreaks(
  phrases: TeachingProjectPhrase[],
  sectionBreaks: TeachingSectionBreak[]
): TeachingSectionBreak[] {
  const order = new Map(
    phrases.map((phrase, index) => [phrase.id, index] as const)
  );
  return sectionBreaks
    .filter((sectionBreak) => order.has(sectionBreak.phraseId))
    .sort(
      (left, right) =>
        (order.get(left.phraseId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.phraseId) ?? Number.MAX_SAFE_INTEGER)
    );
}

function segmentJapanese(text: string): string[] {
  if (typeof Intl.Segmenter !== "function") return Array.from(text);
  const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  return Array.from(segmenter.segment(text))
    .map((entry) => entry.segment)
    .filter((segment) => segment.trim().length > 0);
}

function referenceReadingForSurface(surface: string): string {
  if (containsHan(surface)) return surface;
  return Array.from(surface)
    .map((character) => katakanaToHiragana(character))
    .join("");
}

function containsHan(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function katakanaToHiragana(character: string): string {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x30a1 || codePoint > 0x30f6) {
    return character;
  }
  return String.fromCodePoint(codePoint - 0x60);
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "teaching-project"
  );
}
