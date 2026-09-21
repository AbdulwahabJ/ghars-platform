import { describe, expect, it } from "vitest";
import { detectPatientAttachmentMime } from "../src/lib/objectStorage";

function png(): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "ascii");
    body.copy(out, 8);
    // CRC is deliberately not trusted by the validator.
    out.writeUInt32BE(0, 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", Buffer.from([0])), chunk("IEND", Buffer.alloc(0))]);
}

function jpeg(): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0, 0]);
  const sos = Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, Buffer.from([0, 0xff, 0xd9])]);
}

function webp(): Buffer {
  const body = Buffer.from("VP8 ", "ascii");
  const chunk = Buffer.concat([body, Buffer.from([1, 0, 0, 0, 0, 0])]);
  const out = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), chunk]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

describe("patient attachment binary validation", () => {
  it.each([
    [jpeg(), "image/jpeg"],
    [png(), "image/png"],
    [webp(), "image/webp"],
    [Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n9\n%%EOF\n"), "application/pdf"],
  ])("accepts a complete %s", (data, mime) => {
    expect(detectPatientAttachmentMime(data)).toBe(mime);
  });

  it.each([
    [jpeg().subarray(0, -1), "truncated JPEG"],
    [png().subarray(0, -1), "truncated PNG"],
    [webp().subarray(0, -1), "truncated WebP"],
    [Buffer.from("%PDF-1.7\nnot finished"), "truncated PDF"],
    [Buffer.from("MZ" + "x".repeat(100)), "executable"],
    [Buffer.from("not an image or document"), "spoofed content"],
  ])("rejects %s", (data) => {
    expect(detectPatientAttachmentMime(data)).toBeNull();
  });
});