import { splitSections } from "../core/section";
import type { Diagnostic, WithDiagnostics } from "../core/diagnostics";
import { parseAttachments } from "./attachmentsParser";
import { parseFonts } from "./parseFonts";
import { parseOptions } from "./parseOptions";
import { parseTitle, displayTitleText } from "./parseTitle";
import { parseVoice } from "./voiceParser";
import { parseWords } from "./wordsParser";
import { parseNameValueSection } from "./nameValue";
import type { ScoreIR } from "../ir/score";
import { buildLyricToNoteAlignment, buildDemoEnglishLayer } from "../semantic/lyricNormalize";
import { classifyCurves } from "../semantic/classifyCurves";
import { detectKeyChanges } from "../semantic/detectKeyChanges";
import { buildDemoReadingOverrides } from "../semantic/readingOverrides";

export function parseJPWABC(text: string): WithDiagnostics<ScoreIR> {
  const diagnostics: Diagnostic[] = [];
  const sections = splitSections(text);
  diagnostics.push(...sections.diagnostics);

  const options = parseOptions(sections.value.Options);
  const fonts = parseFonts(sections.value.Fonts);
  const title = parseTitle(sections.value.Title);
  const voice = parseVoice(sections.value.Voice);
  const words = parseWords(sections.value.Words);
  const attachments = parseAttachments(sections.value.Attachments);
  const page = parseNameValueSection(sections.value.Page);

  diagnostics.push(
    ...options.diagnostics,
    ...fonts.diagnostics,
    ...title.diagnostics,
    ...voice.diagnostics,
    ...words.diagnostics,
    ...attachments.diagnostics,
    ...page.diagnostics
  );

  const curveResult = classifyCurves(voice.value);
  diagnostics.push(...curveResult.diagnostics);
  const slurs = curveResult.slurs;
  const lyricAlignments = buildLyricToNoteAlignment(voice.value, words.value);
  const keyChanges = detectKeyChanges(attachments.value);
  const readingOverrides = buildDemoReadingOverrides(displayTitleText(title.value.title));

  const score: ScoreIR = {
    title: title.value,
    options: options.value,
    fonts: fonts.value,
    page: page.value,
    voices: [voice.value],
    lyrics: words.value,
    lyricAlignments,
    lyricLayers: [
      {
        id: "words-track-1",
        lang: "ja-kana",
        source: "words",
        cells: words.value.flatMap((block) => block.cells),
        alignments: lyricAlignments
      },
      buildDemoEnglishLayer(lyricAlignments)
    ],
    attachments: attachments.value,
    semantic: {
      slurs,
      keyChanges,
      readingOverrides
    },
    diagnostics
  };

  return { value: score, diagnostics };
}
