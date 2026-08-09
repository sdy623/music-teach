import { describe, expect, it } from "vitest";
import { decodeJPWABC, decodeJPWABCWithInfo } from "../src/core/decode";

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return new Uint8Array(buffer).buffer;
}

describe("decodeJPWABC", () => {
  it("decodes UTF-16LE with BOM while preserving multilingual text", () => {
    const source = ".Title\nTitle = {さくら}\n.Voice\n1 2 3 |\n.Words\nW1@1,1:\nさーくら";
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, "utf16le")]);
    const decoded = decodeJPWABCWithInfo(toArrayBuffer(buffer));
    expect(decoded.encoding).toBe("utf-16le");
    expect(decoded.text).toContain("Title = {さくら}");
    expect(decoded.text).toContain("ー");
  });

  it("decodes UTF-16BE with BOM", () => {
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x2e, 0x00, 0x56, 0x00, 0x6f, 0x00, 0x69, 0x00, 0x63, 0x00, 0x65]);
    expect(decodeJPWABC(bytes.buffer)).toBe(".Voice");
  });
});
