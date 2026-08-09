export interface PhraseArcGeometry {
  x1: number;
  x2: number;
  centerX: number;
  baseY: number;
  apexY: number;
}

const DEFAULT_TUPLET_LABEL_HALF_GAP = 17;

export function roundedArcPath(curve: PhraseArcGeometry): string {
  const span = Math.max(1, curve.x2 - curve.x1);
  const shoulder = span * 0.28;

  return [
    `M ${format(curve.x1)} ${format(curve.baseY)}`,
    `C ${format(curve.x1 + shoulder)} ${format(curve.apexY)}`,
    `${format(curve.x2 - shoulder)} ${format(curve.apexY)}`,
    `${format(curve.x2)} ${format(curve.baseY)}`
  ].join(" ");
}

export function roundedTupletArcPaths(
  curve: PhraseArcGeometry,
  labelHalfGap = DEFAULT_TUPLET_LABEL_HALF_GAP
): [string, string] {
  const span = Math.max(1, curve.x2 - curve.x1);
  const halfSpan = span / 2;
  const safeGap = Math.min(labelHalfGap, Math.max(6, halfSpan * 0.42));
  const leftEnd = curve.centerX - safeGap;
  const rightStart = curve.centerX + safeGap;
  const shoulder = span * 0.18;
  const crownShoulder = span * 0.06;

  return [
    [
      `M ${format(curve.x1)} ${format(curve.baseY)}`,
      `C ${format(curve.x1 + shoulder)} ${format(curve.apexY)}`,
      `${format(leftEnd - crownShoulder)} ${format(curve.apexY)}`,
      `${format(leftEnd)} ${format(curve.apexY)}`
    ].join(" "),
    [
      `M ${format(rightStart)} ${format(curve.apexY)}`,
      `C ${format(rightStart + crownShoulder)} ${format(curve.apexY)}`,
      `${format(curve.x2 - shoulder)} ${format(curve.apexY)}`,
      `${format(curve.x2)} ${format(curve.baseY)}`
    ].join(" ")
  ];
}

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}
