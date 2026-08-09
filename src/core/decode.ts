export type JPWABCEncoding = "utf-8" | "utf-16le" | "utf-16be";

export interface DecodeResult {
  text: string;
  encoding: JPWABCEncoding;
  hadBom: boolean;
}

export function decodeJPWABC(buffer: ArrayBuffer): string {
  return decodeJPWABCWithInfo(buffer).text;
}

export function decodeJPWABCWithInfo(buffer: ArrayBuffer): DecodeResult {
  const bytes = new Uint8Array(buffer);
  const b0 = bytes[0];
  const b1 = bytes[1];

  if (b0 === 0xff && b1 === 0xfe) {
    return {
      text: stripBom(new TextDecoder("utf-16le").decode(bytes)),
      encoding: "utf-16le",
      hadBom: true
    };
  }

  if (b0 === 0xfe && b1 === 0xff) {
    return {
      text: stripBom(decodeUtf16BE(bytes)),
      encoding: "utf-16be",
      hadBom: true
    };
  }

  return {
    text: stripBom(new TextDecoder("utf-8").decode(bytes)),
    encoding: "utf-8",
    hadBom: false
  };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function decodeUtf16BE(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-16be").decode(bytes);
  } catch {
    const swapped = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 2) {
      swapped[i] = bytes[i + 1] ?? 0;
      swapped[i + 1] = bytes[i] ?? 0;
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
}

