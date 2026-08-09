import type { Diagnostic, WithDiagnostics } from "../core/diagnostics";
import { warning } from "../core/diagnostics";
import type { LyricBlock, LyricCell } from "../ir/lyric";

let cellCounter = 0;

interface PendingLyricBlock {
  id: string;
  track: number;
  repeat?: string;
  showNumber?: boolean;
  anchor: { measure: number; note: number };
  lines: string[];
}

export function parseWords(src: string): WithDiagnostics<LyricBlock[]> {
  cellCounter = 0;
  const diagnostics: Diagnostic[] = [];
  const pending: PendingLyricBlock[] = [];
  let current: PendingLyricBlock | null = null;

  for (const rawLine of src.replace(/\r\n?/g, "\n").split("\n")) {
    const prefix = parseWordsPrefix(rawLine);
    if (prefix) {
      current = {
        id: `lyric-${pending.length + 1}`,
        track: prefix.track,
        repeat: prefix.repeat,
        showNumber: prefix.showNumber,
        anchor: { measure: prefix.measure, note: prefix.note },
        lines: [prefix.trailing]
      };
      pending.push(current);
      continue;
    }

    if (current) {
      current.lines.push(rawLine);
    } else if (rawLine.trim()) {
      diagnostics.push(warning("WORDS_ORPHAN_TEXT", "Ignored lyric text before a Wn@measure,note prefix.", rawLine));
    }
  }

  const blocks = pending.map((block) => {
    const rawText = block.lines.join("\n").trim();
    const cells = parseLyricCells(rawText);
    return {
      id: block.id,
      track: block.track,
      repeat: block.repeat,
      showNumber: block.showNumber,
      anchor: block.anchor,
      rawText,
      cells,
      normalizedText: normalizeLyricForNLP(cells)
    };
  });

  return { value: blocks, diagnostics };
}

export function parseLyricCells(text: string): LyricCell[] {
  const cells: LyricCell[] = [];
  let i = 0;
  let lastTokenId: string | undefined;

  while (i < text.length) {
    const ch = text[i] ?? "";

    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      const raw = end >= 0 ? text.slice(i, end + 1) : text.slice(i);
      const display = raw.startsWith("{") && raw.endsWith("}") ? raw.slice(1, -1) : raw;
      const tokenId = nextCellId("token");
      cells.push({
        id: nextCellId("cell"),
        kind: "multiChar",
        raw,
        display,
        consumesNoteSlot: true,
        normalizedText: display.replace(/\s+/g, ""),
        tokenId
      });
      lastTokenId = tokenId;
      i += raw.length;
      continue;
    }

    if (ch === "/") {
      let j = i;
      while (text[j] === "/") j += 1;
      const raw = text.slice(i, j);
      cells.push({
        id: nextCellId("cell"),
        kind: "separator",
        raw,
        display: raw,
        consumesNoteSlot: false,
        skipSlots: raw.length
      });
      i = j;
      continue;
    }

    if (ch === "ー") {
      cells.push({
        id: nextCellId("cell"),
        kind: "extension",
        raw: ch,
        display: ch,
        consumesNoteSlot: true,
        inheritedTokenId: lastTokenId
      });
      i += 1;
      continue;
    }

    if (/\s/.test(ch)) {
      cells.push({
        id: nextCellId("cell"),
        kind: "space",
        raw: ch,
        display: ch,
        consumesNoteSlot: false
      });
      i += 1;
      continue;
    }

    if (isLatinOrNumber(ch)) {
      let j = i + ch.length;
      while (j < text.length) {
        const next = codePointAt(text, j);
        if (
          !next ||
          (!isLatinOrNumber(next) && !isLyricPunctuation(next))
        ) {
          break;
        }
        j += next.length;
      }
      const raw = text.slice(i, j);
      const tokenId = nextCellId("token");
      cells.push({
        id: nextCellId("cell"),
        kind: "syllable",
        raw,
        display: raw,
        consumesNoteSlot: true,
        normalizedText: raw,
        tokenId
      });
      lastTokenId = tokenId;
      i = j;
      continue;
    }

    if (isLyricPunctuation(ch) && appendToPreviousLyricCell(cells, ch)) {
      i += ch.length;
      continue;
    }

    const tokenId = nextCellId("token");
    cells.push({
      id: nextCellId("cell"),
      kind: "syllable",
      raw: ch,
      display: ch,
      consumesNoteSlot: true,
      normalizedText: ch,
      tokenId
    });
    lastTokenId = tokenId;
    i += 1;
  }

  return cells;
}

function codePointAt(text: string, index: number): string {
  const codePoint = text.codePointAt(index);
  return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
}

function isLatinOrNumber(value: string): boolean {
  return /^[\p{Script=Latin}\p{Number}]$/u.test(value);
}

function isLyricPunctuation(value: string): boolean {
  return /^\p{Punctuation}$/u.test(value) && value !== "/";
}

function appendToPreviousLyricCell(cells: LyricCell[], punctuation: string): boolean {
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const cell = cells[index]!;
    if (cell.kind === "separator") return false;
    if (!cell.consumesNoteSlot) continue;
    cell.raw += punctuation;
    cell.display += punctuation;
    if (cell.normalizedText !== undefined) {
      cell.normalizedText += punctuation;
    }
    return true;
  }
  return false;
}

export function normalizeLyricForNLP(cells: LyricCell[]): string {
  return cells
    .filter((cell) => cell.kind === "syllable" || cell.kind === "multiChar")
    .map((cell) => cell.normalizedText ?? cell.display)
    .join("");
}

function parseWordsPrefix(rawLine: string):
  | {
      track: number;
      repeat?: string;
      showNumber?: boolean;
      measure: number;
      note: number;
      trailing: string;
    }
  | null {
  const match = rawLine.match(
    /^W(\d+)(?:-([0-9]+))?(?:\((True|False)(?:,[^)]*)?\))?@(\d+),(\d+):(.*)$/i
  );
  if (!match) return null;
  return {
    track: Number(match[1]),
    repeat: match[2],
    showNumber: match[3] ? /^true$/i.test(match[3]) : undefined,
    measure: Number(match[4]),
    note: Number(match[5]),
    trailing: match[6] ?? ""
  };
}

function nextCellId(prefix: string): string {
  cellCounter += 1;
  return `${prefix}-${cellCounter}`;
}
