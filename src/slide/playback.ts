export function findNextPlayablePhraseIndex<T extends { id: string }>(
  phrases: readonly T[],
  fromIndex: number,
  omitMarkedPhrases: boolean,
  shouldSkip: (phrase: T) => boolean
): number {
  for (let index = fromIndex + 1; index < phrases.length; index += 1) {
    const phrase = phrases[index]!;
    if (!omitMarkedPhrases || !shouldSkip(phrase)) return index;
  }
  return -1;
}
