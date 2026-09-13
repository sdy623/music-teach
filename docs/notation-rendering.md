# Shared notation engraving

Slurs/ties, augmentation dashes, and reduction beams share pure geometry between the print and teaching-phrase renderers. The implementation adapts SlurTieBase and the continuous-beam and ink-spacing ideas in [jpeditor layout.ts](https://github.com/lodebar2026/jpeditor/blob/3e264a7b950d450ba920bb3989a5497de5fb8147/src/layout/layout.ts).

- Short curves are filled crescents with tapered tips. Long curves have a bounded height and flat centre; nested curves clear shorter spans. Print curves continue across systems/pages.
- Augmentation strokes use separate time cells and align to the vertical centre of digit ink.
- Reduction beams group by beat and contiguous duration level. A shorter level between two notes breaks the higher-level beam. Low octave dots sit below the final reduction line.
- The public edition uses bundled Noto Sans Display ExtraBold (SIL OFL). Phrase decoration anchors use measured ink bounds and advance widths; the font is packaged with the stylesheet. Print glyphs retain the public vector glyph assets.
- Compound meters and tuplets share event timing. Layout derives from the score without modifying canonical ScoreIR.

The implementation lives in src/notation/engravingGeometry.ts, eventTiming.ts and notationProfiles.ts, with integration in printLayout.ts and layoutPhrase.ts. Boundary tests cover very short and long curves, scaling, beam discontinuities, octave clearances, dash spacing, compound/tuplet grouping and cross-page continuation.

The jpeditor adaptation retains the full MIT notice both in source/build comments and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Temporary browser probe pages are development artifacts and are not shipped.
