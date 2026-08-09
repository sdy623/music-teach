export type AttachmentAnchor =
  | { kind: "measure-note"; measure: number; note: number }
  | { kind: "return-or-row"; raw: string }
  | { kind: "absolute-symbol-index"; index: number }
  | { kind: "unknown"; raw: string };

export interface TextAttachmentIR {
  id: string;
  type: "text";
  anchor: AttachmentAnchor;
  dx: number;
  dy: number;
  fontRef: string;
  contentRaw: string;
  contentDisplay: string;
  scaleX: number;
  scaleY: number;
  occupyRaw?: string;
}

export interface UnknownAttachmentIR {
  id: string;
  type: "unknown";
  raw: string;
}

export type AttachmentIR = TextAttachmentIR | UnknownAttachmentIR;

