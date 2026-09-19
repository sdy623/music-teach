import type { ScoreIR } from "../ir/score";
import type { VoiceEvent } from "../ir/voice";
import { lexVoice } from "../parser/voiceLexer";
import { classifyCurves } from "./classifyCurves";
import { analyzeParentheses, isTimedEvent } from "./voiceSpans";

/** Older saved ScoreIR snapshots may contain recognized decorations as unknown
 * tokens and tuplets only as markers. Enrich a display copy, keeping note IDs,
 * source anchors and the saved canonical snapshot intact. */
export function notationProjection(score: ScoreIR): ScoreIR {
  const voice = score.voices[0];
  if (!voice) return score;
  const knownPrefix = (event: VoiceEvent) => event.kind === "unknown" &&
    /^\{(?:(?:(?:#b|#|b|n)?[0-7][',gd]*)+|(?:DunYin|BoYin|YanYin|ZhongYin)(?:,(?:DunYin|BoYin|YanYin|ZhongYin))*)\}$/.test(event.raw);
  const missingTuplets = voice.events.some(event => event.kind === "tupletMarker" &&
    !score.semantic.slurs.some(curve => curve.id === `tuplet-${event.id}`));
  const missingSections = analyzeParentheses(voice.events).pairs.some(pair => pair.instrumental &&
    voice.events.slice(pair.start + 1, pair.end).some(event => isTimedEvent(event) && !event.instrumental));
  if (!missingTuplets && !missingSections && !voice.events.some(knownPrefix)) return score;

  const events: VoiceEvent[] = [];
  for (let i = 0; i < voice.events.length; i++) {
    const event = voice.events[i]!;
    if (knownPrefix(event)) {
      let end = i;
      while (end < voice.events.length && knownPrefix(voice.events[end]!)) end++;
      const main = voice.events[end];
      if (main && isTimedEvent(main)) {
        const raw = voice.events.slice(i, end + 1).map(entry => entry.raw).join("");
        const parsed = lexVoice(raw).value;
        if (parsed.length === 1 && isTimedEvent(parsed[0]!)) {
          const decorated = parsed[0]!;
          events.push({ ...main, raw, graceNotes: decorated.graceNotes, ornaments: decorated.ornaments });
          i = end;
          continue;
        }
      }
    }
    events.push({ ...event });
  }
  const byId = new Map(events.map(event => [event.id, event]));
  const projectedVoice = { ...voice, events, measures: voice.measures.map(measure => ({ ...measure,
    events: measure.events.flatMap(event => byId.has(event.id) ? [byId.get(event.id)!] : []) })) };
  const curves = classifyCurves(projectedVoice);
  return { ...score, voices: [projectedVoice, ...score.voices.slice(1)],
    semantic: { ...score.semantic, slurs: curves.slurs } };
}
