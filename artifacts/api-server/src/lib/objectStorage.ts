import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";
import { LANDING_MEDIA_MAX_BYTES } from "@workspace/shared";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/** App Storage client authenticated through Replit's sidecar. */
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

/**
 * Identify an image from its complete binary structure rather than trusting
 * the user-supplied Content-Type or the GCS metadata.  Requiring terminal
 * markers/chunk lengths also rejects the common "magic bytes + arbitrary
 * payload" polyglot trick.
 */
export function detectLandingImageMime(data: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (isPng(data)) return "image/png";
  if (isJpeg(data)) return "image/jpeg";
  if (isWebp(data)) return "image/webp";
  return null;
}

function isPng(data: Buffer): boolean {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 33 || !data.subarray(0, 8).equals(signature)) return false;
  let offset = 8;
  let hasHeader = false;
  let hasData = false;
  while (offset + 12 <= data.length) {
    const chunkLength = data.readUInt32BE(offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > data.length) return false;
    const chunkType = data.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "IHDR") {
      if (hasHeader || chunkLength !== 13) return false;
      hasHeader = true;
      if (data.readUInt32BE(offset + 8) === 0 || data.readUInt32BE(offset + 12) === 0) return false;
    } else if (chunkType === "IDAT") {
      hasData = true;
    } else if (chunkType === "IEND") {
      return hasHeader && hasData && chunkLength === 0 && chunkEnd === data.length;
    }
    offset = chunkEnd;
  }
  return false;
}

function isJpeg(data: Buffer): boolean {
  if (data.length < 12 || data[0] !== 0xff || data[1] !== 0xd8) return false;
  let offset = 2;
  let hasFrame = false;
  while (offset + 1 < data.length) {
    if (data[offset] !== 0xff) return false;
    while (offset < data.length && data[offset] === 0xff) offset++;
    if (offset >= data.length) return false;
    const marker = data[offset++]!;
    if (marker === 0xd9) return hasFrame && offset === data.length;
    if (marker === 0xda) {
      if (offset + 2 > data.length) return false;
      const segmentLength = data.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > data.length) return false;
      offset += segmentLength;
      // Entropy-coded data runs until the terminal EOI marker. Stuffed bytes
      // and restart markers are data, while any other marker is malformed for
      // this conservative validation path.
      while (offset + 1 < data.length) {
        if (data[offset] !== 0xff) {
          offset++;
          continue;
        }
        let markerOffset = offset + 1;
        while (markerOffset < data.length && data[markerOffset] === 0xff) markerOffset++;
        if (markerOffset >= data.length) return false;
        const entropyMarker = data[markerOffset]!;
        if (entropyMarker === 0x00 || (entropyMarker >= 0xd0 && entropyMarker <= 0xd7)) {
          offset = markerOffset + 1;
          continue;
        }
        if (entropyMarker === 0xd9) return hasFrame && markerOffset + 1 === data.length;
        return false;
      }
      return false;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return false;
    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) return false;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (segmentLength < 7 || data.readUInt16BE(offset + 3) === 0 || data.readUInt16BE(offset + 5) === 0) return false;
      hasFrame = true;
    }
    offset += segmentLength;
  }
  return false;
}

function isWebp(data: Buffer): boolean {
  if (
    data.length < 20 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WEBP" ||
    data.readUInt32LE(4) + 8 !== data.length
  ) return false;
  let offset = 12;
  let hasCodecChunk = false;
  while (offset + 8 <= data.length) {
    const chunkType = data.toString("ascii", offset, offset + 4);
    const chunkLength = data.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkLength + (chunkLength % 2);
    if (chunkEnd > data.length) return false;
    if ((chunkType === "VP8 " || chunkType === "VP8L" || chunkType === "VP8X") && chunkLength > 0) {
      hasCodecChunk = true;
    }
    offset = chunkEnd;
  }
  return hasCodecChunk && offset === data.length;
}

function parseBucketPath(path: string): { bucketName: string; objectName: string } {
  const parts = (path.startsWith("/") ? path : `/${path}`).split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1]!, objectName: parts.slice(2).join("/") };
}

function privateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
  return dir.replace(/\/$/, "");
}

function objectPathName(objectPath: string): "landing-media-staging" | "landing-media" {
  if (/^\/objects\/landing-media-staging\/[0-9a-f-]{36}$/.test(objectPath)) {
    return "landing-media-staging";
  }
  if (/^\/objects\/landing-media\/[0-9a-f-]{36}$/.test(objectPath)) {
    return "landing-media";
  }
  throw new ObjectNotFoundError();
}

function isStorageNotFoundError(error: unknown): boolean {
  if (error instanceof ObjectNotFoundError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string | number; statusCode?: number };
  return candidate.code === 404 || candidate.code === "404" || candidate.statusCode === 404;
}

function mediaStorageError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

