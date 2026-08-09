import type { MeasureIR } from "../ir/voice";

export interface SystemLine {
  measures: MeasureIR[];
  naturalWidth: number;
  isLast: boolean;
}

export function breakMeasuresIntoLines(measures: MeasureIR[], lineWidth: number): SystemLine[] {
  const lines: SystemLine[] = [];
  let current: MeasureIR[] = [];
  let width = 0;

  for (const measure of measures) {
    const nextWidth = width + measure.naturalWidth;
    if (current.length > 0 && nextWidth > lineWidth) {
      lines.push({ measures: current, naturalWidth: width, isLast: false });
      current = [measure];
      width = measure.naturalWidth;
    } else {
      current.push(measure);
      width = nextWidth;
    }
  }

  if (current.length) {
    lines.push({ measures: current, naturalWidth: width, isLast: true });
  }

  return lines.map((line, index) => ({ ...line, isLast: index === lines.length - 1 }));
}

