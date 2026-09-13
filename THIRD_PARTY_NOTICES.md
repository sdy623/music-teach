# Third-Party Notices

## Sparks Notation

`vendor/sparks-notation-1/packages/core` and `packages/util` are derived from Sparks Notation commit `e3b1e92` by yezhiyi9670. The upstream project and the vendored source are licensed under Apache-2.0; see `vendor/sparks-notation-1/LICENSE` and `NOTICE`.

Local modifications affect dynamic line density, spacing, tuplets, barlines, meter rendering, font loading, and related parser behavior.

## Fonts

- Bravura: SIL Open Font License 1.1.
- Noto Sans SC and Noto Sans Display: SIL Open Font License 1.1.
- MScore 2.0, Roman, and Roman Italic assets: bundled with their GPL license texts.
- AR PL UMing: bundled with its AR PL license text.
- WenQuanYi Micro Hei: Apache-2.0.

Each redistributed font directory contains its applicable license or notice. Optional user-supplied score fonts under `public/fonts` are not part of this repository.

## jpeditor

The curve geometry in `src/notation/engravingGeometry.ts` is adapted from
`src/layout/layout.ts` (`SlurTieBase`) in
https://github.com/lodebar2026/jpeditor at commit
`3e264a7b950d450ba920bb3989a5497de5fb8147`.
Its contiguous beam construction and ink-based spacing also informed the shared
print and teaching-phrase rendering rules. The adaptation uses Music Teach's
existing ScoreIR, fonts, layout units and beat cells.

MIT License

Copyright (c) 2026 lodebar2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
