import type { Accidental, GraceNoteIR, NoteDecorationsIR } from "../ir/voice";
import { engravingStyle, notationTop, type EngravingStyle } from "./engravingGeometry";
import { phraseDigitInk, printDigitInk, PRINT_GLYPH_SCALE } from "./notationProfiles";
import { JPW_ACCIDENTAL_GLYPHS } from "../render/glyphs/jpwScoreGlyphs";
import { graceAdvance, graceBottom, graceGeometry, type GraceMetrics, type GraceNote } from "./graceGeometry";
import { DECORATION_GLYPHS } from "./decorationGlyphs";

/** JP-Word numbered arcs: two tapered curved halves, split around the
 * numeral's ink. Ratios were measured from a local JP-Word PDF export;
 * the original score and its glyph outlines are not redistributed.
 * https://happyeo.gitbooks.io/jp-word-manual/content/04/04.html */
export function tupletArc(x1: number, x2: number, bottom: number, style: EngravingStyle, label = "3",
  continuedLeft = false, continuedRight = false) {
  const ink = style.digitBottom - style.digitTop;
  const glyphs = [...label].map(d => DECORATION_GLYPHS[("tuplet" + d) as keyof typeof DECORATION_GLYPHS]);
  const height = Math.max(...glyphs.map(g => g.y2 - g.y1));
  const size = ink * 0.576 / height;
  const letterGap = ink * 0.1;
  const width = glyphs.reduce((n, g) => n + (g.x2 - g.x1) * size, 0) + Math.max(0, glyphs.length - 1) * letterGap;
  const center = (x1 + x2) / 2;
  x1 -= ink * 0.08;
  x2 += ink * 0.08;
  const halfGap = width / 2 + ink * 0.323;
  const leftEnd = center - halfGap;
  const rightStart = center + halfGap;
  const crown = bottom - ink * 0.586;
  const thickness = ink * 0.098;
  const y = crown + thickness / 2;
  let cursor = center - width / 2;
  const labels = glyphs.map(g => {
    const transform = `translate(${cursor - g.x1 * size} ${y - (g.y1 + g.y2) / 2 * size}) scale(${size})`;
    cursor += (g.x2 - g.x1) * size + letterGap;
    return { d: g.d, transform };
  });
  const half = (start: number, end: number, direction: 1 | -1, continued: boolean) => {
    const arm = Math.max(0, (end - start) * direction);
    const px = (fraction: number) => start + direction * arm * fraction;
    if (continued) return `M ${start} ${crown} L ${end} ${crown} L ${end} ${crown + thickness} L ${start} ${crown + thickness} Z`;
    return `M ${start} ${bottom - ink * 0.05} C ${px(0.135)} ${bottom - ink * 0.332} ${px(0.518)} ${bottom - ink * 0.54} ${end - direction * ink * 0.018} ${crown} L ${end} ${crown + thickness} C ${px(0.527)} ${bottom - ink * 0.45} ${px(0.137)} ${bottom - ink * 0.259} ${start} ${bottom} Z`;
  };
  return { d: half(x1, leftEnd, 1, continuedLeft) + " " + half(x2, rightStart, -1, continuedRight),
    labels, top: y - ink * 0.576 / 2, y, x1, x2, strokeWidth: 0 };
}

function graceMetrics(style: EngravingStyle, print: boolean): GraceMetrics {
  const digit = print ? printDigitInk(1, 0, 0) : phraseDigitInk("1", 0, 0, style);
  return { ink: digit.bottom - digit.top, scale: 0.59,
    octaveUpY: digit.top - style.aboveGap, octaveDownY: style.aboveGap + 2 * style.dotRadius,
    octaveDotGap: style.aboveGap + 2 * style.dotRadius, octaveDotRadius: style.em * 0.06,
    underlineGap: style.beamGap };
}

