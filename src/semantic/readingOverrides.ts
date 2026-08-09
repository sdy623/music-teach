import type { ReadingOverride } from "../ir/semantic";

export function buildDemoReadingOverrides(scoreTitle: string): ReadingOverride[] {
  if (!scoreTitle.includes("さくら")) return [];
  return [
    {
      anchor: { bar: 3, slot: 2 },
      surface: "弥生",
      reading: "やよい",
      readingType: "jukujikun",
      morae: ["や", "よ", "い"],
      meaning: "旧历三月，也可作人名读法。"
    }
  ];
}

