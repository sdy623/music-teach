import type { Diagnostic } from "../core/diagnostics";
import { decodeJPWABCWithInfo, type JPWABCEncoding } from "../core/decode";
import type { ScoreIR } from "../ir/score";
import type { VoiceEvent } from "../ir/voice";
import { parseJPWABC } from "../parser/parseJPWABC";
import { displayTitleText } from "../parser/parseTitle";
import { buildLessonDeck } from "../slide/buildLessonDeck";
import type { JianpuPhraseFrame } from "../slide/types";
import { createProjectPhrase, createTeachingProject } from "./projectBuilder";
import type { TeachingProject, TeachingProjectPhrase } from "./types";

export interface JPWABCProjectConversion {
  project: TeachingProject;
  diagnostics: Diagnostic[];
  encoding: JPWABCEncoding;
}

export function convertJPWABCToTeachingProject(
  buffer: ArrayBuffer,
  projectId?: string
): JPWABCProjectConversion {
  const decoded = decodeJPWABCWithInfo(buffer);
  const parsed = parseJPWABC(decoded.text);
  return {
    ...convertParsedScoreToTeachingProject(parsed.value, projectId),
    diagnostics: parsed.diagnostics,
    encoding: decoded.encoding
  };
}

export function convertParsedScoreToTeachingProject(
  score: ScoreIR,
  projectId?: string
): Omit<JPWABCProjectConversion, "encoding"> {
  const deck = buildLessonDeck(score, { id: projectId });
  const voice = score.voices[0];
  const timelineFrames = buildTrackOrderedFrames(score, projectId);
  const phrases = timelineFrames.map((phrase, index) =>
    phraseToProjectPhrase(phrase, index, voice?.events ?? [])
  );

  if (phrases.length === 0 && voice?.events.some(isSlotEvent)) {
    const fallback = createProjectPhrase("", 0);
    fallback.kind = "instrumental";
    fallback.voiceLine = voice.events
      .filter((event) => event.kind !== "return")
      .map((event) => event.raw)
      .join(" ")
      .trim();
    fallback.annotation = "JPWABC 中没有可切分的歌词，已作为器乐乐句导入。";
    fallback.skipDuringPlayback = true;
    phrases.push(fallback);
  }

  const sourceLyrics = phrases
    .map((phrase) => phrase.lyricText)
    .filter(Boolean)
    .join("\n\n");
  const creditsRaw = displayTitleText(score.title.wordsByAndMusicBy);
  const credits = parseCredits(creditsRaw);
  const project = createTeachingProject(deck.title, sourceLyrics);
  project.id = slugify(projectId || deck.id);
  project.title = deck.title;
  project.artist = credits.artist;
  project.lyricist = credits.lyricist;
  project.composer = credits.composer;
  project.arranger = credits.arranger;
  project.otherCredits = creditsRaw;
  project.keyAndMeters = score.title.keyAndMeters?.trim() || "1=C,4/4";
  project.expression = displayTitleText(score.title.expression) || "J=80";
  project.sourceLyrics = sourceLyrics;
  project.phrases = phrases;
  project.sectionBreaks = phrases[0]
    ? [{ phraseId: phrases[0].id, section: "verse" }]
    : [];

  return { project, diagnostics: deck.diagnostics };
}

function buildTrackOrderedFrames(
  score: ScoreIR,
  projectId: string | undefined
): JianpuPhraseFrame[] {
  const tracks = [...new Set(score.lyrics.map((block) => block.track))].sort(
    (left, right) => left - right
  );
  if (tracks.length <= 1) {
    return buildLessonDeck(score, { id: projectId }).phrases;
  }

  return tracks.flatMap((track) =>
    buildLessonDeck(
      {
        ...score,
        lyrics: score.lyrics.filter((block) => block.track === track)
      },
      { id: `${projectId ?? "teaching-project"}-words-${track}` }
    ).phrases
  );
}

function phraseToProjectPhrase(
  phrase: JianpuPhraseFrame,
  index: number,
  events: VoiceEvent[]
): TeachingProjectPhrase {
  const result = createProjectPhrase(phrase.lyricText, index);
  result.id = `project-phrase-${index + 1}`;
  result.voiceLine = voiceLineForPhrase(phrase, events);
  return result;
}

