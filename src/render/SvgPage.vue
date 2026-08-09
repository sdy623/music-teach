<script setup lang="ts">
import type {
  AttachmentItem,
  BarlineItem,
  BeamItem,
  LayoutItem,
  MeterItem,
  NoteItem,
  PageLayout,
  PathItem,
  RestItem,
  RhythmItem,
  TempoItem,
  TextItem,
  TitleKeyMeterItem
} from "../layout/types";
import {
  JPW_ACCIDENTAL_GLYPHS,
  JPW_DIGIT_GLYPHS,
  JPW_DURATION_GLYPHS,
  JPW_SCORE_GLYPH_HEIGHT,
  type VectorGlyph
} from "./glyphs/jpwScoreGlyphs";

defineProps<{
  page: PageLayout;
}>();

function textAnchor(item: TextItem): string {
  return item.anchor ?? "middle";
}

function opacityForNote(item: NoteItem): number {
  return item.visualRole === "tie-ghost" ? 0.32 : 1;
}

function durationLines(item: NoteItem | RestItem | RhythmItem): number[] {
  const beamed = new Set(item.beamedUnderlineLevels ?? []);
  return Array.from({ length: item.duration.underlines }, (_, i) => i).filter((line) => !beamed.has(line));
}

function scoreGlyphScale(): number {
  return (5.2 / JPW_SCORE_GLYPH_HEIGHT) * 0.5;
}

function noteDigitGlyph(item: NoteItem): VectorGlyph | undefined {
  return JPW_DIGIT_GLYPHS[item.degree];
}

function restGlyph(): VectorGlyph | undefined {
  return JPW_DIGIT_GLYPHS[0];
}

function glyphTransform(x: number, y: number): string {
  return `translate(${x} ${y}) scale(${scoreGlyphScale()})`;
}

function accidentalGlyph(item: NoteItem): VectorGlyph | undefined {
  if (item.accidental === "sharp") return JPW_ACCIDENTAL_GLYPHS.sharp;
  if (item.accidental === "flat") return JPW_ACCIDENTAL_GLYPHS.flat;
  if (item.accidental === "natural") return JPW_ACCIDENTAL_GLYPHS.natural;
  return undefined;
}

function accidentalTransform(item: NoteItem): string {
  return `translate(${item.x - 2.15} ${item.y - 0.15}) scale(${scoreGlyphScale()})`;
}

function dashTransform(item: NoteItem | RestItem | RhythmItem, dash: number): string {
  return `translate(${item.x + 2.55 + dash * 2.35} ${item.y - 0.35}) scale(${scoreGlyphScale() * 1.7} ${scoreGlyphScale() * 2.15})`;
}

function underlineTransform(item: NoteItem | RestItem | RhythmItem, line: number): string {
  return `translate(${item.x} ${underlineY(item, line)}) scale(${scoreGlyphScale() * 1.65} ${scoreGlyphScale() * 2.2})`;
}

function dashes(item: NoteItem | RestItem | RhythmItem): number[] {
  return Array.from({ length: item.duration.dashes }, (_, i) => i);
}

function dots(item: NoteItem | RestItem | RhythmItem): number[] {
  return Array.from({ length: item.duration.dots }, (_, i) => i);
}

function octaveDots(item: NoteItem): number[] {
  return Array.from({ length: Math.abs(item.octave) }, (_, i) => i);
}

function barlineSegments(item: BarlineItem): { x: number; width: number }[] {
  if (item.style === "double") return [{ x: item.x - 0.8, width: 0.35 }, { x: item.x + 0.8, width: 0.35 }];
  if (item.style === "end") return [{ x: item.x - 0.8, width: 0.35 }, { x: item.x + 0.9, width: 0.9 }];
  if (item.style === "start") return [{ x: item.x - 0.8, width: 0.9 }, { x: item.x + 0.9, width: 0.35 }];
  if (item.style === "start-repeat" || item.style === "end-repeat") return [{ x: item.x, width: 0.4 }];
  return [{ x: item.x, width: 0.35 }];
}

