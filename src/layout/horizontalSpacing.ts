import type { VoiceEvent } from "../ir/voice";

export function estimateEventWidth(event: VoiceEvent): number {
  switch (event.kind) {
    case "note":
    case "rest":
    case "rhythm":
      return (
        3.0 +
        event.duration.dashes * 2.8 +
        event.duration.dots * 0.75 -
        Math.min(event.duration.underlines, 2) * 0.15
      );
    case "barline":
      return event.style === "end" || event.style === "double" ? 3.8 : 2.8;
    case "meter":
      return 8;
    case "standardText":
      return Math.max(10, event.text.length * 2.1);
    case "return":
      return 0;
    case "slurMarker":
    case "tupletMarker":
    case "voltaMarker":
      return 0;
    case "unknown":
      return Math.max(4, event.raw.length * 1.4);
  }
}

export function estimateMeasureWidth(events: VoiceEvent[]): number {
  const raw = events.reduce((sum, event) => sum + estimateEventWidth(event), 0);
  const gaps = Math.max(0, events.filter((event) => estimateEventWidth(event) > 0).length - 1) * 1.1;
  return Math.max(8, raw + gaps);
}