function voiceLineForPhrase(
  phrase: JianpuPhraseFrame,
  events: VoiceEvent[]
): string {
  const sourceIds = new Set(
    phrase.slots
    .filter((slot) => slot.kind !== "sustain")
    .map((slot) => slot.sourceEventId)
  );
  const selectedIndexes = events.flatMap((event, index) =>
    sourceIds.has(event.id) ? [index] : []
  );
  if (selectedIndexes.length === 0) {
    return phrase.slots
      .filter((slot) => slot.kind !== "sustain")
      .map((slot) => slot.raw)
      .join(" ");
  }

  const selectedEventIndexes = new Set<number>();
  splitSelectedRanges(events, selectedIndexes, sourceIds).forEach(
    ([startIndex, endIndex]) => {
      for (let index = startIndex; index <= endIndex; index += 1) {
        selectedEventIndexes.add(index);
      }
    }
  );

  return events
    .filter((_, index) => selectedEventIndexes.has(index))
    .filter((event) => event.kind !== "return")
    .map((event) => event.raw)
    .join(" ")
    .trim();
}

function splitSelectedRanges(
  events: VoiceEvent[],
  selectedIndexes: number[],
  sourceIds: Set<string>
): Array<[number, number]> {
  const groups: number[][] = [];
  selectedIndexes.forEach((index) => {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    const hasUnselectedSlot =
      previous !== undefined &&
      events
        .slice(previous + 1, index)
        .some((event) => isSlotEvent(event) && !sourceIds.has(event.id));
    if (!current || hasUnselectedSlot) groups.push([index]);
    else current.push(index);
  });

  return groups.map((group) => {
    let start = group[0]!;
    let end = group.at(-1)!;
    for (let index = start - 1; index >= 0; index -= 1) {
      const event = events[index]!;
      if (isSlotEvent(event)) break;
      start = index;
      if (event.kind === "barline") break;
    }
    for (let index = end + 1; index < events.length; index += 1) {
      const event = events[index]!;
      if (isSlotEvent(event)) break;
      end = index;
      if (event.kind === "barline") break;
    }
    return [start, end];
  });
}

function isSlotEvent(event: VoiceEvent): boolean {
  return event.kind === "note" || event.kind === "rest" || event.kind === "rhythm";
}

interface ParsedCredits {
  artist: string;
  lyricist: string;
  composer: string;
  arranger: string;
}

function parseCredits(raw: string): ParsedCredits {
  const result: ParsedCredits = {
    artist: "",
    lyricist: "",
    composer: "",
    arranger: ""
  };

  splitTopLevelCredits(raw).forEach((sourcePart) => {
    const part = sourcePart.replace(/[{}]/g, "").trim();
    const matched = part.match(
      /^(.*?)(词曲|詞曲|作词|作詞|作曲|编曲|編曲|演唱|歌手|vocal)$/i
    );
    if (!matched) return;
    const name = matched[1]?.trim() ?? "";
    const role = matched[2]?.toLocaleLowerCase() ?? "";
    if (!name) return;
    if (role === "词曲" || role === "詞曲") {
      result.lyricist = appendCredit(result.lyricist, name);
      result.composer = appendCredit(result.composer, name);
    } else if (role === "作词" || role === "作詞") {
      result.lyricist = appendCredit(result.lyricist, name);
    } else if (role === "作曲") {
      result.composer = appendCredit(result.composer, name);
    } else if (role === "编曲" || role === "編曲") {
      result.arranger = appendCredit(result.arranger, name);
    } else {
      result.artist = appendCredit(result.artist, name);
    }
  });

  return result;
}

function splitTopLevelCredits(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of raw) {
    if (character === "{") depth += 1;
    if (character === "}") depth = Math.max(0, depth - 1);
    if ((character === "," || character === "，" || character === "\n") && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function appendCredit(current: string, name: string): string {
  return current ? `${current}, ${name}` : name;
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "teaching-project"
  );
}