function accidentalText(item: NoteItem): string {
  if (item.accidental === "sharp") return "#";
  if (item.accidental === "flat") return "b";
  if (item.accidental === "natural") return "n";
  return "";
}

function keyAccidentalGlyph(item: TitleKeyMeterItem): VectorGlyph | undefined {
  if (item.keyOfOne?.startsWith("#")) return JPW_ACCIDENTAL_GLYPHS.sharp;
  if (item.keyOfOne?.startsWith("b")) return JPW_ACCIDENTAL_GLYPHS.flat;
  if (item.keyOfOne?.startsWith("n")) return JPW_ACCIDENTAL_GLYPHS.natural;
  return undefined;
}

function keyLetter(item: TitleKeyMeterItem): string {
  return item.keyOfOne?.replace(/^[#bn]/i, "") ?? item.keyOfOne ?? "";
}

function keyPlainText(item: TitleKeyMeterItem): string {
  if (!item.keyOfOne) return "";
  return keyAccidentalGlyph(item) ? "1=" : `1=${item.keyOfOne}`;
}

function keyAccidentalTransform(item: TitleKeyMeterItem): string {
  return `translate(${item.x + 5.6} ${item.y + 0.2}) scale(${scoreGlyphScale() * 0.82})`;
}

function keyLetterX(item: TitleKeyMeterItem): number {
  return item.x + (keyAccidentalGlyph(item) ? 7.25 : 0);
}

function underlineY(item: NoteItem | RestItem | RhythmItem, line: number): number {
  if (item.kind === "note" && item.octave < 0) {
    return item.y + 2.25 + Math.abs(item.octave) * 1.15 + line * 0.92;
  }
  return item.y + 1.55 + line * 0.92;
}

function itemClass(item: LayoutItem): string {
  const extra = "className" in item ? item.className : "";
  const lyricKind = item.kind === "lyric" ? item.lyricKind : "";
  return [item.kind, lyricKind, extra].filter(Boolean).join(" ");
}
</script>

<template>
  <svg
    class="svg-page"
    :viewBox="`0 0 ${page.width} ${page.height}`"
    width="210mm"
    height="297mm"
    role="img"
    aria-label="JPW-ABC rendered score page"
  >
    <rect x="0" y="0" :width="page.width" :height="page.height" fill="white" />

    <template v-for="item in page.items" :key="item.id">
      <g
        v-if="item.kind === 'note'"
        :class="itemClass(item)"
        :opacity="opacityForNote(item as NoteItem)"
        :data-event-id="item.eventId"
        :data-note-id="item.eventId"
        :data-measure="item.measure"
      >
        <title>{{ item.eventId }}</title>
        <path
          v-if="accidentalGlyph(item as NoteItem)"
          class="score-accidental-path"
          :d="accidentalGlyph(item as NoteItem)?.d"
          :transform="accidentalTransform(item as NoteItem)"
          fill-rule="evenodd"
        />
        <text v-else-if="accidentalText(item as NoteItem)" class="score-accidental" :x="(item as NoteItem).x - 3.2" :y="(item as NoteItem).y">
          {{ accidentalText(item as NoteItem) }}
        </text>
        <path
          v-if="noteDigitGlyph(item as NoteItem)"
          class="score-digit-path"
          :d="noteDigitGlyph(item as NoteItem)?.d"
          :transform="glyphTransform((item as NoteItem).x, (item as NoteItem).y)"
          fill-rule="evenodd"
        />
        <text v-else class="score-digit" :x="(item as NoteItem).x" :y="(item as NoteItem).y">{{ (item as NoteItem).degree }}</text>
        <circle
          v-for="dot in octaveDots(item as NoteItem)"
          :key="`oct-${dot}`"
          class="octave-dot"
          :cx="(item as NoteItem).x"
          :cy="(item as NoteItem).y + ((item as NoteItem).octave > 0 ? -3.15 - dot * 1.1 : 1.75 + dot * 1.1)"
          r="0.28"
        />
        <path
          v-for="line in durationLines(item as NoteItem)"
          :key="`u-${line}`"
          class="duration-path underline-path"
          :d="JPW_DURATION_GLYPHS.underline.d"
          :transform="underlineTransform(item as NoteItem, line)"
        />
        <path
          v-for="dash in dashes(item as NoteItem)"
          :key="`d-${dash}`"
          class="duration-path dash-path"
          :d="JPW_DURATION_GLYPHS.dash.d"
          :transform="dashTransform(item as NoteItem, dash)"
        />
        <circle
          v-for="dot in dots(item as NoteItem)"
          :key="`dot-${dot}`"
          class="duration-dot"
          :cx="(item as NoteItem).x + 1.85 + dot * 0.95"
          :cy="(item as NoteItem).y - 0.65"
          r="0.25"
        />
      </g>

      <g
        v-else-if="item.kind === 'rest' || item.kind === 'rhythm'"
        :class="itemClass(item)"
        :data-event-id="item.eventId"
        :data-measure="item.measure"
      >
        <title>{{ item.eventId }}</title>
        <path
          v-if="item.kind === 'rest' && restGlyph()"
          class="score-digit-path"
          :d="restGlyph()?.d"
          :transform="glyphTransform(item.x, item.y)"
          fill-rule="evenodd"
        />
        <text v-else class="score-digit" :x="item.x" :y="item.y">{{ item.kind === "rest" ? "0" : "X" }}</text>
        <path
          v-for="line in durationLines(item as RestItem | RhythmItem)"
          :key="`u-${line}`"
          class="duration-path underline-path"
          :d="JPW_DURATION_GLYPHS.underline.d"
          :transform="underlineTransform(item as RestItem | RhythmItem, line)"
        />
        <path
          v-for="dash in dashes(item as RestItem | RhythmItem)"
          :key="`d-${dash}`"
          class="duration-path dash-path"
          :d="JPW_DURATION_GLYPHS.dash.d"
          :transform="dashTransform(item as RestItem | RhythmItem, dash)"
        />
        <circle
          v-for="dot in dots(item as RestItem | RhythmItem)"
          :key="`dot-${dot}`"
          class="duration-dot"
          :cx="item.x + 1.85 + dot * 0.95"
          :cy="item.y - 0.65"
          r="0.25"
        />
      </g>

      <g v-else-if="item.kind === 'barline'" :class="itemClass(item)" :data-event-id="item.eventId">
        <line
          v-for="segment in barlineSegments(item as BarlineItem)"
          :key="`${segment.x}-${segment.width}`"
          class="barline-stroke"
          :x1="segment.x"
          :x2="segment.x"
          :y1="(item as BarlineItem).y"
          :y2="(item as BarlineItem).y + (item as BarlineItem).height"
          :stroke-width="segment.width"
        />
        <circle
          v-if="(item as BarlineItem).style === 'start-repeat' || (item as BarlineItem).style === 'end-repeat'"
          class="repeat-dot"
          :cx="(item as BarlineItem).style === 'start-repeat' ? item.x + 2 : item.x - 2"
          :cy="item.y + 4.2"
          r="0.45"
        />
        <circle
          v-if="(item as BarlineItem).style === 'start-repeat' || (item as BarlineItem).style === 'end-repeat'"
          class="repeat-dot"
          :cx="(item as BarlineItem).style === 'start-repeat' ? item.x + 2 : item.x - 2"
          :cy="item.y + 8"
          r="0.45"
        />
      </g>

      <g v-else-if="item.kind === 'meter'" :class="itemClass(item)" :data-event-id="item.eventId">
        <text class="meter-text" :x="(item as MeterItem).x" :y="(item as MeterItem).y - 2.2">{{ (item as MeterItem).numerator }}</text>
        <text class="meter-text" :x="(item as MeterItem).x" :y="(item as MeterItem).y + 2.4">{{ (item as MeterItem).denominator }}</text>
      </g>

      <g v-else-if="item.kind === 'title-key-meter'" :class="itemClass(item)">
        <text
          class="title-key-text"
          :x="item.x"
          :y="item.y"
          :font-size="`${(item as TitleKeyMeterItem).size}px`"
        >
          {{ keyPlainText(item as TitleKeyMeterItem) }}
        </text>
        <path
          v-if="keyAccidentalGlyph(item as TitleKeyMeterItem)"
          class="score-accidental-path title-key-accidental"
          :d="keyAccidentalGlyph(item as TitleKeyMeterItem)?.d"
          :transform="keyAccidentalTransform(item as TitleKeyMeterItem)"
          fill-rule="evenodd"
        />
        <text
          v-if="keyAccidentalGlyph(item as TitleKeyMeterItem)"
          class="title-key-text"
          :x="keyLetterX(item as TitleKeyMeterItem)"
          :y="item.y"
          :font-size="`${(item as TitleKeyMeterItem).size}px`"
        >
          {{ keyLetter(item as TitleKeyMeterItem) }}
        </text>
        <template v-if="(item as TitleKeyMeterItem).numerator && (item as TitleKeyMeterItem).denominator">
          <text
            class="title-meter-text"
            :x="item.x + (item as TitleKeyMeterItem).meterOffset"
            :y="item.y - 2.2"
            :font-size="`${(item as TitleKeyMeterItem).size * 0.95}px`"
          >
            {{ (item as TitleKeyMeterItem).numerator }}
          </text>
          <text
            class="title-meter-text"
            :x="item.x + (item as TitleKeyMeterItem).meterOffset"
            :y="item.y + 2.4"
            :font-size="`${(item as TitleKeyMeterItem).size * 0.95}px`"
          >
            {{ (item as TitleKeyMeterItem).denominator }}
          </text>
        </template>
      </g>

      <g v-else-if="item.kind === 'tempo'" :class="itemClass(item)">
        <ellipse
          class="tempo-note-head"
          :cx="item.x + 1.35"
          :cy="item.y - 0.9"
          rx="1.05"
          ry="0.78"
          :transform="`rotate(-18 ${item.x + 1.35} ${item.y - 0.9})`"
        />
        <line class="tempo-note-stem" :x1="item.x + 2.2" :x2="item.x + 2.2" :y1="item.y - 1.1" :y2="item.y - 5.8" />
        <text class="tempo-text" :x="item.x + 5.2" :y="item.y" :font-size="`${(item as TempoItem).size}px`">= {{ (item as TempoItem).bpm }}</text>
      </g>

      <text
        v-else-if="item.kind === 'lyric'"
        :class="itemClass(item)"
        :x="item.x"
        :y="item.y"
        text-anchor="middle"
        :data-event-id="item.eventId"
        :data-lyric-cell-id="item.cellId"
        :data-token-id="item.tokenId || item.inheritedTokenId"
      >
        {{ item.text }}
      </text>

      <path
        v-else-if="item.kind === 'beam'"
        :class="itemClass(item)"
        :d="(item as BeamItem).d"
        fill="currentColor"
      />

      <path
        v-else-if="item.kind === 'path'"
        :class="itemClass(item)"
        :d="(item as PathItem).d"
        fill="none"
        stroke="currentColor"
        :stroke-width="(item as PathItem).strokeWidth"
      />

      <text
        v-else-if="item.kind === 'attachment'"
        :class="itemClass(item)"
        x="0"
        y="0"
        :transform="`translate(${item.x} ${item.y}) scale(${(item as AttachmentItem).scaleX} ${(item as AttachmentItem).scaleY})`"
      >
        {{ (item as AttachmentItem).text }}
      </text>

      <text
        v-else-if="item.kind === 'text' || item.kind === 'diagnostics'"
        :class="itemClass(item)"
        :x="item.x"
        :y="item.y"
        :font-size="`${(item as TextItem).size ?? 3}px`"
        :text-anchor="textAnchor(item as TextItem)"
      >
        {{ (item as TextItem).text }}
      </text>
    </template>
  </svg>
</template>
