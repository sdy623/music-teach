<script setup lang="ts">
import { computed } from "vue";
import type { PhraseSlot, JianpuPhraseFrame } from "./types";
import { layoutPhrase } from "./layoutPhrase";
import {
  highOctaveDotY,
  JIANPU_METRICS,
  lowOctaveDotY
} from "../notation/jianpuRules";
import {
  accidentalGlyph,
  barlineGlyphGeometry,
  SMUFL_GLYPHS,
  splitKeyOfOne,
  timeSignatureText
} from "../notation/smufl";
import { roundedArcPath, roundedTupletArcPaths } from "./curvePath";

const props = withDefaults(
  defineProps<{
    phrase: JianpuPhraseFrame;
    activeSlot?: number;
    teachingGhost?: boolean;
    showBeatPulse?: boolean;
    showKeyChanges?: boolean;
    showContext?: boolean;
  }>(),
  {
    activeSlot: -1,
    teachingGhost: true,
    showBeatPulse: true,
    showKeyChanges: true,
    showContext: false
  }
);

const emit = defineEmits<{
  "select-slot": [slot: PhraseSlot, index: number];
}>();

const openingContext = computed(() => props.showContext);
const geometry = computed(() =>
  layoutPhrase(props.phrase, {
    contextWidth: openingContext.value ? 150 : 6
  })
);
const active = computed(() => geometry.value.slots.find((slot) => slot.index === props.activeSlot));
const activeTokenId = computed(() => {
  const cell = active.value?.slot.lyricCell;
  return cell?.tokenId ?? cell?.inheritedTokenId;
});
const keyParts = computed(() => splitKeyOfOne(props.phrase.keyOfOne));
const keyAccidentalY = computed(() =>
  keyParts.value.accidental === SMUFL_GLYPHS.accidentalFlat ? 84 : 80
);

function accidentalText(slot: PhraseSlot): string {
  return accidentalGlyph(slot.accidental);
}

function slotText(slot: PhraseSlot): string {
  if (slot.kind === "rest") return "0";
  if (slot.kind === "rhythm") return "X";
  if (slot.kind === "sustain") return "";
  return String(slot.degree ?? "");
}

function slotOpacity(slot: PhraseSlot, index: number): number {
  if (index === props.activeSlot) return 1;
  if (slot.context) return 0.38;
  if (!props.teachingGhost || !slot.tieGhost) return 1;
  return 0.34;
}

function accidentalX(slot: PhraseSlot, x: number): number {
  return x - (slot.accidental === "flat" ? 17 : 19);
}

function accidentalY(slot: PhraseSlot, noteY: number): number {
  return noteY - (slot.accidental === "flat" ? 10 : 15);
}

function repeatDotX(x: number, style: string | undefined): number | undefined {
  const side = barlineGlyphGeometry(style as Parameters<typeof barlineGlyphGeometry>[0]).repeatDots;
  if (!side) return undefined;
  return x + (side === "left" ? -12 : 12);
}

function keyShiftText(semitoneShift: number | undefined): string {
  if (!semitoneShift) return "";
  return (semitoneShift > 0 ? "+" : "") + String(semitoneShift) + "key";
}
</script>