async function signObjectUrl(
  bucketName: string,
  objectName: string,
  method: "PUT" | "DELETE",
): Promise<string> {
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign object URL (${response.status}).`);
  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("Storage returned no signed URL.");
  return body.signed_url;
}

export class ObjectStorageService {
  async createLandingMediaUploadUrl(): Promise<{ uploadUrl: string; objectPath: string }> {
    const id = randomUUID();
    const { bucketName, objectName } = parseBucketPath(`${privateDir()}/landing-media-staging/${id}`);
    return {
      uploadUrl: await signObjectUrl(bucketName, objectName, "PUT"),
      objectPath: `/objects/landing-media-staging/${id}`,
    };
  }

  async getObjectEntityFile(objectPath: string, generation?: string): Promise<File> {
    const objectNamePrefix = objectPathName(objectPath);
    const { bucketName, objectName } = parseBucketPath(`${privateDir()}/${objectNamePrefix}/${objectPath.split("/").pop()}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName, generation ? { generation } : undefined);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async inspectImage(objectPath: string): Promise<{ mimeType: string; sizeBytes: number; generation: string }> {
    let metadataFile: File;
    try {
      metadataFile = await this.getObjectEntityFile(objectPath);
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        throw mediaStorageError("MEDIA_FILE_NOT_FOUND", "The uploaded object does not exist.");
      }
      throw error;
    }
    let metadata: { generation?: string | number; size?: string | number };
    try {
      [metadata] = await metadataFile.getMetadata();
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        throw mediaStorageError("MEDIA_FILE_NOT_FOUND", "The uploaded object does not exist.");
      }
      throw error;
    }
    const generation = String(metadata.generation ?? "");
    if (!generation) {
      throw mediaStorageError("MEDIA_FILE_CHANGED", "The uploaded object has no stable generation.");
    }
    // Do not download through the unpinned handle. A still-valid signed PUT
    // can replace the staging path between metadata lookup and download.
    let pinnedFile: File;
    try {
      pinnedFile = await this.getObjectEntityFile(objectPath, generation);
      const [pinnedMetadata] = await pinnedFile.getMetadata();
      if (String(pinnedMetadata.generation ?? "") !== generation) {
        throw mediaStorageError("MEDIA_FILE_CHANGED", "The uploaded object changed during validation.");
      }
      const metadataSize = Number(pinnedMetadata.size ?? 0);
      if (!Number.isSafeInteger(metadataSize) || metadataSize <= 0 || metadataSize > LANDING_MEDIA_MAX_BYTES) {
        return { mimeType: "", sizeBytes: 0, generation };
      }
      const [contents] = await pinnedFile.download({ validation: false });
      if (contents.length !== metadataSize) {
        throw mediaStorageError("MEDIA_FILE_CHANGED", "The uploaded object changed during validation.");
      }
      const detectedMimeType = detectLandingImageMime(contents);
      return {
        mimeType: detectedMimeType ?? "",
        sizeBytes: contents.length,
        generation,
      };
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        throw mediaStorageError("MEDIA_FILE_CHANGED", "The uploaded object changed or disappeared during validation.");
      }
      throw error;
    }
  }

  async promoteLandingMediaObject(
    stagingPath: string,
    expectedMimeType?: string | null,
    expectedSizeBytes?: number | null,
  ): Promise<{ objectPath: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; sizeBytes: number }> {
    if (objectPathName(stagingPath) !== "landing-media-staging") {
      throw Object.assign(new Error("A staging object reference is required."), { code: "MEDIA_STAGING_REQUIRED" });
    }
    let inspected: { mimeType: string; sizeBytes: number; generation: string };
    try {
      inspected = await this.inspectImage(stagingPath);
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        throw mediaStorageError("MEDIA_FILE_NOT_FOUND", "The uploaded object does not exist.");
      }
      throw error;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(inspected.mimeType) ||
      inspected.sizeBytes <= 0 || inspected.sizeBytes > LANDING_MEDIA_MAX_BYTES) {
      throw Object.assign(new Error("The uploaded object is not a valid PNG, JPEG, or WebP image."), { code: "MEDIA_FILE_INVALID" });
    }
    if (expectedMimeType && expectedMimeType !== inspected.mimeType) {
      throw Object.assign(new Error("The declared MIME type does not match the image bytes."), { code: "MEDIA_MIME_MISMATCH" });
    }
    if (expectedSizeBytes && expectedSizeBytes !== inspected.sizeBytes) {
      throw Object.assign(new Error("The declared file size does not match the image bytes."), { code: "MEDIA_SIZE_MISMATCH" });
    }

    const finalId = randomUUID();
    const finalPath = `/objects/landing-media/${finalId}`;
    let source: File;
    try {
      source = await this.getObjectEntityFile(stagingPath, inspected.generation);
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        throw mediaStorageError("MEDIA_FILE_CHANGED", "The uploaded object changed or disappeared during promotion.");
      }
      throw error;
    }
    const { bucketName, objectName } = parseBucketPath(`${privateDir()}/landing-media/${finalId}`);
    const destination = objectStorageClient.bucket(bucketName).file(objectName);
    let copied = false;
    try {
      await source.copy(destination, {
        preconditionOpts: { ifGenerationMatch: 0 },
        contentType: inspected.mimeType,
        cacheControl: "no-store",
      });
      copied = true;
      await this.deleteObject(stagingPath);
      return {
        objectPath: finalPath,
        mimeType: inspected.mimeType as "image/png" | "image/jpeg" | "image/webp",
        sizeBytes: inspected.sizeBytes,
      };
    } catch (error) {
      if (copied) {
        try {
          await destination.delete({ ignoreNotFound: true });
        } catch {
          // The caller will log the promotion failure; never mask it with
          // cleanup failure.
        }
      }
      if (isStorageNotFoundError(error)) {
        throw mediaStorageError("MEDIA_FILE_CHANGED", "The uploaded object changed or disappeared during promotion.");
      }
      throw error;
    }
  }

  async deleteObject(objectPath: string): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath);
    await file.delete();
  }

  async streamObject(objectPath: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string; size: number }> {
    if (objectPathName(objectPath) !== "landing-media") throw new ObjectNotFoundError();
    const file = await this.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    return {
      stream: file.createReadStream(),
      contentType: String(metadata.contentType ?? "application/octet-stream"),
      size: Number(metadata.size ?? 0),
    };
  }
}
