import type { OptionsIR } from "../parser/parseOptions";
import type { FontsIR } from "../parser/parseFonts";
import type { TitleIR } from "../parser/parseTitle";
import type { VoiceIR } from "./voice";
import type { LyricAlignment, LyricBlock, LyricLayer } from "./lyric";
import type { AttachmentIR } from "./attachment";
import type { SemanticInfo } from "./semantic";
import type { Diagnostic } from "../core/diagnostics";

export interface ScoreIR {
  title: TitleIR;
  options: OptionsIR;
  fonts: FontsIR;
  page: Record<string, string>;
  voices: VoiceIR[];
  lyrics: LyricBlock[];
  lyricAlignments: LyricAlignment[];
  lyricLayers: LyricLayer[];
  attachments: AttachmentIR[];
  semantic: SemanticInfo;
  diagnostics: Diagnostic[];
}

