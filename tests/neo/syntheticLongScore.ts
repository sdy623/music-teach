// Original synthetic scale exercise for large-project persistence tests.
// No melody or lyrics from third-party repertoire are included.
export function syntheticLongScore(phrases = 128): string {
  const voice = Array.from({ length: phrases }, () => "1 2 3 4 | 5 6 7 1 |").join("\n");
  const words = Array.from({ length: phrases }, (_, index) =>
    "W1@" + (index * 2 + 1) + ",1:\nあいうえおかきく").join("\n");
  return ".Title\nTitle = {Synthetic scale exercise}\nKeyAndMeters = {1=C,4/4}\nExpression = {J=96}\n.Voice\n" + voice + "\n.Words\n" + words + "\n";
}
