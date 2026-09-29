import type { Express } from "express";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ADMIN_PASSWORD, agentFor, makePool, setupAdmin, truncateAll } from "./helpers";

const pool = makePool();
let app: Express;

beforeAll(async () => {
  // Only the disposable test database uses the short lifetime. Production
  // keeps the existing 12-hour rolling HttpOnly cookie.
  process.env.TEST_SESSION_MAX_AGE_MS = "1600";
  ({ default: app } = await import("../src/app"));
  await truncateAll(pool);
  await setupAdmin(agentFor(app));
});

afterAll(async () => {
  delete process.env.TEST_SESSION_MAX_AGE_MS;
  await pool.end();
});

it("rolls an active session and expires it after the tab has been idle", async () => {
  const agent = agentFor(app);
  const login = await agent.post("/api/auth/login").send({
    username: "admin",
    password: ADMIN_PASSWORD,
  });
  expect(login.status).toBe(200);
  expect((await agent.get("/api/auth/me")).status).toBe(200);

  await new Promise((resolve) => setTimeout(resolve, 700));
  const active = await agent.get("/api/auth/me");
  expect(active.status).toBe(200);
  expect(active.headers["set-cookie"]?.join(";")).toContain("HttpOnly");

  await new Promise((resolve) => setTimeout(resolve, 1900));
  const expired = await agent.get("/api/auth/me");
  expect(expired.status).toBe(401);
  expect(expired.body.code).toBe("UNAUTHENTICATED");
  expect((await agent.get("/api/notifications")).status).toBe(401);
});