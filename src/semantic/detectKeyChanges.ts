import type { AttachmentIR, TextAttachmentIR } from "../ir/attachment";
import type { KeyChangeEvent } from "../ir/semantic";

export function detectKeyChanges(attachments: AttachmentIR[]): KeyChangeEvent[] {
  const result: KeyChangeEvent[] = [];

  for (const attachment of attachments) {
    if (attachment.type !== "text") continue;
    const keyOfOne = extractKeyOfOne(attachment);
    if (!keyOfOne) continue;
    result.push({
      id: `key-change-${result.length + 1}`,
      source: "attachment-text",
      keyOfOne,
      anchor: attachment.anchor,
      display: attachment.contentDisplay
    });
  }

  return result;
}

function extractKeyOfOne(attachment: TextAttachmentIR): string | null {
  const normalized = attachment.contentDisplay.replace(/\s+/g, "");
  const match = normalized.match(/转1=([#b]?[A-G](?:[#b])?)/i);
  return match?.[1] ?? null;
}

