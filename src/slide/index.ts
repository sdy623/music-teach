export { buildLessonDeck } from "./buildLessonDeck";
export { layoutPhrase } from "./layoutPhrase";
export { default as JianpuPhraseNotation } from "./JianpuPhraseNotation.vue";
export { default as JianpuLessonSlide } from "./JianpuLessonSlide.vue";
export { default as JianpuTitleSlide } from "./JianpuTitleSlide.vue";
export { buildTeachingRubyTokens } from "./teachingPresentation";
export type {
  BuildLessonDeckOptions,
  JianpuLessonDeck,
  JianpuPhraseFrame,
  PhraseBeat,
  PhraseCurve,
  PhraseKeyChange,
  PhraseLyricCell,
  PhraseAnchorRule,
  PhraseJoinRule,
  PhraseMeasure,
  PhraseSplitRule,
  PhraseSlot,
  PhraseTeachingContent,
  TeachingMark,
  TeachingRubyToken
} from "./types";
