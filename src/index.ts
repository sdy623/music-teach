import "./slide/slide.css";

export { decodeJPWABC, decodeJPWABCWithInfo } from "./core/decode";
export { parseJPWABC } from "./parser/parseJPWABC";
export { scoreIRToSparksNMN } from "./sparks/jpwabcToSparks";
export { buildPhraseJPWABC, JpwLessonSlide, JpwPhraseLineRenderer, JpwTeachingRenderer } from "./teaching";
export type { JapaneseGrammarMark, JapaneseVocabularyMark, JpwLessonPhrase, PhraseJPWABCParts, TeachingLineInfo } from "./teaching";
export {
  buildLessonDeck,
  buildTeachingRubyTokens,
  layoutPhrase,
  JianpuLessonSlide as JianpuVideoLessonSlide,
  JianpuPhraseNotation
} from "./slide";
export type {
  BuildLessonDeckOptions,
  JianpuLessonDeck,
  JianpuPhraseFrame,
  PhraseBeat,
  PhraseCurve,
  PhraseJoinRule,
  PhraseLyricCell,
  PhraseMeasure,
  PhraseSplitRule,
  PhraseSlot,
  PhraseTeachingContent,
  TeachingMark,
  TeachingRubyToken
} from "./slide";
export type { ScoreIR } from "./ir/score";
export type { Diagnostic } from "./core/diagnostics";
export {
  LETTER_SECTION_PRESETS,
  POP_SECTION_PRESETS,
  SONG_SECTION_PRESETS,
  SlidevJianpuPhrase,
  analyzeJapaneseReference,
  convertJPWABCToTeachingProject,
  convertParsedScoreToTeachingProject,
  createCustomSectionPreset,
  createLocalProjectId,
  createTeachingProject,
  deserializeTeachingProject,
  downloadTeachingProject,
  migrateTeachingProject,
  listStoredTeachingProjects,
  loadCurrentTeachingProject,
  loadTeachingProjectLocally,
  removeSectionBreak,
  restoreProjectPhraseSemantics,
  saveTeachingProjectLocally,
  resolvePhraseSection,
  serializeTeachingProject,
  setSectionBreak,
  splitLyricsOnBlankLines,
  splitProjectPhrase
} from "./project";
export type {
  CustomSectionId,
  JapaneseMorphologyProvider,
  JPWABCProjectConversion,
  MorphologyResult,
  MorphologyToken,
  SongSectionId,
  SectionId,
  SongSectionPreset,
  TeachingPhraseKind,
  TeachingProject,
  TeachingProjectKeyChange,
  TeachingProjectLyricCell,
  TeachingProjectPhrase,
  TeachingSectionBreak,
  ProjectSaveResult,
  StoredTeachingProjectSummary
} from "./project";
export * from "./neo";
