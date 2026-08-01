import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { freshAdminSession, makePool, type TestAgent } from "./helpers";

const pool = makePool();
let agent: TestAgent;

beforeAll(async () => {
  agent = await freshAdminSession(app, pool);
});

afterAll(async () => {
  await pool.end();
});

const PATIENT = { fileNumber: "CSRF-1", fullName: "مريض تجريبي" };

describe("CSRF origin validation", () => {
  it("rejects a state-changing request with a cross-site Origin", async () => {
    const res = await agent
      .post("/api/patients")
      .set("Origin", "https://evil.example.com")
      .send(PATIENT);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
  });

  it("rejects a state-changing request with a cross-site Referer", async () => {
    const res = await agent
      .post("/api/patients")
      .set("Referer", "https://evil.example.com/page")
      .send(PATIENT);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
  });

  it("accepts a matching Origin (X-Forwarded-Host aware)", async () => {
    const res = await agent
      .post("/api/patients")
      .set("X-Forwarded-Host", "clinic.example.com")
      .set("Origin", "https://clinic.example.com")
      .send({ fileNumber: "CSRF-2", fullName: "مريض تجريبي" });
    expect(res.status).toBe(201);
  });

  it("does not block safe methods regardless of Origin", async () => {
    const res = await agent
      .get("/api/patients")
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(200);
  });

  it("allows requests without Origin/Referer (non-browser clients)", async () => {
    const res = await agent
      .post("/api/patients")
      .send({ fileNumber: "CSRF-3", fullName: "مريض تجريبي" });
    expect(res.status).toBe(201);
  });
});
