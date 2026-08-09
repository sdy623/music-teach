# Slidev Integration

[English](slidev-integration.md) | [简体中文](slidev-integration.zh-CN.md)

`SlidevJianpuPhrase` renders one JPW-ABC phrase in a fixed 16:9 teaching frame. Slidev may scale the frame, but the notation does not reflow at a different browser width.

## Build and install locally

Build the Vue library in this repository:

```bash
npm ci
npm run build:lib
```

Install the checkout from your Slidev project:

```bash
npm install ../music-teach
```

The package exports an ES module and `style.css`. Rebuild after changing source files in the renderer checkout.

## Enter one phrase directly

Add the component and stylesheet to `slides.md`:

```md
<script setup lang="ts">
import { SlidevJianpuPhrase } from "music-teach"
import "music-teach/style.css"
</script>

# Verse

<SlidevJianpuPhrase
  voice-line="| 6 6 1g- | 6 6 1g- |"
  lyric-text="さくらさくら"
  reference-reading="さくらさくら"
  title="さくら"
  key-and-meters="1=D,4/4"
  expression="J=80"
  section="Verse"
  annotation="Keep the same breath point on the repeat."
  :show-metronome="false"
  :teaching-ghost="true"
/>
```

The component creates a minimal JPW-ABC document internally, parses it through the same Score IR pipeline, and renders the first phrase.

Useful props:

| Prop | Purpose |
| --- | --- |
| `voice-line` | JPW-ABC `.Voice` content for this phrase |
| `lyric-text` | Surface lyric shown on the slide |
| `reference-reading` | Singing/reference reading used for alignment |
| `key-and-meters` | Header key and meter, such as `1=D,4/4` |
| `expression` | Tempo/expression text, such as `J=80` |
| `section` | Current section label |
| `annotation` | Free teaching or arrangement note |
| `active-slot` | Zero-based slot controlled by the host timeline |
| `teaching-ghost` | Ghost tie-continuation note attacks |
| `show-metronome` | Show beat pulse UI |
| `show-key-changes` | Show detected key-change annotations |

## Pass a prepared phrase

For a full score, decode and build the deck once, then pass an existing `JianpuPhraseFrame`:

```vue
<SlidevJianpuPhrase
  :phrase="deck.phrases[0]"
  :active-slot="activeSlot"
  section="Chorus"
  @select-slot="handleSlot"
/>
```

The host controls page changes and `activeSlot`. This keeps notation rendering independent from Slidev navigation, audio, and video export.

## Sections and page generation

Teaching-project sections use split points. A split point starts a section at one phrase and remains active until the next split point. Do not duplicate the section selector under every phrase.

A typical generator maps one project phrase to one Slidev page:

```ts
const pages = project.phrases.map((phrase, index) => ({
  phrase,
  section: resolvePhraseSection(project, index)
}));
```

Instrumental phrases can carry arrangement annotations and may be omitted from automatic playback. Blank phrases can reserve a text-only explanation page without inventing note events.

## Troubleshooting

- Blank slide: confirm `voice-line` contains a note, rest, or `X` event.
- Missing styles: import `music-teach/style.css`.
- Lyrics shifted after a tie: preserve extension cells and drive highlights with slot indexes.
- Development changes not visible: rerun `npm run build:lib`, then restart Slidev.
- Direct SPA route returns 404 in production: configure the host to fall back to `index.html`.
