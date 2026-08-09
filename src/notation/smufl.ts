import type { Accidental, BarlineEvent } from "../ir/voice";

export const SMUFL_GLYPHS = {
  accidentalFlat: "\uE260",
  accidentalNatural: "\uE261",
  accidentalSharp: "\uE262",
  accidentalDoubleSharp: "\uE263",
  accidentalDoubleFlat: "\uE264",
  repeatDot: "\uE044",
  metronomeQuarterUp: "\uECA5"
} as const;

const TIME_SIGNATURE_ZERO = 0xe080;

export interface BarlineGlyphGeometry {
  strokes: Array<{ dx: number; width: number }>;
  repeatDots?: "left" | "right";
}

export function accidentalGlyph(accidental: Accidental | undefined): string {
  if (accidental === "sharp") return SMUFL_GLYPHS.accidentalSharp;
  if (accidental === "flat") return SMUFL_GLYPHS.accidentalFlat;
  if (accidental === "natural") return SMUFL_GLYPHS.accidentalNatural;
  return "";
}

export function splitKeyOfOne(value: string): { accidental: string; letter: string } {
  const trimmed = value.trim();
  const first = trimmed[0];
  if (first === "♯" || first === "#") {
    return { accidental: SMUFL_GLYPHS.accidentalSharp, letter: trimmed.slice(1) };
  }
  if (first === "♭" || first === "b") {
    return { accidental: SMUFL_GLYPHS.accidentalFlat, letter: trimmed.slice(1) };
  }
  if (first === "♮" || first === "n") {
    return { accidental: SMUFL_GLYPHS.accidentalNatural, letter: trimmed.slice(1) };
  }
  return { accidental: "", letter: trimmed };
}

export function timeSignatureText(value: number): string {
  return String(Math.max(0, Math.trunc(value)))
    .split("")
    .map((digit) => String.fromCodePoint(TIME_SIGNATURE_ZERO + Number(digit)))
    .join("");
}

export function barlineGlyphGeometry(style: BarlineEvent["style"] | undefined): BarlineGlyphGeometry {
  if (style === "double") {
    return { strokes: [{ dx: -3.2, width: 1.7 }, { dx: 3.2, width: 1.7 }] };
  }
  if (style === "end") {
    return { strokes: [{ dx: -3.4, width: 1.7 }, { dx: 3.2, width: 5.2 }] };
  }
  if (style === "start") {
    return { strokes: [{ dx: -3.2, width: 5.2 }, { dx: 3.4, width: 1.7 }] };
  }
  if (style === "start-repeat") {
    return {
      strokes: [{ dx: -3.2, width: 5.2 }, { dx: 3.4, width: 1.7 }],
      repeatDots: "right"
    };
  }
  if (style === "end-repeat") {
    return {
      strokes: [{ dx: -3.4, width: 1.7 }, { dx: 3.2, width: 5.2 }],
      repeatDots: "left"
    };
  }
  return { strokes: [{ dx: 0, width: 1.7 }] };
}
