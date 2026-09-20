import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { freshAdminSession, makePool, type TestAgent } from "./helpers";

const pool = makePool();
let admin: TestAgent;

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  await pool.query(
    `INSERT INTO platform_settings (id, legacy_import_enabled, updated_at)
     VALUES ('global', false, now())
     ON CONFLICT (id) DO UPDATE SET legacy_import_enabled = false, updated_at = now()`,
  );
});

afterAll(async () => pool.end());

describe("mounted legacy import feature gate", () => {
  it("rejects every importer operation before route validation or database writes", async () => {
    const before = await pool.query<{ count: string }>(
      "SELECT count(*) FROM import_batches",
    );
    const requests = [
      admin.get("/api/admin/import/template/patients.csv"),
      admin.get("/api/admin/import/universal/current"),
      admin.get("/api/admin/import/universal/not-a-batch"),
      admin.post("/api/admin/import/preview").send({}),
      admin.post("/api/admin/import/commit").send({}),
      admin.post("/api/admin/import/universal/analyze").send({}),
      admin.patch("/api/admin/import/universal/not-a-batch/mapping").send({}),
      admin.post("/api/admin/import/universal/not-a-batch/commit").send({}),
      admin.post("/api/admin/import/universal/not-a-batch/rollback").send({}),
    ];
    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FEATURE_DISABLED");
    }
    const after = await pool.query<{ count: string }>(
      "SELECT count(*) FROM import_batches",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});