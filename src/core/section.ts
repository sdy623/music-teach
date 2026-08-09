import type { Diagnostic, WithDiagnostics } from "./diagnostics";
import { error } from "./diagnostics";
import { stripConservativeComments } from "./comments";

export type SectionName =
  | "Options"
  | "Fonts"
  | "Title"
  | "Voice"
  | "Words"
  | "Attachments"
  | "Page";

export type SectionMap = Record<SectionName, string>;

const SECTION_NAMES: SectionName[] = [
  "Options",
  "Fonts",
  "Title",
  "Voice",
  "Words",
  "Attachments",
  "Page"
];

const SECTION_LOOKUP = new Map(SECTION_NAMES.map((name) => [name.toLowerCase(), name]));

export function splitSections(text: string): WithDiagnostics<SectionMap> {
  const stripped = stripConservativeComments(text);
  const diagnostics: Diagnostic[] = [...stripped.diagnostics];
  const sections = Object.fromEntries(SECTION_NAMES.map((name) => [name, ""])) as SectionMap;

  let current: SectionName | null = null;
  const lines = stripped.text.replace(/\r\n?/g, "\n").split("\n");

  for (const line of lines) {
    const maybeSection = parseSectionHeader(line);
    if (maybeSection) {
      current = maybeSection;
      continue;
    }
    if (current) {
      sections[current] += `${line}\n`;
    }
  }

  if (!sections.Voice.trim()) {
    diagnostics.push(error("MISSING_VOICE_SECTION", ".Voice section is required by JPW-ABC."));
  }

  return { value: sections, diagnostics };
}

function parseSectionHeader(line: string): SectionName | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(".")) return null;
  const rawName = trimmed.slice(1).trim().toLowerCase();
  return SECTION_LOOKUP.get(rawName) ?? null;
}