function graceNotes(notes: readonly GraceNoteIR[]): GraceNote[] {
  // JPW brace grace notes use two reduction beams. This is the visual
  // duration supplied to the geometry helper, not extra playback time.
  return notes.map(note => ({ digit: String(note.degree), octave: note.octave, duration: 16, alter: note.accidental }));
}

export function graceLead(notes: readonly GraceNoteIR[] = [], em: number, print = false): number {
  return graceAdvance(graceNotes(notes), graceMetrics(engravingStyle(em), print));
}

export function noteDecorations(note: NoteDecorationsIR & { octave?: number; accidental?: Accidental; degree?: number }, x: number,
  baseline: number, style: EngravingStyle, print = false) {
  const mainTop = notationTop(note.octave ?? 0, baseline, style);
  const gm = graceMetrics(style, print);
  const notes = graceNotes(note.graceNotes ?? []);
  const probe = graceGeometry(notes, gm, x, baseline, -1, style.em, 0);
  const grace = graceGeometry(notes, gm, x, baseline, -1, style.em, mainTop - graceBottom(probe, gm));
  const size = style.em * gm.scale;
  const small = engravingStyle(size);
  let top = mainTop;
  const digits = grace.digits.map((digit, i) => {
    const ink = print ? printDigitInk(Number(digit.text), 0, 0) : phraseDigitInk(digit.text, 0, 0, small);
    const scale = print ? gm.scale : 1;
    const dx = (ink.left + ink.right) / 2 * scale;
    const dy = (ink.top + ink.bottom) / 2 * scale;
    top = Math.min(top, digit.cy + (ink.top - ink.bottom) / 2 * scale);
    return { note: note.graceNotes![i]!, x: digit.cx - dx, y: digit.cy - dy, cx: digit.cx, cy: digit.cy };
  });
  grace.dots.forEach(dot => { top = Math.min(top, dot.cy - dot.r); });
  const accidentals = grace.accidentals.map(acc => {
    const glyph = DECORATION_GLYPHS[acc.alter as Accidental];
    const scale = acc.inkHeight / (glyph.y2 - glyph.y1);
    top = Math.min(top, acc.inkCy - acc.inkHeight / 2);
    return { d: glyph.d, transform: `translate(${acc.inkRight - glyph.x2 * scale} ${acc.inkCy - (glyph.y1 + glyph.y2) / 2 * scale}) scale(${scale})` };
  });
  const hook = grace.hook ? `M ${grace.hook.m.join(" ")} C ${grace.hook.c.join(" ")}` : "";
  // Main-note ornaments occupy their own column, alongside the grace group.
  // Starting them above the entire grace group incorrectly lifts both the
  // ornament and the outer tuplet by a second full level.
  let ornamentBottom = mainTop - style.aboveGap;
  if (note.accidental) {
    const accidentalTop = print
      ? baseline - 0.15 - JPW_ACCIDENTAL_GLYPHS[note.accidental].height * PRINT_GLYPH_SCALE
      : baseline - (note.accidental === "flat" ? 10 : 15) +
          DECORATION_GLYPHS[note.accidental].y1 * (style.em <= 24 ? 24 : 38);
    top = Math.min(top, accidentalTop);
    ornamentBottom = Math.min(ornamentBottom, accidentalTop - style.aboveGap * 1.6);
  }
  const ornaments = (note.ornaments ?? []).map(kind => {
    const glyph = DECORATION_GLYPHS[kind];
    const transform = `translate(${x - (glyph.x1 + glyph.x2) / 2 * style.em} ${ornamentBottom - glyph.y2 * style.em}) scale(${style.em})`;
    const inkTop = ornamentBottom - (glyph.y2 - glyph.y1) * style.em;
    top = Math.min(top, inkTop);
    ornamentBottom = inkTop - style.aboveGap;
    return { kind, d: glyph.d, transform };
  });
  return { top, digits, size, small, dots: grace.dots, accidentals, beams: grace.beams, hook,
    hookWidth: grace.hook?.width ?? 0, ornaments, grace };
}