<template>
  <svg
    class="jianpu-phrase-notation"
    :class="{ 'is-opening-context': openingContext, 'is-continuation-context': !openingContext }"
    :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
    role="img"
    :aria-label="`${phrase.title}: ${phrase.normalizedText}`"
  >
    <rect class="phrase-score-bg" x="0" y="0" :width="geometry.width" :height="geometry.height" />

    <g v-if="openingContext" class="phrase-context" aria-hidden="true">
      <text class="phrase-key" x="26" y="89">1 =</text>
      <text
        v-if="keyParts.accidental"
        class="phrase-smufl phrase-key-accidental"
        x="78"
        :y="keyAccidentalY"
      >{{ keyParts.accidental }}</text>
      <text class="phrase-key phrase-key-letter" :x="keyParts.accidental ? 94 : 78" y="89">
        {{ keyParts.letter }}
      </text>
      <g class="phrase-meter" transform="translate(64 116)">
        <text class="phrase-smufl" x="0" y="0">{{ timeSignatureText(phrase.titleMeter.numerator) }}</text>
        <line class="phrase-meter-rule" x1="-9" y1="9" x2="9" y2="9" />
        <text class="phrase-smufl" x="0" y="24">{{ timeSignatureText(phrase.titleMeter.denominator) }}</text>
      </g>
      <g v-if="phrase.tempo" class="phrase-tempo" transform="translate(25 183)">
        <text class="phrase-smufl phrase-tempo-note" x="0" y="4">{{ SMUFL_GLYPHS.metronomeQuarterUp }}</text>
        <text x="31" y="4">= {{ phrase.tempo }}</text>
      </g>
      <text v-if="phrase.expression" class="phrase-expression" x="25" y="215">{{ phrase.expression }}</text>
    </g>

    <line
      v-if="openingContext"
      class="phrase-context-divider"
      :x1="geometry.contextWidth"
      y1="35"
      :x2="geometry.contextWidth"
      y2="252"
    />

    <g v-if="showBeatPulse" class="phrase-beat-pulses" aria-hidden="true">
      <g
        v-for="beat in geometry.beats"
        :key="beat.id"
        :class="{ 'is-active': active?.slot.measure === beat.measure && active.slot.beatIndex === beat.index }"
      >
        <line
          class="phrase-beat-rail"
          :x1="beat.x + 3"
          :x2="beat.x + beat.width - 3"
          y1="224"
          y2="224"
        />
        <line
          class="phrase-beat-tick"
          :x1="beat.x + 3"
          :x2="beat.x + 3"
          y1="220"
          y2="228"
        />
      </g>
    </g>

    <g v-if="showKeyChanges" class="phrase-key-changes" aria-label="转调标记">
      <g
        v-for="keyChange in geometry.keyChanges"
        :key="keyChange.change.id"
        :data-key-change-id="keyChange.change.id"
        :data-measure="keyChange.change.measure"
        :data-note-index="keyChange.change.noteIndex"
      >
        <line
          class="phrase-key-change-rule"
          :x1="keyChange.x - 72"
          y1="39"
          :x2="keyChange.x + 72"
          y2="39"
        />
        <line
          class="phrase-key-change-anchor"
          :x1="keyChange.anchorX"
          y1="39"
          :x2="keyChange.anchorX"
          y2="49"
        />
        <text class="phrase-key-change-label" :x="keyChange.x - 70" y="30">
          转调<tspan
            v-if="keyShiftText(keyChange.change.semitoneShift)"
            class="phrase-key-change-shift"
            dx="5"
            dy="-1"
          >{{ keyShiftText(keyChange.change.semitoneShift) }}</tspan>
        </text>
        <text class="phrase-key-change-value" :x="keyChange.x + 70" y="31">
          1 = {{ keyChange.change.keyOfOne }}
        </text>
      </g>
    </g>

    <g class="phrase-measures" aria-hidden="true">
      <g v-for="measure in geometry.measures" :key="measure.id">
        <text
          v-if="measure.showNumber"
          class="phrase-measure-number"
          :data-incomplete-measure="measure.incomplete || undefined"
          :x="measure.x + 4"
          y="53"
        >
          <tspan>{{ measure.number }}</tspan>
          <tspan
            v-if="measure.incomplete"
            class="phrase-measure-incomplete"
            dx="5"
          >未完整</tspan>
        </text>
        <g v-if="measure.startingBarline" class="phrase-barline">
          <line
            v-for="stroke in barlineGlyphGeometry(measure.startingBarline).strokes"
            :key="`start-${stroke.dx}`"
            :x1="measure.x + stroke.dx"
            :y1="JIANPU_METRICS.barlineTop"
            :x2="measure.x + stroke.dx"
            :y2="JIANPU_METRICS.barlineBottom"
            :stroke-width="stroke.width"
          />
          <g v-if="repeatDotX(measure.x, measure.startingBarline) !== undefined">
            <circle
              :cx="repeatDotX(measure.x, measure.startingBarline)"
              :cy="geometry.noteY - JIANPU_METRICS.repeatDotOffset"
              r="3"
            />
            <circle
              :cx="repeatDotX(measure.x, measure.startingBarline)"
              :cy="geometry.noteY + JIANPU_METRICS.repeatDotOffset"
              r="3"
            />
          </g>
        </g>
        <g v-if="measure.meterChanged" class="inline-meter" :transform="`translate(${measure.x + 20} 104)`">
          <text class="phrase-smufl" x="0" y="0">{{ timeSignatureText(measure.numerator) }}</text>
          <line class="phrase-meter-rule" x1="-8" y1="8" x2="8" y2="8" />
          <text class="phrase-smufl" x="0" y="22">{{ timeSignatureText(measure.denominator) }}</text>
        </g>
        <g v-if="measure.endingBarline" class="phrase-barline">
          <line
            v-for="stroke in barlineGlyphGeometry(measure.endingBarline).strokes"
            :key="stroke.dx"
            :x1="measure.endX + stroke.dx"
            :y1="JIANPU_METRICS.barlineTop"
            :x2="measure.endX + stroke.dx"
            :y2="JIANPU_METRICS.barlineBottom"
            :stroke-width="stroke.width"
          />
          <g v-if="repeatDotX(measure.endX, measure.endingBarline) !== undefined">
            <circle
              :cx="repeatDotX(measure.endX, measure.endingBarline)"
              :cy="geometry.noteY - JIANPU_METRICS.repeatDotOffset"
              r="3"
            />
            <circle
              :cx="repeatDotX(measure.endX, measure.endingBarline)"
              :cy="geometry.noteY + JIANPU_METRICS.repeatDotOffset"
              r="3"
            />
          </g>
        </g>
      </g>
    </g>

    <g class="phrase-curves" aria-hidden="true">
      <g v-for="curve in geometry.curves" :key="curve.curve.id" :class="`curve-${curve.curve.type}`">
        <template v-if="curve.curve.type === 'tuplet'">
          <path
            :d="roundedTupletArcPaths(curve)[0]"
          />
          <path
            :d="roundedTupletArcPaths(curve)[1]"
          />
          <text :x="curve.centerX" :y="curve.labelY">{{ curve.curve.label ?? "3" }}</text>
        </template>
        <path
          v-else
          :d="roundedArcPath(curve)"
        />
      </g>
    </g>

    <g class="phrase-slots">
      <g
        v-for="slotGeometry in geometry.slots"
        :key="slotGeometry.slot.id"
        class="phrase-slot"
        :class="{
          'is-active': slotGeometry.index === activeSlot,
          'is-ghost': slotGeometry.slot.tieGhost,
          'is-context': slotGeometry.slot.context,
          'is-rhythm': slotGeometry.slot.kind === 'rhythm',
          'is-sustain': slotGeometry.slot.kind === 'sustain'
        }"
        :data-event-id="slotGeometry.slot.sourceEventId"
        :data-slot-index="slotGeometry.index"
        :data-measure="slotGeometry.slot.measure"
        @click="emit('select-slot', slotGeometry.slot, slotGeometry.index)"
      >
        <rect
          v-if="slotGeometry.index === activeSlot"
          class="active-slot-marker"
          :x="slotGeometry.x - 25"
          y="64"
          width="50"
          height="162"
        />
        <g class="phrase-slot-symbols" :style="{ opacity: slotOpacity(slotGeometry.slot, slotGeometry.index) }">
          <text
            v-if="accidentalText(slotGeometry.slot)"
            class="phrase-smufl phrase-accidental"
            :x="accidentalX(slotGeometry.slot, slotGeometry.x)"
            :y="accidentalY(slotGeometry.slot, geometry.noteY)"
          >{{ accidentalText(slotGeometry.slot) }}</text>
          <text
            v-if="slotGeometry.slot.kind !== 'sustain'"
            class="phrase-digit"
            :x="slotGeometry.x"
            :y="geometry.noteY"
          >{{ slotText(slotGeometry.slot) }}</text>
          <line
            v-else
            class="phrase-augmentation-line"
            :x1="slotGeometry.x - JIANPU_METRICS.digitHalfWidth"
            :x2="slotGeometry.x + JIANPU_METRICS.digitHalfWidth"
            :y1="geometry.noteY + JIANPU_METRICS.durationDotYOffset"
            :y2="geometry.noteY + JIANPU_METRICS.durationDotYOffset"
          />

          <circle
            v-for="dotIndex in Math.max(0, slotGeometry.slot.octave)"
            :key="`high-${dotIndex}`"
            class="phrase-octave-dot"
            :cx="slotGeometry.x"
            :cy="highOctaveDotY(dotIndex - 1, geometry.noteY)"
            r="3.4"
          />
          <circle
            v-for="dotIndex in Math.max(0, -slotGeometry.slot.octave)"
            :key="`low-${dotIndex}`"
            class="phrase-octave-dot"
            :cx="slotGeometry.x"
            :cy="lowOctaveDotY(dotIndex - 1, slotGeometry.slot.underlines, geometry.noteY)"
            r="3.4"
          />
          <circle
            v-for="dotIndex in slotGeometry.slot.dots"
            :key="`duration-${dotIndex}`"
            class="phrase-duration-dot"
            :cx="slotGeometry.x + JIANPU_METRICS.durationDotXOffset + (dotIndex - 1) * JIANPU_METRICS.durationDotGap"
            :cy="geometry.noteY + JIANPU_METRICS.durationDotYOffset"
            r="3"
          />
        </g>

        <text
          v-if="slotGeometry.slot.lyricCell"
          class="phrase-score-lyric"
          :class="{
            'is-extension': slotGeometry.slot.lyricCell.kind === 'extension',
            'is-token-active':
              activeTokenId &&
              (slotGeometry.slot.lyricCell.tokenId === activeTokenId ||
                slotGeometry.slot.lyricCell.inheritedTokenId === activeTokenId)
          }"
          :data-lyric-cell-id="slotGeometry.slot.lyricCell.id"
          :data-token-id="slotGeometry.slot.lyricCell.tokenId ?? slotGeometry.slot.lyricCell.inheritedTokenId"
          :x="slotGeometry.x"
          :y="geometry.lyricY"
        >{{ slotGeometry.slot.lyricCell.display }}</text>
      </g>
    </g>

    <g class="phrase-beams" aria-hidden="true">
      <line
        v-for="beam in geometry.beams"
        :key="beam.id"
        :x1="beam.x1"
        :x2="beam.x2"
        :y1="beam.y"
        :y2="beam.y"
      />
    </g>
  </svg>
</template>
