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

describe("onboarding preferences persistence", () => {
  it("starts as not_started", async () => {
    const me = await agent.get("/api/auth/me");
    expect(me.body.preferences.onboardingStatus).toBe("not_started");
  });

  it("persists completed with a timestamp and audits the change", async () => {
    const res = await agent
      .patch("/api/preferences")
      .send({ onboardingStatus: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.preferences.onboardingStatus).toBe("completed");
    expect(res.body.preferences.onboardingCompletedAt).not.toBeNull();

    const me = await agent.get("/api/auth/me");
    expect(me.body.preferences.onboardingStatus).toBe("completed");

    const audit = await pool.query(
      "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'onboarding_status_change'",
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("persists skipped with its own timestamp", async () => {
    const res = await agent
      .patch("/api/preferences")
      .send({ onboardingStatus: "skipped" });
    expect(res.status).toBe(200);
    expect(res.body.preferences.onboardingStatus).toBe("skipped");
    expect(res.body.preferences.onboardingSkippedAt).not.toBeNull();
  });

  it("rejects invalid statuses", async () => {
    const res = await agent
      .patch("/api/preferences")
      .send({ onboardingStatus: "finished" });
    expect(res.status).toBe(400);
  });
});
