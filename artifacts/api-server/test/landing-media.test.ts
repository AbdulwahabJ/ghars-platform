import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import app from "../src/app";
import { detectLandingImageMime, objectStorageClient, ObjectStorageService } from "../src/lib/objectStorage";
import {
  ADMIN_PASSWORD,
  agentFor,
  freshAdminSession,
  login,
  makePool,
} from "./helpers";

const pool = makePool();
const HERO_ID = "00000000-0000-4000-8000-000000000001";
const GALLERY_IDS = Array.from({ length: 9 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
);
let platformAdmin: ReturnType<typeof agentFor>;
let clinicAdmin: ReturnType<typeof agentFor>;

async function resetLandingMedia(): Promise<void> {
  await pool.query("DELETE FROM landing_media WHERE id <> ALL($1::uuid[])", [
    [HERO_ID, ...GALLERY_IDS],
  ]);
  await pool.query(
    `UPDATE landing_media AS media
     SET is_active = false,
         media_type = CASE WHEN media.id = $2 THEN 'HERO' ELSE 'GALLERY' END
     WHERE media.id = ANY($1::uuid[])`,
    [[HERO_ID, ...GALLERY_IDS], HERO_ID],
  );
  await pool.query(
    `UPDATE landing_media AS media
     SET is_active = true,
         sort_order = CASE WHEN media.id = $2 THEN 0 ELSE positions.ordinality - 2 END
     FROM unnest($1::uuid[]) WITH ORDINALITY AS positions(id, ordinality)
     WHERE media.id = positions.id`,
    [[HERO_ID, ...GALLERY_IDS], HERO_ID],
  );
}

beforeAll(async () => {
  clinicAdmin = await freshAdminSession(app, pool);
  platformAdmin = agentFor(app);
  await login(platformAdmin, "platform-admin", ADMIN_PASSWORD);
});

beforeEach(resetLandingMedia);

afterAll(async () => {
  await pool.end();
});

describe("global landing media", () => {
  it("is public, returns active media only, and denies admin APIs to non-platform users", async () => {
    const publicBefore = await agentFor(app).get("/api/landing-media");
    expect(publicBefore.status).toBe(200);
    expect(publicBefore.body.hero.id).toBe(HERO_ID);
    expect(publicBefore.body.gallery).toHaveLength(9);

    await pool.query("UPDATE landing_media SET is_active = false WHERE id = $1", [GALLERY_IDS[0]]);
    const publicAfter = await agentFor(app).get("/api/landing-media");
    expect(publicAfter.body.gallery).toHaveLength(8);
    expect(publicAfter.body.gallery.some((item: { id: string }) => item.id === GALLERY_IDS[0])).toBe(false);

    expect((await agentFor(app).get("/api/platform-admin/landing-media")).status).toBe(401);
    expect((await clinicAdmin.get("/api/platform-admin/landing-media")).status).toBe(403);
    expect((await platformAdmin.get("/api/platform-admin/landing-media")).status).toBe(200);
    expect((await agentFor(app).get(`/api/platform-admin/landing-media/${HERO_ID}/file`)).status).toBe(401);
    expect((await clinicAdmin.get(`/api/platform-admin/landing-media/${HERO_ID}/file`)).status).toBe(403);
  });

  it("preserves ordering and enforces one active HERO", async () => {
    const orderedIds = [...GALLERY_IDS].reverse();
    const reordered = await platformAdmin.post("/api/platform-admin/landing-media/reorder").send({
      mediaType: "GALLERY",
      orderedIds,
    });
    expect(reordered.status).toBe(200);
    const publicMedia = await agentFor(app).get("/api/landing-media");
    expect(publicMedia.body.gallery.map((item: { id: string }) => item.id)).toEqual(orderedIds);

    const extraHeroId = "00000000-0000-4000-8000-0000000000f1";
    await pool.query(
      `INSERT INTO landing_media
       (id, title_ar, title_en, media_type, sort_order, is_active, source_type, file_ref)
       VALUES ($1, 'بطل إضافي', 'Extra hero', 'HERO', 1, false, 'STATIC', '/assets/dashboard.png')`,
      [extraHeroId],
    );
    const activated = await platformAdmin
      .post(`/api/platform-admin/landing-media/${extraHeroId}/status`)
      .send({ isActive: true });
    expect(activated.status).toBe(200);
    const [{ count }] = (await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM landing_media WHERE media_type = 'HERO' AND is_active = true",
    )).rows;
    expect(count).toBe("1");
    expect((await agentFor(app).get("/api/landing-media")).body.hero.id).toBe(extraHeroId);
  });

  it("allows presentation placement PATCHes while preserving the active HERO invariant", async () => {
    const response = await platformAdmin.patch(`/api/platform-admin/landing-media/${GALLERY_IDS[0]}`).send({
      mediaType: "HERO",
      sortOrder: 42,
    });
    expect(response.status).toBe(200);
    expect(response.body.media.mediaType).toBe("HERO");
    expect(response.body.media.sortOrder).toBe(42);
    const [{ is_active: previousHeroActive }] = (await pool.query<{ is_active: boolean }>(
      "SELECT is_active FROM landing_media WHERE id = $1",
      [HERO_ID],
    )).rows;
    expect(previousHeroActive).toBe(false);
  });

  it("rejects invalid MIME, oversized uploads, malformed objects, and admin static paths", async () => {
    expect((await platformAdmin.post("/api/platform-admin/landing-media/upload-url").send({
      name: "x.gif", size: 100, contentType: "image/gif",
    })).status).toBe(400);
    expect((await platformAdmin.post("/api/platform-admin/landing-media/upload-url").send({
      name: "x.png", size: 10 * 1024 * 1024 + 1, contentType: "image/png",
    })).status).toBe(400);
    expect((await platformAdmin.post("/api/platform-admin/landing-media").send({
      titleAr: "صورة", titleEn: "Image", mediaType: "GALLERY", sourceType: "OBJECT",
      fileRef: "/objects/landing-media-staging/not-a-uuid",
    })).status).toBe(400);
    const staticCreate = await platformAdmin.post("/api/platform-admin/landing-media").send({
      titleAr: "ثابت", titleEn: "Static", mediaType: "GALLERY", sourceType: "STATIC",
      fileRef: "/arbitrary/private/path.png",
    });
    expect(staticCreate.status).toBe(400);
    const attemptedFilePatch = await platformAdmin.patch(`/api/platform-admin/landing-media/${HERO_ID}`).send({
      fileRef: "/objects/landing-media-staging/00000000-0000-4000-8000-0000000000f6",
    });
    expect(attemptedFilePatch.status).toBe(400);
  });

  it("rejects header-only and trailing-payload image spoofing", () => {
    const pngHeaderOnly = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);
    expect(detectLandingImageMime(pngHeaderOnly)).toBeNull();
    expect(detectLandingImageMime(Buffer.from([
      0xff, 0xd8, 0xff, 0xd9,
    ]))).toBeNull();
    expect(detectLandingImageMime(Buffer.from("RIFF\x00\x00\x00\x00WEBPnot-webp"))).toBeNull();
  });

  it("pins inspection download and promotion to the inspected generation", async () => {
    const previousPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = "/unit-test-bucket";
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const initialFile = {
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([{ generation: "123", size: String(png.length) }]),
      download: vi.fn(),
    };
    const pinnedFile = {
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([{ generation: "123", size: String(png.length) }]),
      download: vi.fn().mockResolvedValue([png]),
      copy: vi.fn().mockResolvedValue([]),
    };
    const cleanupFile = {
      exists: vi.fn().mockResolvedValue([true]),
      delete: vi.fn().mockResolvedValue([]),
    };
    const destination = { delete: vi.fn().mockResolvedValue([]) };
    let unpinnedStagingLookups = 0;
    const fileLookup = vi.fn((name: string, options?: { generation?: string }) => {
      if (name.startsWith("landing-media-staging/")) {
        if (options?.generation === "123") return pinnedFile as never;
        unpinnedStagingLookups += 1;
        return (unpinnedStagingLookups === 1 ? initialFile : cleanupFile) as never;
      }
      return destination as never;
    });
    const bucketSpy = vi.spyOn(objectStorageClient, "bucket").mockReturnValue({
      file: fileLookup,
    } as never);
    try {
      const result = await new ObjectStorageService().promoteLandingMediaObject(
        "/objects/landing-media-staging/00000000-0000-4000-8000-000000000123",
        "image/png",
        png.length,
      );
      expect(initialFile.download).not.toHaveBeenCalled();
      expect(pinnedFile.download).toHaveBeenCalledOnce();
      expect(fileLookup).toHaveBeenCalledWith(
        "landing-media-staging/00000000-0000-4000-8000-000000000123",
        { generation: "123" },
      );
      expect(pinnedFile.copy).toHaveBeenCalledWith(
        destination,
        expect.objectContaining({
          contentType: "image/png",
          preconditionOpts: { ifGenerationMatch: 0 },
        }),
      );
      expect(result.mimeType).toBe("image/png");
    } finally {
      bucketSpy.mockRestore();
      if (previousPrivateDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
      else process.env.PRIVATE_OBJECT_DIR = previousPrivateDir;
    }
  });

  it("never asks object storage to delete bundled/static media", async () => {
    const id = "00000000-0000-4000-8000-0000000000f2";
    await pool.query(
      `INSERT INTO landing_media
       (id, title_ar, title_en, media_type, sort_order, is_active, source_type, file_ref)
       VALUES ($1, 'ثابت', 'Static', 'GALLERY', 99, true, 'STATIC', '/assets/dashboard.png')`,
      [id],
    );
    const deleteSpy = vi.spyOn(ObjectStorageService.prototype, "deleteObject");
    const response = await platformAdmin.delete(`/api/platform-admin/landing-media/${id}`);
    expect(response.status).toBe(204);
    expect(deleteSpy).not.toHaveBeenCalled();
    deleteSpy.mockRestore();
  });

  it("serves the stored row MIME with non-cacheable preview/public headers", async () => {
    const id = "00000000-0000-4000-8000-0000000000f6";
    const objectRef = "/objects/landing-media/00000000-0000-4000-8000-0000000000f7";
    await pool.query(
      `INSERT INTO landing_media
       (id, title_ar, title_en, media_type, sort_order, is_active, source_type, file_ref, mime_type, size_bytes)
       VALUES ($1, 'كائن', 'Object', 'GALLERY', 99, false, 'OBJECT', $2, 'image/png', 1)`,
      [id, objectRef],
    );
    const streamSpy = vi.spyOn(ObjectStorageService.prototype, "streamObject").mockImplementation(async () => ({
      stream: Readable.from(Buffer.from("x")),
      // Deliberately differs: routes must serve row.mimeType, not mutable GCS metadata.
      contentType: "image/jpeg",
      size: 1,
    }));
    const adminResponse = await platformAdmin.get(`/api/platform-admin/landing-media/${id}/file`);
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.headers["content-type"]).toMatch(/^image\/png/);
    expect(adminResponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(adminResponse.headers["cache-control"]).toBe("private, no-store");

    await pool.query("UPDATE landing_media SET is_active = true WHERE id = $1", [id]);
    const publicResponse = await agentFor(app).get(`/api/landing-media/${id}/file`);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers["content-type"]).toMatch(/^image\/png/);
    expect(publicResponse.headers["cache-control"]).toBe("no-store");
    expect(publicResponse.headers["x-content-type-options"]).toBe("nosniff");
    streamSpy.mockRestore();
  });

  it("enforces one-record object ownership and safely deletes the final object", async () => {
    const firstId = "00000000-0000-4000-8000-0000000000f3";
    const secondId = "00000000-0000-4000-8000-0000000000f4";
    const objectRef = "/objects/landing-media/00000000-0000-4000-8000-0000000000f5";
    await pool.query(
      `INSERT INTO landing_media
       (id, title_ar, title_en, media_type, sort_order, is_active, source_type, file_ref)
       VALUES ($1, 'كائن 1', 'Object 1', 'GALLERY', 99, true, 'OBJECT', $2)`,
      [firstId, objectRef],
    );
    await expect(pool.query(
      `INSERT INTO landing_media
       (id, title_ar, title_en, media_type, sort_order, is_active, source_type, file_ref)
       VALUES ($1, 'كائن 2', 'Object 2', 'GALLERY', 100, true, 'OBJECT', $2)`,
      [secondId, objectRef],
    )).rejects.toMatchObject({ code: "23505" });
    const deleteSpy = vi
      .spyOn(ObjectStorageService.prototype, "deleteObject")
      .mockResolvedValue(undefined);
    expect((await platformAdmin.delete(`/api/platform-admin/landing-media/${firstId}`)).status).toBe(204);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith(objectRef);
    deleteSpy.mockRestore();
  });
});