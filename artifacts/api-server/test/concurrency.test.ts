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

describe("concurrent duplicate submissions", () => {
  it("exactly one of many simultaneous creates with the same file number wins", async () => {
    const attempts = 8;
    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        agent.post("/api/patients").send({
          fileNumber: "RACE-100",
          fullName: `مريض متسابق ${i + 1}`,
        }),
      ),
    );

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(attempts - 1);
    for (const r of conflicts) {
      expect(r.body.code).toBe("DUPLICATE_ACTIVE");
      expect(r.body.patientId).toBe(created[0]!.body.patient.id);
    }

    const rows = await pool.query(
      "SELECT count(*)::int AS n FROM patients WHERE file_number = 'RACE-100'",
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it("concurrent file-number updates onto one target produce a single winner", async () => {
    const a = await agent.post("/api/patients").send({
      fileNumber: "RACE-200",
      fullName: "مريض أ",
    });
    const b = await agent.post("/api/patients").send({
      fileNumber: "RACE-201",
      fullName: "مريض ب",
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const [ra, rb] = await Promise.all([
      agent.patch(`/api/patients/${a.body.patient.id}`).send({ fileNumber: "RACE-300" }),
      agent.patch(`/api/patients/${b.body.patient.id}`).send({ fileNumber: "RACE-300" }),
    ]);

    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);

    const rows = await pool.query(
      "SELECT count(*)::int AS n FROM patients WHERE file_number = 'RACE-300'",
    );
    expect(rows.rows[0].n).toBe(1);
  });
});
