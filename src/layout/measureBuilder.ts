import type { MeasureIR, VoiceIR } from "../ir/voice";
import { estimateMeasureWidth } from "./horizontalSpacing";

export function buildLayoutMeasures(voice: VoiceIR): MeasureIR[] {
  return voice.measures.map((measure) => ({
    ...measure,
    naturalWidth: estimateMeasureWidth(measure.events)
  }));
}

