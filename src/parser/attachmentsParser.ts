import type { Diagnostic, WithDiagnostics } from "../core/diagnostics";
import { warning } from "../core/diagnostics";
import type { AttachmentAnchor, AttachmentIR, TextAttachmentIR } from "../ir/attachment";

let attachmentCounter = 0;

export function parseAttachments(src: string): WithDiagnostics<AttachmentIR[]> {
  attachmentCounter = 0;
  const attachments: AttachmentIR[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const rawLine of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    const eq = rawLine.indexOf("=");
    if (eq < 0) {
      attachments.push({ id: nextAttachmentId("unknown"), type: "unknown", raw: rawLine });
      diagnostics.push(warning("ATTACHMENT_NO_EQUALS", "Kept attachment line without '=' as unknown.", rawLine));
      continue;
    }

    const left = rawLine.slice(0, eq).trim();
    const right = rawLine.slice(eq + 1).trim();
    const parsedLeft = parseAttachmentLeft(left);
    if (!parsedLeft || parsedLeft.type.toLowerCase() !== "text") {
      attachments.push({ id: nextAttachmentId("unknown"), type: "unknown", raw: rawLine });
      diagnostics.push(warning("ATTACHMENT_UNSUPPORTED", "Only Text attachments are rendered in this version.", rawLine));
      continue;
    }

    attachments.push(parseTextAttachment(parsedLeft.anchorRaw, parsedLeft.dx, parsedLeft.dy, right));
  }

  return { value: attachments, diagnostics };
}

export function normalizeJPWBraceText(text: string): string {
  return text.replace(/\{([0-9](?:=[^{}]+|\/[0-9]+))\}/g, "$1");
}

function parseAttachmentLeft(left: string): { type: string; anchorRaw: string; dx: number; dy: number } | null {
  const match = left.match(/^([A-Za-z]+)(@{1,2}[^()]+)\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)$/);
  if (!match) return null;
  return {
    type: match[1],
    anchorRaw: match[2],
    dx: Number(match[3]),
    dy: Number(match[4])
  };
}

function parseTextAttachment(anchorRaw: string, dx: number, dy: number, right: string): TextAttachmentIR {
  const parts = splitTopLevelCommas(right);
  const transform = parts.find((part) => /^\{.*\}$/.test(part.trim()));
  const occupy = parts.find((part) => /^\[.*\]$/.test(part.trim()));
  const transformValues = transform ? transform.replace(/[{}]/g, "").split(",").map((part) => part.trim()) : [];
  const contentParts = parts.slice(1).filter((part) => part !== transform && part !== occupy);
  const contentRaw = contentParts.join(", ").trim();

  return {
    id: nextAttachmentId("text"),
    type: "text",
    anchor: parseAttachmentAnchor(anchorRaw),
    dx,
    dy,
    fontRef: parts[0]?.trim() || "Default",
    contentRaw,
    contentDisplay: normalizeJPWBraceText(contentRaw),
    scaleX: Number(transformValues[0]) || 1,
    scaleY: Number(transformValues[1]) || 1,
    occupyRaw: occupy
  };
}

function parseAttachmentAnchor(raw: string): AttachmentAnchor {
  if (raw.startsWith("@@")) {
    const index = Number(raw.slice(2));
    return Number.isFinite(index) ? { kind: "absolute-symbol-index", index } : { kind: "unknown", raw };
  }

  const body = raw.startsWith("@") ? raw.slice(1) : raw;
  const measureNote = body.match(/^(\d+),(\d+)$/);
  if (measureNote) {
    return { kind: "measure-note", measure: Number(measureNote[1]), note: Number(measureNote[2]) };
  }
  if (/^\d+R$/i.test(body)) {
    return { kind: "return-or-row", raw: body };
  }
  return { kind: "unknown", raw };
}

function splitTopLevelCommas(src: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "," && braceDepth === 0 && bracketDepth === 0) {
      parts.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(src.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

function nextAttachmentId(prefix: string): string {
  attachmentCounter += 1;
  return `${prefix}-attachment-${attachmentCounter}`;
}

