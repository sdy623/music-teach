export {
  LETTER_SECTION_PRESETS,
  POP_SECTION_PRESETS,
  SONG_SECTION_PRESETS,
  analyzeJapaneseReference,
  createCustomSectionPreset,
  createProjectPhrase,
  createTeachingProject,
  removeSectionBreak,
  resolvePhraseSection,
  setSectionBreak,
  splitLyricsOnBlankLines,
  splitProjectPhrase
} from "./projectBuilder";
export {
  convertJPWABCToTeachingProject,
  convertParsedScoreToTeachingProject
} from "./jpwabcProject";
export {
  deserializeTeachingProject,
  downloadTeachingProject,
  migrateTeachingProject,
  serializeTeachingProject
} from "./projectExport";
export {
  buildRenderableProjectPhrase,
  restoreProjectPhraseSemantics
} from "./projectPhraseSemantics";
export {
  createLocalProjectId,
  listStoredTeachingProjects,
  loadCurrentTeachingProject,
  loadTeachingProjectLocally,
  saveTeachingProjectLocally
} from "./projectStore";
export type {
  ProjectSaveResult,
  StoredTeachingProjectSummary
} from "./projectStore";
export { default as SlidevJianpuPhrase } from "./SlidevJianpuPhrase.vue";
export { default as JianpuTitleSlide } from "../slide/JianpuTitleSlide.vue";
export { default as FullSongProgress } from "../slide/FullSongProgress.vue";
export {
  DEFAULT_TEACHING_HIGHLIGHT_PALETTE,
  buildSongProgressSections,
  buildTeachingRubyTokens,
  buildTeachingTextSegments
} from "../slide/teachingPresentation";
export type {
  JapaneseMorphologyProvider,
  CustomSectionId,
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
  TeachingSectionBreak
} from "./types";
export type { JPWABCProjectConversion } from "./jpwabcProject";
export type {
  SongProgressSection,
  TeachingHighlightPalette,
  TeachingMark,
  TeachingRubyToken,
  TeachingTextSegment
} from "../slide/types";
