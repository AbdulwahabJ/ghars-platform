import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import app from "../src/app";
import { csvEscape } from "../src/lib/csv";
import {
  agentFor,
  attachUserToInternalTenant,
  freshAdminSession,
  login,
  makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
let admin: TestAgent;
let assistant: TestAgent;
let adminId: string;

const ASSISTANT_PASSWORD = "Adm1nTestPass99";

function binaryParser(
  response: IncomingMessage,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error) => callback(error, Buffer.alloc(0)));
}

function packageWithCentralEntry(name: string, uncompressed = 1): Buffer {
  const nameBuffer = Buffer.from(name);
  const central = Buffer.alloc(46 + nameBuffer.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 8);
  central.writeUInt32LE(0, 20);
  central.writeUInt32LE(1, 24);
  central.writeUInt32LE(uncompressed, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  nameBuffer.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(4, 16);
  return Buffer.concat([Buffer.from("PK\x03\x04"), central, eocd]);
}

async function seedAssistant(username: string): Promise<TestAgent> {
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ASSISTANT')`,
    [username, bcrypt.hashSync(ASSISTANT_PASSWORD, 10), `مساعد ${username}`],
  );
  await attachUserToInternalTenant(pool, username, "ASSISTANT");
  const agent = agentFor(app);
  await login(agent, username, ASSISTANT_PASSWORD);
  return agent;
}

/** Seed a patient + case, returning ids. */
async function seedPatientWithCase(
  fileNumber: string,
  procedureDate: string,
): Promise<{ patientId: string; caseId: string }> {
  const p = await admin.post("/api/patients").send({
    fileNumber,
    fullName: `مريض ${fileNumber}`,
  });
  expect(p.status).toBe(201);
  const patientId = p.body.patient.id;
  const c = await admin
    .post(`/api/patients/${patientId}/implant-cases`)
    .send({ procedureDate, treatingDoctor: "د. همام" });
  expect(c.status).toBe(201);
  return { patientId, caseId: c.body.case.id };
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  const me = await admin.get("/api/auth/me");
  adminId = me.body.user.id;
  assistant = await seedAssistant("admin-suite-assistant");
});

afterAll(async () => {
  await pool.end();
});

/* ------------------------------------------------------------------ */
/* Access control                                                      */
/* ------------------------------------------------------------------ */

describe("admin access control", () => {
  it("blocks non-admins from every admin endpoint", async () => {
    const endpoints: ["get" | "post" | "patch", string][] = [
      ["get", "/api/admin/users"],
      ["post", "/api/admin/users"],
      ["get", "/api/admin/lookups"],
      ["get", "/api/admin/whatsapp-templates"],
      ["get", "/api/admin/audit-logs"],
      ["get", "/api/admin/audit-logs/export.csv"],
      ["get", "/api/admin/audit-logs/export.pdf"],
      ["get", "/api/admin/audit-logs/export.xlsx"],
      ["post", "/api/admin/import/preview"],
      ["post", "/api/admin/import/commit"],
      ["get", "/api/admin/export/patients.csv"],
      ["get", "/api/admin/export/patients.pdf"],
      ["get", "/api/admin/export/patients.xlsx"],
      ["patch", "/api/admin/settings"],
    ];
    for (const [method, url] of endpoints) {
      const res = await assistant[method](url).send({});
      expect(res.status, `${method} ${url}`).toBe(403);
    }
  });

  it("allows any authenticated user to read settings", async () => {
    const res = await assistant.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.settings.clinicName).toBe("مجمع السن الرقمي الطبي");
  });
});

/* ------------------------------------------------------------------ */
/* User management                                                     */
/* ------------------------------------------------------------------ */

describe("user management", () => {
  it("creates a user, rejects duplicates, and lists it", async () => {
    const created = await admin.post("/api/admin/users").send({
      username: "doctor.new",
      email: "doctor.new@example.test",
      fullName: "طبيب جديد",
      role: "DOCTOR",
      password: "Doct0rPass1234",
    });
    expect(created.status).toBe(201);
    expect(created.body.user.email).toBe("doctor.new@example.test");
    expect(created.body.user.canViewFinancials).toBe(false);

    const clearEmail = await admin
      .patch(`/api/admin/users/${created.body.user.id}`)
      .send({ email: null });
    expect(clearEmail.status).toBe(422);
    expect(clearEmail.body.code).toBe("EMAIL_REQUIRED");

    const dup = await admin.post("/api/admin/users").send({
      username: "doctor.new",
      email: "doctor.new@example.test",
      fullName: "طبيب مكرر",
      role: "DOCTOR",
      password: "Doct0rPass1234",
    });
    expect(dup.status).toBe(409);

    const list = await admin.get("/api/admin/users");
    expect(list.status).toBe(200);
    expect(
      list.body.users.some((u: { username: string }) => u.username === "doctor.new"),
    ).toBe(true);
  });

  it("rejects weak passwords", async () => {
    const res = await admin.post("/api/admin/users").send({
      username: "weak.pass",
      fullName: "مستخدم ضعيف",
      role: "ASSISTANT",
      password: "short",
    });
    expect(res.status).toBe(400);
  });

  it("updates permission overrides and they take effect immediately", async () => {
    const created = await admin.post("/api/admin/users").send({
      username: "perm.assist",
      email: "perm.assist@example.test",
      fullName: "مساعد صلاحيات",
      role: "ASSISTANT",
      password: "Ass1stPass1234",
    });
    const userId = created.body.user.id;
    const agent = agentFor(app);
    await login(agent, "perm.assist", "Ass1stPass1234");

    // Role default: cannot record payments.
    const meBefore = await agent.get("/api/auth/me");
    expect(meBefore.body.user.canRecordPayments).toBe(false);

    const patch = await admin
      .patch(`/api/admin/users/${userId}`)
      .send({ canRecordPayments: true });
    expect(patch.status).toBe(200);
    expect(patch.body.user.canRecordPayments).toBe(true);

    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.body.user.canRecordPayments).toBe(true);
  });

  it("deactivation invalidates sessions but keeps historical records visible", async () => {
    const created = await admin.post("/api/admin/users").send({
      username: "leaving.user",
      email: "leaving.user@example.test",
      fullName: "مستخدم مغادر",
      role: "ASSISTANT",
      password: "Leav1ngPass1234",
    });
    const userId = created.body.user.id;
    const agent = agentFor(app);
    await login(agent, "leaving.user", "Leav1ngPass1234");

    // The user creates a patient (a historical record referencing them).
    const p = await agent.post("/api/patients").send({
      fileNumber: "9901",
      fullName: "مريض المستخدم المغادر",
    });
    expect(p.status).toBe(201);
    const patientId = p.body.patient.id;

    const deact = await admin.post(`/api/admin/users/${userId}/deactivate`);
    expect(deact.status).toBe(200);
    expect(deact.body.user.isActive).toBe(false);

    // Existing session is dead immediately.
    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.status).toBe(401);
    // Login refused.
    const relogin = await agentFor(app)
      .post("/api/auth/login")
      .send({ username: "leaving.user", password: "Leav1ngPass1234" });
    expect(relogin.status).toBe(403);
    expect(relogin.body.code).toBe("TENANT_ACCESS_REQUIRED");
    // Historical record still visible.
    const patient = await admin.get(`/api/patients/${patientId}`);
    expect(patient.status).toBe(200);

    // Reactivation restores access.
    const react = await admin.post(`/api/admin/users/${userId}/activate`);
    expect(react.status).toBe(200);
    const agent2 = agentFor(app);
    await login(agent2, "leaving.user", "Leav1ngPass1234");
  });

  it("blocks self-deactivation and last-admin lockout", async () => {
    const self = await admin.post(`/api/admin/users/${adminId}/deactivate`);
    expect(self.status).toBe(422);
    const demote = await admin
      .patch(`/api/admin/users/${adminId}`)
      .send({ role: "DOCTOR" });
    expect(demote.status).toBe(422);
  });

  it("resets passwords and invalidates the target's sessions", async () => {
    const created = await admin.post("/api/admin/users").send({
      username: "reset.target",
      email: "reset.target@example.test",
      fullName: "مستخدم إعادة تعيين",
      role: "ASSISTANT",
      password: "Or1ginalPass1234",
    });
    const userId = created.body.user.id;
    const agent = agentFor(app);
    await login(agent, "reset.target", "Or1ginalPass1234");

    const reset = await admin
      .post(`/api/admin/users/${userId}/reset-password`)
      .send({ password: "N3wSecretPass1234" });
    expect(reset.status).toBe(200);
    expect(reset.body.temporaryPassword).toBe("N3wSecretPass1234");

    expect((await agent.get("/api/auth/me")).status).toBe(401);
    const old = await agentFor(app)
      .post("/api/auth/login")
      .send({ username: "reset.target", password: "Or1ginalPass1234" });
    expect(old.status).toBe(401);
    const fresh = agentFor(app);
    await login(fresh, "reset.target", "N3wSecretPass1234");
    expect((await fresh.get("/api/auth/me")).body.user.mustChangePassword).toBe(true);
    expect((await fresh.post("/api/auth/forced-password-change").send({
      password: "Private0Password1234",
    })).status).toBe(204);
  });

  it("records last login time", async () => {
    const list = await admin.get("/api/admin/users");
    const me = list.body.users.find(
      (u: { username: string; lastLoginAt: string | null }) =>
        u.username === "admin",
    );
    expect(me.lastLoginAt).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

describe("application settings", () => {
  it("updates settings and serves them to all users", async () => {
    const patch = await admin.patch("/api/admin/settings").send({
      clinicPhone: "0112345678",
      defaultProsValue: "3 أشهر",
    });
    expect(patch.status).toBe(200);
    expect(patch.body.settings.clinicPhone).toBe("0112345678");

    const seen = await assistant.get("/api/settings");
    expect(seen.body.settings.defaultProsValue).toBe("3 أشهر");
  });

  it("accepts clearing an optional setting back to null", async () => {
    const patch = await admin.patch("/api/admin/settings").send({
      clinicPhone: null,
      defaultProsValue: null,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.settings.clinicPhone).toBeNull();
    expect(patch.body.settings.defaultProsValue).toBeNull();
  });

  it("rejects a non-image logo payload", async () => {
    const res = await admin.patch("/api/admin/settings").send({
      clinicLogo: "data:text/html;base64,PHNjcmlwdD4=",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown default assignee", async () => {
    const res = await admin.patch("/api/admin/settings").send({
      defaultFollowupAssigneeUserId: "00000000-0000-4000-8000-000000000000",
    });
    expect(res.status).toBe(422);
  });
});

/* ------------------------------------------------------------------ */
/* Lookup management                                                   */
/* ------------------------------------------------------------------ */

describe("lookup management", () => {
  let optionId: string;

  it("adds, renames, deactivates and reactivates an option", async () => {
    const created = await admin.post("/api/admin/lookups").send({
      category: "implant_system",
      value: "نظام اختبار",
    });
    expect(created.status).toBe(201);
    optionId = created.body.option.id;

    const dup = await admin.post("/api/admin/lookups").send({
      category: "implant_system",
      value: "نظام اختبار",
    });
    expect(dup.status).toBe(409);

    const renamed = await admin
      .patch(`/api/admin/lookups/implant_system/${optionId}`)
      .send({ value: "نظام اختبار معدل" });
    expect(renamed.status).toBe(204);

    const deact = await admin.post(
      `/api/admin/lookups/implant_system/${optionId}/deactivate`,
    );
    expect(deact.status).toBe(204);

    // Deactivated options disappear from the user-facing options endpoint.
    const options = await admin.get("/api/implant-options");
    expect(options.body.implantSystems ?? options.body.systems ?? []).not.toContain(
      "نظام اختبار معدل",
    );

    const react = await admin.post(
      `/api/admin/lookups/implant_system/${optionId}/activate`,
    );
    expect(react.status).toBe(204);
  });

  it("deletes unreferenced options but blocks referenced ones", async () => {
    // Unreferenced: delete succeeds.
    const created = await admin.post("/api/admin/lookups").send({
      category: "q_value",
      value: "Q-حذف",
    });
    const freeId = created.body.option.id;
    const del = await admin.delete(`/api/admin/lookups/q_value/${freeId}`);
    expect(del.status).toBe(204);

    // Referenced: create an implant that uses the value, then try delete.
    const { caseId } = await seedPatientWithCase("9902", "2024-03-01");
    const refOpt = await admin.post("/api/admin/lookups").send({
      category: "q_value",
      value: "Q-مستخدم",
    });
    const refId = refOpt.body.option.id;
    const implant = await admin
      .post(`/api/implant-cases/${caseId}/implants`)
      .send({ site: "36", qValue: "Q-مستخدم" });
    expect(implant.status).toBe(201);

    const blocked = await admin.delete(`/api/admin/lookups/q_value/${refId}`);
    expect(blocked.status).toBe(409);

    // The lookup list marks it as referenced.
    const list = await admin.get("/api/admin/lookups");
    const found = list.body.options.find(
      (o: { id: string; isReferenced: boolean }) => o.id === refId,
    );
    expect(found.isReferenced).toBe(true);
    // Deactivation still allowed; history untouched.
    const deact = await admin.post(
      `/api/admin/lookups/q_value/${refId}/deactivate`,
    );
    expect(deact.status).toBe(204);
  });

  it("reorders options", async () => {
    const list = await admin.get("/api/admin/lookups");
    const ids = list.body.options
      .filter((o: { category: string }) => o.category === "implant_system")
      .map((o: { id: string }) => o.id);
    const reversed = [...ids].reverse();
    const res = await admin
      .post("/api/admin/lookups/reorder")
      .send({ category: "implant_system", orderedIds: reversed });
    expect(res.status).toBe(204);
    const after = await admin.get("/api/admin/lookups");
    const afterIds = after.body.options
      .filter((o: { category: string }) => o.category === "implant_system")
      .map((o: { id: string }) => o.id);
    expect(afterIds).toEqual(reversed);
  });
});

/* ------------------------------------------------------------------ */
/* WhatsApp templates                                                  */
/* ------------------------------------------------------------------ */

describe("whatsapp template management", () => {
  it("edits a template body with valid placeholders", async () => {
    const list = await admin.get("/api/admin/whatsapp-templates");
    expect(list.status).toBe(200);
    expect(list.body.templates.length).toBeGreaterThan(0);
    const tpl = list.body.templates[0];

    const res = await admin
      .patch(`/api/admin/whatsapp-templates/${tpl.id}`)
      .send({ body: "مرحبًا {{patientName}}، موعدك بتاريخ {{date}} الساعة {{time}}." });
    expect(res.status).toBe(200);
    expect(res.body.template.body).toContain("{{patientName}}");
  });

  it("rejects unknown placeholders with a clear Arabic error", async () => {
    const list = await admin.get("/api/admin/whatsapp-templates");
    const tpl = list.body.templates[0];
    const res = await admin
      .patch(`/api/admin/whatsapp-templates/${tpl.id}`)
      .send({ body: "مرحبًا {{اسم}} موعدك {{date}}" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("متغيرات غير معروفة");
  });

  it("deactivating a template hides it from the user-facing list", async () => {
    const list = await admin.get("/api/admin/whatsapp-templates");
    const tpl = list.body.templates[0];
    const deact = await admin.post(
      `/api/admin/whatsapp-templates/${tpl.id}/deactivate`,
    );
    expect(deact.status).toBe(200);
    const visible = await admin.get("/api/whatsapp-templates");
    expect(
      visible.body.templates.some((t: { id: string }) => t.id === tpl.id),
    ).toBe(false);
    await admin.post(`/api/admin/whatsapp-templates/${tpl.id}/activate`);
  });
});

/* ------------------------------------------------------------------ */
/* Audit log viewer                                                    */
/* ------------------------------------------------------------------ */

describe("audit log viewer", () => {
  it("filters by action and user, paginates, and exports CSV", async () => {
    const res = await admin.get("/api/admin/audit-logs?action=user_create");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(
      res.body.items.every(
        (i: { action: string }) => i.action === "user_create",
      ),
    ).toBe(true);
    expect(res.body.actions).toContain("login_success");
    expect(res.body.users.length).toBeGreaterThan(0);

    const paged = await admin.get("/api/admin/audit-logs?page=1&limit=5");
    expect(paged.body.items.length).toBeLessThanOrEqual(5);

    const csv = await admin.get("/api/admin/audit-logs/export.csv");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text.startsWith("\uFEFF")).toBe(true);
    // Never leaks hashes or raw details.
    expect(csv.text).not.toContain("$2");
  });

  it("exports filtered audit logs as PDF and XLSX", async () => {
    for (const extension of ["pdf", "xlsx"]) {
      const response = await admin.get(
        `/api/admin/audit-logs/export.${extension}?action=user_create&locale=en`,
      );
      expect(response.status).toBe(200);
      expect(response.headers["content-disposition"]).toMatch(/attachment/);
      expect(response.headers["content-type"]).toContain(
        extension === "pdf" ? "application/pdf" : "spreadsheetml",
      );
      expect(Number(response.headers["content-length"])).toBeGreaterThan(100);
    }
  });

  it("never exposes password hashes through the JSON API", async () => {
    const res = await admin.get("/api/admin/audit-logs");
    expect(JSON.stringify(res.body)).not.toContain("$2");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});

/* ------------------------------------------------------------------ */
/* Legacy import                                                       */
/* ------------------------------------------------------------------ */

const PATIENT_HEADER =
  "رقم الملف,الاسم الكامل,رقم الجوال,العمر,ملاحظة إدارية,تاريخ الإضافة";

describe("legacy data import", () => {
  it("serves CSV templates", async () => {
    const res = await admin.get("/api/admin/import/template/patients.csv");
    expect(res.status).toBe(200);
    expect(res.text).toContain("رقم الملف");
  });

  it("preview validates without writing anything", async () => {
    const before = await pool.query("SELECT count(*)::int AS c FROM patients");
    const csv = [
      PATIENT_HEADER,
      "7001,مريض استيراد أول,0501112222,40,,",
      ",بدون رقم ملف,,,,",
      "7001,تكرار داخل الملف,,,,",
    ].join("\n");
    const res = await admin
      .post("/api/admin/import/preview")
      .send({ type: "patients", content: csv, mode: "create_only" });
    expect(res.status).toBe(200);
    expect(res.body.totalRows).toBe(3);
    expect(res.body.validRows).toBe(1);
    expect(res.body.invalidRows).toBe(1);
    expect(res.body.duplicateRows).toBe(1);

    const after = await pool.query("SELECT count(*)::int AS c FROM patients");
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  it("rejects files with a wrong header", async () => {
    const res = await admin
      .post("/api/admin/import/preview")
      .send({ type: "patients", content: "عمود غريب\nقيمة", mode: "create_only" });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("ترويسة");
  });

  it("commits valid rows and never overwrites duplicates", async () => {
    const csv = [
      PATIENT_HEADER,
      "7002,مريض استيراد ثانٍ,,35,ملاحظة,2024-01-10",
    ].join("\n");
    const commit = await admin
      .post("/api/admin/import/commit")
      .send({ type: "patients", content: csv, mode: "create_only" });
    expect(commit.status).toBe(200);
    expect(commit.body.imported).toBe(1);

    // Re-import same file in skip mode: skipped, original data untouched.
    const again = await admin
      .post("/api/admin/import/commit")
      .send({
        type: "patients",
        content: csv.replace("مريض استيراد ثانٍ", "اسم مزور"),
        mode: "skip_duplicates",
      });
    expect(again.body.imported).toBe(0);
    expect(again.body.skipped).toBe(1);
    const check = await pool.query(
      "SELECT full_name FROM patients WHERE file_number = '7002'",
    );
    expect(check.rows[0].full_name).toBe("مريض استيراد ثانٍ");

    // create_only mode counts the duplicate as failed.
    const strict = await admin
      .post("/api/admin/import/commit")
      .send({ type: "patients", content: csv, mode: "create_only" });
    expect(strict.body.imported).toBe(0);
    expect(strict.body.failed).toBe(1);
  });

  it("imports cases, implants, payments and followups against existing records", async () => {
    // Case for imported patient 7002.
    const caseCsv = [
      "رقم ملف المريض,تاريخ العملية,الطبيب المعالج,الطبيب المحوِّل,حالة الحالة,Pros,تاريخ التركيب المتوقع,المبلغ الأساسي للعلاج,ملاحظة عامة",
      "7002,2024-02-01,د. همام,,تمت الزراعة,,2024-06-01,5000,",
      "9999,2024-02-01,,,,,,,",
    ].join("\n");
    const cases = await admin
      .post("/api/admin/import/commit")
      .send({ type: "cases", content: caseCsv, mode: "skip_duplicates" });
    expect(cases.status).toBe(200);
    expect(cases.body.imported).toBe(1);
    expect(cases.body.failed).toBe(1); // unknown patient 9999

    const implantCsv = [
      "رقم ملف المريض,تاريخ العملية,الموقع,النظام,القطر,الطول,Q,Former,Graft,وسوم الإجراء,حالة الزرعة,ملاحظة",
      "7002,2024-02-01,46,Straumann,4.1,10,,,,,مزروعة,",
      "7002,2024-02-01,46,Straumann,4.1,10,,,,,مزروعة,", // dup site
    ].join("\n");
    const implants = await admin
      .post("/api/admin/import/commit")
      .send({ type: "implants", content: implantCsv, mode: "skip_duplicates" });
    expect(implants.body.imported).toBe(1);
    expect(implants.body.skipped).toBe(1);

    const paymentCsv = [
      "رقم ملف المريض,تاريخ العملية,المبلغ,تاريخ الدفعة,وصف الدفعة,طريقة الدفع,الرقم المرجعي,ملاحظة",
      "7002,2024-02-01,2000,2024-02-05,دفعة أولى,شبكة,,",
      "7002,2024-02-01,999,2024-02-06,وصف خاطئ,شبكة,,",
    ].join("\n");
    const payments = await admin
      .post("/api/admin/import/commit")
      .send({ type: "payments", content: paymentCsv, mode: "skip_duplicates" });
    expect(payments.body.imported).toBe(1);
    expect(payments.body.failed).toBe(1);

    const followupCsv = [
      "رقم ملف المريض,تاريخ العملية,نوع المتابعة,موعد المتابعة,الحالة,اسم المستخدم المسؤول,ملاحظة",
      "7002,2024-02-01,متابعة بعد العملية,2024-02-15 10:00,تمت,admin,",
    ].join("\n");
    const followups = await admin
      .post("/api/admin/import/commit")
      .send({ type: "followups", content: followupCsv, mode: "skip_duplicates" });
    expect(followups.body.imported).toBe(1);

    // The imported payment participates in finance aggregates.
    const caseRow = await pool.query(
      `SELECT ic.id FROM implant_cases ic
       JOIN patients p ON p.id = ic.patient_id
       WHERE p.file_number = '7002'`,
    );
    const summary = await admin.get(
      `/api/implant-cases/${caseRow.rows[0].id}/finance`,
    );
    expect(summary.status).toBe(200);
    expect(summary.body.payments.length).toBe(1);
    expect(Number(summary.body.payments[0].amount)).toBe(2000);
  });

  it("re-importing identical payments and followups reports duplicates", async () => {
    const paymentCsv = [
      "رقم ملف المريض,تاريخ العملية,المبلغ,تاريخ الدفعة,وصف الدفعة,طريقة الدفع,الرقم المرجعي,ملاحظة",
      "7002,2024-02-01,2000,2024-02-05,دفعة أولى,شبكة,,",
      "7002,2024-02-01,2000,2024-02-05,دفعة أولى,شبكة,,", // dup within the file too
    ].join("\n");
    const skip = await admin
      .post("/api/admin/import/commit")
      .send({ type: "payments", content: paymentCsv, mode: "skip_duplicates" });
    expect(skip.status).toBe(200);
    expect(skip.body.imported).toBe(0);
    expect(skip.body.skipped).toBe(2);

    const strict = await admin
      .post("/api/admin/import/commit")
      .send({ type: "payments", content: paymentCsv, mode: "create_only" });
    expect(strict.body.imported).toBe(0);
    expect(strict.body.failed).toBe(2);

    const followupCsv = [
      "رقم ملف المريض,تاريخ العملية,نوع المتابعة,موعد المتابعة,الحالة,اسم المستخدم المسؤول,ملاحظة",
      "7002,2024-02-01,متابعة بعد العملية,2024-02-15 10:00,تمت,admin,",
    ].join("\n");
    const fSkip = await admin
      .post("/api/admin/import/commit")
      .send({ type: "followups", content: followupCsv, mode: "skip_duplicates" });
    expect(fSkip.body.imported).toBe(0);
    expect(fSkip.body.skipped).toBe(1);

    // The database still holds exactly one of each.
    const counts = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM payments pay
            JOIN implant_cases ic ON ic.id = pay.implant_case_id
            JOIN patients p ON p.id = ic.patient_id
            WHERE p.file_number = '7002') AS payments,
         (SELECT count(*)::int FROM followups f
            JOIN implant_cases ic ON ic.id = f.implant_case_id
            JOIN patients p ON p.id = ic.patient_id
            WHERE p.file_number = '7002') AS followups`,
    );
    expect(counts.rows[0].payments).toBe(1);
    expect(counts.rows[0].followups).toBe(1);
  });
});

describe("universal legacy import staging", () => {
  it("analyzes arbitrary CSV headers without writing and blocks mismatched implant pairs", async () => {
    const before = await pool.query("SELECT count(*)::int AS c FROM patients");
    const csv = [
      "NAME,FILE,DATE,SYSTEM,SITE,SIZE,UNKNOWN",
      "مريض عالمي,UI-1001,2025-07-14,ROT,\"24,25\",\"3.5x10,4.0x11\",opaque",
    ].join("\n");
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "legacy-layout.csv",
      mime: "text/csv",
      content: csv,
    });
    expect(analyzed.status).toBe(201);
    expect(analyzed.body.mappings.find((m: { source: string }) => m.source === "NAME").destination)
      .toBe("patient.name");
    expect(analyzed.body.mappings.find((m: { source: string }) => m.source === "UNKNOWN").requiresReview)
      .toBe(true);
    expect(analyzed.body.rows[0].status).toBe("REVIEW_REQUIRED");
    expect(analyzed.body.rows[0].proposed.implants).toHaveLength(2);
    expect(analyzed.body.rows[0].proposed.implants[0].size).toBe("3.5 × 10");
    const after = await pool.query("SELECT count(*)::int AS c FROM patients");
    expect(after.rows[0].c).toBe(before.rows[0].c);

    const mismatch = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "mismatch.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE",
        "مريض عدم تطابق,UI-1002,2025-07-14,\"24,25,26\",\"3.5x10,4.0x11\"",
      ].join("\n"),
    });
    expect(mismatch.status).toBe(201);
    expect(mismatch.body.rows[0].status).toBe("BLOCKED");
    expect(mismatch.body.rows[0].warnings.join(" ")).toContain("counts do not match");
  });

  it("stages XLSX, commits a selected pilot, and rolls back only its records", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Legacy");
    sheet.addRow(["Patient Name", "MRN", "Surgery Date", "Tooth", "Implant Brand", "Dimensions"]);
    sheet.addRow(["مريض إكسل عالمي", "UI-1003", "2025-08-01", "36", "ROT", "4.1*10"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "legacy-layout.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: Buffer.from(buffer).toString("base64"),
    });
    expect(analyzed.status).toBe(201);
    expect(analyzed.body.rows[0].status).toBe("READY");
    const batchId = analyzed.body.id;

    const committed = await admin.post(`/api/admin/import/universal/${batchId}/commit`).send({
      rowNumbers: [1],
      pilot: true,
    });
    expect(committed.status).toBe(200);
    expect(committed.body.importedRows).toBe(1);
    const created = await pool.query("SELECT id FROM patients WHERE file_number = 'UI-1003'");
    expect(created.rows).toHaveLength(1);

    const rolledBack = await admin.post(`/api/admin/import/universal/${batchId}/rollback`).send({});
    expect(rolledBack.status).toBe(200);
    const after = await pool.query("SELECT id FROM patients WHERE file_number = 'UI-1003'");
    expect(after.rows).toHaveLength(0);
  });

  it("fails safely for an invalid PDF without creating a metadata placeholder row", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "scan.pdf",
      mime: "application/pdf",
      content: Buffer.from("not imported").toString("base64"),
    });
    expect(analyzed.status).toBe(422);
    expect(analyzed.body.error).not.toContain("Extraction status");
  });

  it("normalizes Arabic digits and explicit DD/MM/YY historical dates before validation", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "arabic-digits.csv",
      mime: "text/csv",
      content: [
        "NAME + MOBILE,FILE,DATE,SITE,SIZE,COST",
        "١- مريض تاريخي,٧٣,١٥/٧/٢٥,\"٢٤,٢٥\",\"٣.٥*١٠,٤.٢*١٠\",دفعة أولى ١٥٠٠",
      ].join("\n"),
    });
    expect(analyzed.status).toBe(201);
    expect(analyzed.body.rows[0].proposed.patient).toMatchObject({
      name: "مريض تاريخي",
      fileNumber: "73",
    });
    expect(analyzed.body.rows[0].proposed.case.procedureDate).toBe("2025-07-15");
    expect(analyzed.body.rows[0].proposed.implants).toEqual([
      expect.objectContaining({ site: "24", size: "3.5 × 10" }),
      expect.objectContaining({ site: "25", size: "4.2 × 10" }),
    ]);
    expect(analyzed.body.rows[0].proposed.financeCandidate).toBe("دفعة أولى ١٥٠٠");
    expect(analyzed.body.rows[0].status).toBe("REVIEW_REQUIRED");
    const approved = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      version: analyzed.body.version,
      rowApprovals: [{ rowNumber: 1, approved: true }],
    });
    expect(approved.status).toBe(200);
    expect(approved.body.rows[0].status).toBe("READY");
  });

  it("requires explicit review approval for low-confidence extracted values", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "visual-stage.csv",
      mime: "text/csv",
      content: "NAME,FILE,DATE,SITE,SIZE\nمريض بصري,UI-VISUAL-1,2025-07-14,24,3.5x10",
    });
    const sourceRows = [{
      rowNumber: 1,
      sheet: "Page 1",
      values: { NAME: "مريض بصري", FILE: "UI-VISUAL-1", DATE: "2025-07-14", SITE: "24", SIZE: "3.5x10" },
      confidence: { NAME: 0.97, FILE: 0.99, DATE: 0.96, SITE: 0.92, SIZE: 0.68 },
    }];
    await pool.query("UPDATE import_batches SET source_rows = $1::jsonb WHERE id = $2", [
      JSON.stringify(sourceRows),
      analyzed.body.id,
    ]);
    const reviewed = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      version: analyzed.body.version,
      mappings: [{ source: "NAME", destination: "patient.name" }],
    });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.rows[0].status).toBe("REVIEW_REQUIRED");
    expect(reviewed.body.rows[0].warnings.join(" ")).toContain("low extraction confidence");
    const approved = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      version: reviewed.body.version,
      rowApprovals: [{ rowNumber: 1, approved: true }],
    });
    expect(approved.status).toBe(200);
    expect(approved.body.rows[0].status).toBe("READY");
  });

  it("classifies tenant duplicates and file-number conflicts before commit", async () => {
    const duplicateFile = `UI-DUP-${Date.now()}`;
    await seedPatientWithCase(duplicateFile, "2025-10-01");
    const duplicate = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "existing-case.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        `مريض ${duplicateFile},${duplicateFile},2025-10-01,36`,
      ].join("\n"),
    });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.rows[0].status).toBe("DUPLICATE");
    expect(duplicate.body.summary.duplicate).toBe(1);

    const conflict = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "file-conflict.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        `اسم مختلف,${duplicateFile},2025-10-02,37`,
      ].join("\n"),
    });
    expect(conflict.status).toBe(201);
    expect(conflict.body.rows[0].status).toBe("BLOCKED");
    expect(conflict.body.rows[0].warnings.join(" ")).toContain("belongs to a different patient");

    const withinBatch = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "within-batch.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        "مريض داخل الملف,UI-DUP-2,2025-10-03,38",
        "مريض داخل الملف,UI-DUP-2,2025-10-03,39",
      ].join("\n"),
    });
    expect(withinBatch.status).toBe(201);
    expect(withinBatch.body.rows.map((row: { status: string }) => row.status))
      .toEqual(["READY", "DUPLICATE"]);

    const phoneOwner = await admin.post("/api/patients").send({
      fileNumber: `UI-PHONE-${Date.now()}`,
      fullName: "مريض هاتف قائم",
      mobileNumber: "0501234567",
    });
    expect(phoneOwner.status).toBe(201);
    const phoneWarning = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "phone-warning.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,MOBILE",
        "مريض هاتف جديد,UI-PHONE-NEW,2025-10-04,40,0501234567",
      ].join("\n"),
    });
    expect(phoneWarning.body.rows[0].status).toBe("REVIEW_REQUIRED");
    expect(phoneWarning.body.rows[0].warnings.join(" ")).toContain("phone number");
  });

  it("keeps all rows for one patient atomic and rejects empty selection", async () => {
    const atomicFile = `UI-ATOMIC-${Date.now()}`;
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "atomic-patient.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        `مريض ذري,${atomicFile},2025-11-01,41`,
        `مريض ذري,${atomicFile},2025-11-02,42`,
      ].join("\n"),
    });
    expect(analyzed.status).toBe(201);
    expect(analyzed.body.rows.every((row: { status: string }) => row.status === "READY")).toBe(true);

    // Introduce a tenant-local conflict after preview. The first case must
    // roll back with the second case in the same patient transaction.
    await seedPatientWithCase(atomicFile, "2025-11-02");
    const empty = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({
      rowNumbers: [],
    });
    expect(empty.status).toBe(422);

    const commit = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({
      rowNumbers: [1, 2],
    });
    expect(commit.status).toBe(422);
    const cases = await pool.query(
      `SELECT ic.procedure_date
       FROM implant_cases ic
       JOIN patients p ON p.id = ic.patient_id
       WHERE p.file_number = '${atomicFile}'
       ORDER BY ic.procedure_date`,
    );
    expect(cases.rows.map((row) => new Date(row.procedure_date).toISOString().slice(0, 10)))
      .toEqual(["2025-11-02"]);
  });

  it("resolves unknown-column review after an explicit legacy-note or ignore decision", async () => {
    const legacyNote = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "explicit-note.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,UNKNOWN_FIELD",
        "مريض قرار ملاحظة,UI-MAPPING-NOTE,2025-12-01,43,legacy detail",
      ].join("\n"),
    });
    expect(legacyNote.body.rows[0].status).toBe("REVIEW_REQUIRED");
    const notePatch = await admin
      .patch(`/api/admin/import/universal/${legacyNote.body.id}/mapping`)
      .send({ mappings: [{ source: "UNKNOWN_FIELD", destination: "legacy_note" }] });
    expect(notePatch.status).toBe(200);
    expect(notePatch.body.rows[0].status).toBe("READY");
    expect(notePatch.body.rows[0].proposed.legacyNotes).toContain("UNKNOWN_FIELD: legacy detail");

    const ignored = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "explicit-ignore.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,UNKNOWN_FIELD",
        "مريض قرار تجاهل,UI-MAPPING-IGNORE,2025-12-02,44,ignore detail",
      ].join("\n"),
    });
    const ignorePatch = await admin
      .patch(`/api/admin/import/universal/${ignored.body.id}/mapping`)
      .send({ mappings: [{ source: "UNKNOWN_FIELD", destination: "ignore" }] });
    expect(ignorePatch.status).toBe(200);
    expect(ignorePatch.body.rows[0].status).toBe("READY");
    expect(ignorePatch.body.rows[0].proposed.legacyNotes).toEqual([]);
  });

  it("recomputes mapping review server-side and retains approved value mappings", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "mapping-security.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SURPRISE",
        "مريض مراجعة,UI-MAP-1,14/07/2025,45,kept",
      ].join("\n"),
      mappings: [{
        source: "SURPRISE",
        destination: "ignore",
        confidence: 1,
        requiresReview: false,
        reason: "forged client decision",
      }],
    });
    expect(analyzed.body.rows[0].status).toBe("REVIEW_REQUIRED");
    const patched = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      mappings: [{ source: "SURPRISE", destination: "ignore" }],
      valueMappings: [{ source: "R", destination: "ROT" }],
    });
    expect(patched.body.rows[0].status).toBe("READY");

    const learned = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "learned-value.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SYSTEM",
        "مريض قيمة,UI-MAP-2,١٤/٠٧/٢٠٢٥,46,R",
      ].join("\n"),
    });
    expect(learned.body.rows[0].status).toBe("READY");
    expect(learned.body.rows[0].proposed.implants[0].system).toBe("ROT");

    const finance = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "finance-review.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,AMOUNT",
        "مريض مالي,UI-MAP-FINANCE,2025-07-15,47,1200",
      ].join("\n"),
    });
    expect(finance.body.rows[0].status).toBe("REVIEW_REQUIRED");
    const financePatch = await admin
      .patch(`/api/admin/import/universal/${finance.body.id}/mapping`)
      .send({ mappings: [{ source: "AMOUNT", destination: "finance.preserve_summary" }] });
    expect(financePatch.body.rows[0].status).toBe("READY");
    expect(financePatch.body.rows[0].proposed.financeCandidate).toBe("1200");
  });

  it("blocks partial patient selection and one-size/multi-site guessing", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "complete-patient.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE",
        "مريض تاريخ,UI-COMPLETE-1,2025-12-10,47,4.0x10",
        "مريض تاريخ,UI-COMPLETE-1,2025-12-11,48,4.0x11",
      ].join("\n"),
    });
    expect(analyzed.body.rows.every((row: { status: string }) => row.status === "READY")).toBe(true);
    const partial = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({
      rowNumbers: [1],
    });
    expect(partial.status).toBe(422);

    const mismatch = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "one-size-many-sites.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE",
        "مريض مقاسات,UI-COMPLETE-2,2025-12-12,\"47,48\",4.0x10",
      ].join("\n"),
    });
    expect(mismatch.body.rows[0].status).toBe("BLOCKED");
  });

  it("returns recoverable PARTIAL_FAILED status when a later patient group conflicts", async () => {
    const firstFile = `UI-PARTIAL-A-${Date.now()}`;
    const secondFile = `UI-PARTIAL-B-${Date.now()}`;
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "partial-groups.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        `مريض أول,${firstFile},2025-12-14,15`,
        `مريض ثان,${secondFile},2025-12-15,16`,
      ].join("\n"),
    });
    expect(analyzed.body.rows.every((row: { status: string }) => row.status === "READY")).toBe(true);
    await admin.post("/api/patients").send({ fileNumber: secondFile, fullName: "اسم مختلف لاحقًا" });
    const commit = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({});
    expect(commit.status).toBe(422);
    expect(commit.body.batch.status).toBe("PARTIAL_FAILED");
    expect(commit.body.committedGroups).toBe(1);
    expect(commit.body.batch.createdRecords.length).toBeGreaterThan(0);
    const first = await pool.query("SELECT id FROM patients WHERE file_number = $1", [firstFile]);
    expect(first.rows).toHaveLength(1);
  });

  it("rejects inconsistent XLSX extensions, signatures, macros, and formulas", async () => {
    const badSignature = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "bad.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: Buffer.from("not a zip").toString("base64"),
    });
    expect(badSignature.status).toBe(422);
    const wrongMime = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "bad.xlsx",
      mime: "text/csv",
      content: Buffer.from("PK\x03\x04").toString("base64"),
    });
    expect(wrongMime.status).toBe(422);
    const macro = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "bad.xlsm",
      mime: "application/vnd.ms-excel.sheet.macroEnabled.12",
      content: Buffer.from("PK\x03\x04").toString("base64"),
    });
    expect(macro.status).toBe(422);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Legacy");
    sheet.addRow(["NAME", "FILE", "DATE", "SITE"]);
    sheet.addRow(["Formula", "UI-FORMULA", "2025-12-13", "49"]);
    sheet.getCell("A2").value = { formula: "CONCATENATE(\"Formula\")", result: "Formula" };
    const formula = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "formula.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
    });
    expect(formula.status).toBe(422);
  });

  it("claims a batch with CAS so concurrent commits create one tracked set", async () => {
    const file = `UI-CAS-${Date.now()}`;
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "cas.csv", mime: "text/csv",
      content: `NAME,FILE,DATE,SITE\nCAS patient,${file},2026-01-01,11`,
    });
    const [left, right] = await Promise.all([
      admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({}),
      admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({}),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const patients = await pool.query("SELECT id FROM patients WHERE file_number = $1", [file]);
    expect(patients.rows).toHaveLength(1);
    const batch = await admin.get(`/api/admin/import/universal/${analyzed.body.id}`);
    expect(batch.body.createdRecords.length).toBeGreaterThan(0);
    expect(batch.body.createdRecords.filter((record: { table: string }) => record.table === "patients")).toHaveLength(1);
  });

  it("rejects a stale mapping patch racing a claimed commit", async () => {
    const file = `UI-RACE-${Date.now()}`;
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "race.csv", mime: "text/csv",
      content: `NAME,FILE,DATE,SITE,UNMAPPED\nRace patient,${file},2026-01-02,12,review`,
    });
    const version = analyzed.body.version;
    const [commit, patch] = await Promise.all([
      admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({ version }),
      admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
        version,
        mappings: [{ source: "UNMAPPED", destination: "ignore" }],
      }),
    ]);
    expect([commit.status, patch.status].every((status) => [200, 409, 422].includes(status))).toBe(true);
    const batch = await admin.get(`/api/admin/import/universal/${analyzed.body.id}`);
    expect(batch.status).toBe(200);
    if (commit.status === 200) {
      const patients = await pool.query("SELECT id FROM patients WHERE file_number = $1", [file]);
      expect(patients.rows).toHaveLength(1);
      expect(batch.body.createdRecords.length).toBeGreaterThan(0);
    }
  });

  it("stages rows from every non-empty XLSX worksheet", async () => {
    const workbook = new ExcelJS.Workbook();
    const first = workbook.addWorksheet("First");
    first.addRow(["NAME", "FILE", "DATE", "SITE"]);
    first.addRow(["Sheet one", "UI-SHEET-1", "2026-01-03", "13"]);
    const second = workbook.addWorksheet("Second");
    second.addRow(["SITE", "DATE", "FILE", "NAME"]);
    second.addRow(["14", "2026-01-04", "UI-SHEET-2", "Sheet two"]);
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "two-sheets.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
    });
    expect(analyzed.status).toBe(201);
    expect(analyzed.body.rows).toHaveLength(2);
    expect(analyzed.body.rows.every((row: { raw: Record<string, string> }) => !("__sheet" in row.raw)))
      .toBe(true);
  });

  it("keeps pilot batches open, appends later rows, and rolls back all records", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "pilot-lifecycle.csv", mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        "Pilot patient,UI-PILOT-LIFE,2026-01-05,15",
        "Second patient,UI-PILOT-LIFE-2,2026-01-06,16",
      ].join("\n"),
    });
    const first = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({ rowNumbers: [1], pilot: true });
    expect(first.status).toBe(200);
    expect(first.body.batch.status).toBe("PILOT_COMMITTED");
    expect(first.body.batch.committedRowNumbers).toEqual([1]);
    const second = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({ rowNumbers: [1, 2] });
    expect(second.status).toBe(200);
    expect(second.body.batch.status).toBe("COMMITTED");
    expect(second.body.batch.committedRowNumbers).toEqual([1, 2]);
    expect(second.body.batch.createdRecords.length).toBeGreaterThan(first.body.batch.createdRecords.length);
    const rollback = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/rollback`).send({});
    expect(rollback.status).toBe(200);
    const remaining = await pool.query("SELECT id FROM patients WHERE file_number = 'UI-PILOT-LIFE'");
    expect(remaining.rows).toHaveLength(0);
    const remainingSecond = await pool.query("SELECT id FROM patients WHERE file_number = 'UI-PILOT-LIFE-2'");
    expect(remainingSecond.rows).toHaveLength(0);
  });

  it("requires explicit row approval for phone warnings and independently maps ROT and BIO", async () => {
    await admin.post("/api/patients").send({ fileNumber: "UI-PHONE-OWNER-2", fullName: "Phone owner", mobileNumber: "0509876543" });
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "phone-values.csv", mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,MOBILE,SYSTEM",
        "Phone new,UI-PHONE-NEW-2,2026-01-07,17,0509876543,R",
        "Value new,UI-VALUE-NEW-2,2026-01-08,18,,B",
      ].join("\n"),
    });
    expect(analyzed.body.rows[0].status).toBe("REVIEW_REQUIRED");
    const patched = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      rowApprovals: [{ rowNumber: 1, approved: true }],
      valueMappings: [{ source: "R", destination: "ROT" }, { source: "B", destination: "BIO" }],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.rows.every((row: { status: string }) => row.status === "READY")).toBe(true);
    expect(patched.body.rows.map((row: { proposed: { implants: { system: string }[] } }) => row.proposed.implants[0].system))
      .toEqual(["ROT", "BIO"]);
  });

  it("rejects macro, external-link, and ZIP metadata bomb packages before ExcelJS", async () => {
    const cases = [
      ["renamed.xlsx", "xl/vbaProject.bin", 1],
      ["external.xlsx", "xl/externalLinks/externalLink1.xml", 1],
      ["bomb.xlsx", "xl/worksheets/sheet1.xml", 70 * 1024 * 1024],
    ] as const;
    for (const [filename, entry, size] of cases) {
      const response = await admin.post("/api/admin/import/universal/analyze").send({
        filename,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: packageWithCentralEntry(entry, size).toString("base64"),
      });
      expect(response.status).toBe(422);
    }
  });

  it("blocks every row when one file number has conflicting new-patient identities", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "identity-conflict.csv", mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        "First identity,UI-IDENTITY-CONFLICT,2026-02-01,20",
        "Second identity,UI-IDENTITY-CONFLICT,2026-02-02,21",
      ].join("\n"),
    });
    expect(analyzed.body.rows.map((row: { status: string }) => row.status)).toEqual(["BLOCKED", "BLOCKED"]);
    const commit = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({});
    expect(commit.status).toBe(422);
  });

  it("parses explicit English month names strictly and rejects impossible dates", async () => {
    const valid = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "english-date.csv", mime: "text/csv",
      content: "NAME,FILE,DATE,SITE\nEnglish date,UI-EN-DATE,14 jUlY 2025,22",
    });
    expect(valid.body.rows[0].proposed.case.procedureDate).toBe("2025-07-14");
    const invalid = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "invalid-english-date.csv", mime: "text/csv",
      content: "NAME,FILE,DATE,SITE\nInvalid date,UI-EN-BAD,31 February 2025,23",
    });
    expect(invalid.body.rows[0].status).toBe("BLOCKED");
  });

  it("splits combined Arabic and English name/mobile cells without changing raw input", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "combined-name-mobile.csv", mime: "text/csv",
      content: [
        "NAME+MOBILE,FILE,DATE,SITE",
        "مريض عربي 0501234567,UI-COMBINED-AR,2026-02-03,24",
        "English patient +966501234568,UI-COMBINED-EN,2026-02-04,25",
      ].join("\n"),
    });
    expect(analyzed.body.rows[0].proposed.patient.name).toBe("مريض عربي");
    expect(analyzed.body.rows[0].proposed.patient.mobile).toContain("0501234567");
    expect(analyzed.body.rows[1].proposed.patient.name).toBe("English patient");
    expect(analyzed.body.rows[1].proposed.patient.mobile).toContain("966501234568");
    expect(analyzed.body.rows[0].raw["NAME+MOBILE"]).toBe("مريض عربي 0501234567");
    expect(analyzed.body.rows[1].raw["NAME+MOBILE"]).toBe("English patient +966501234568");
  });

  it("reviews phone-only, malformed, and unexpectedly separated combined cells", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "ambiguous-combined.csv", mime: "text/csv",
      content: [
        "NAME+MOBILE,FILE,DATE,SITE",
        "0501234567,UI-COMBINED-PHONE,2026-02-07,28",
        "Arabic name @ 050123456,UI-COMBINED-BAD,2026-02-08,29",
        "English name +96650ABC1234,UI-COMBINED-MALFORMED,2026-02-09,30",
      ].join("\n"),
    });
    expect(analyzed.body.rows.map((row: { status: string }) => row.status))
      .toEqual(["REVIEW_REQUIRED", "REVIEW_REQUIRED", "REVIEW_REQUIRED"]);
    expect(analyzed.body.rows.every((row: { warnings: string[] }) =>
      row.warnings.some((warning) => warning.includes("Combined name/mobile")))).toBe(true);
    expect(analyzed.body.rows[0].proposed.patient.name).toBe("");
    expect(analyzed.body.rows[0].raw["NAME+MOBILE"]).toBe("0501234567");
  });

  it("uses compatible identity when one same-file history row omits phone", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "optional-phone-history.csv", mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,MOBILE",
        "Same patient,UI-SAME-PHONE,2026-02-10,31,0557771234",
        "Same patient,UI-SAME-PHONE,2026-02-11,32,",
      ].join("\n"),
    });
    expect(analyzed.body.rows.every((row: { status: string }) => row.status === "READY")).toBe(true);
    const committed = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({});
    expect(committed.status).toBe(200);
    const cases = await pool.query(
      `SELECT count(*)::int AS count FROM implant_cases ic
       JOIN patients p ON p.id = ic.patient_id WHERE p.file_number = 'UI-SAME-PHONE'`,
    );
    expect(cases.rows[0].count).toBe(2);
  });

  it("derives a group's patient mobile independent of row order", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "reversed-mobile-history.csv", mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,MOBILE",
        "Reversed mobile,UI-REVERSED-MOBILE,2026-02-12,33,",
        "Reversed mobile,UI-REVERSED-MOBILE,2026-02-13,34,0558882345",
      ].join("\n"),
    });
    expect(analyzed.body.rows.every((row: { status: string }) => row.status === "READY")).toBe(true);
    const committed = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({});
    expect(committed.status).toBe(200);
    const patient = await pool.query(
      "SELECT mobile_number FROM patients WHERE file_number = 'UI-REVERSED-MOBILE'",
    );
    expect(patient.rows).toHaveLength(1);
    expect(patient.rows[0].mobile_number).toBe("0558882345");
  });

  it("serializes rollback against continuation with a lifecycle CAS", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "rollback-race.csv", mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE",
        "Rollback first,UI-ROLLBACK-RACE-1,2026-02-05,26",
        "Rollback second,UI-ROLLBACK-RACE-2,2026-02-06,27",
      ].join("\n"),
    });
    const pilot = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({ rowNumbers: [1], pilot: true });
    expect(pilot.body.batch.status).toBe("PILOT_COMMITTED");
    const [rollback, continuation] = await Promise.all([
      admin.post(`/api/admin/import/universal/${analyzed.body.id}/rollback`).send({}),
      admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({ rowNumbers: [1, 2] }),
    ]);
    expect([rollback.status, continuation.status].sort()).toEqual(expect.arrayContaining([200]));
    const batch = await admin.get(`/api/admin/import/universal/${analyzed.body.id}`);
    if (batch.body.status === "ROLLED_BACK") {
      const patients = await pool.query("SELECT id FROM patients WHERE file_number IN ('UI-ROLLBACK-RACE-1','UI-ROLLBACK-RACE-2')");
      expect(patients.rows).toHaveLength(0);
    } else {
      expect(batch.body.createdRecords.length).toBeGreaterThan(0);
    }
  });

  it("keeps canonical implant fields, exact notes, and an explicit zero-payment import plan", async () => {
    const note = "NOTE exact: preserve | commas, Arabic: ملاحظة";
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "canonical-fields.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,SYSTEM,Q,Former,Graft,Pros,NOTE",
        `Canonical patient,UI-CANONICAL-1,2026-02-14,"24,25","3.5x10,4.0x11",ROT,"Q1,Q2",Healing,GBR,Unknown Pros,"${note}"`,
      ].join("\n"),
    });
    expect(analyzed.status).toBe(201);
    const row = analyzed.body.rows[0];
    expect(row.status).toBe("REVIEW_REQUIRED");
    expect(row.raw.NOTE).toBe(note);
    expect(row.proposed.case.clinicalNote).toBe(note);
    expect(row.proposed.implants).toEqual([
      expect.objectContaining({ site: "24", size: "3.5 × 10", qValue: "Q1", formerValue: null, graftValue: null }),
      expect.objectContaining({ site: "25", size: "4.0 × 11", qValue: "Q2", formerValue: null, graftValue: null }),
    ]);
    expect(row.proposed.sourceCandidates).toMatchObject({ formerValue: "Healing", graftValue: "GBR" });
    expect(row.proposed.case.prosValue).toBeNull();
    expect(row.proposed.legacyNotes).toContain("Pros: Unknown Pros");
    expect(row.importPlan).toMatchObject({
      createPatient: true,
      createCase: true,
      implantCount: 2,
      createBoneGraftProcedure: false,
      createProstheticEvent: false,
      paymentRecords: 0,
      preserveLegacyNote: true,
    });

    const patched = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      version: analyzed.body.version,
      implantApplyToAll: [{ rowNumber: 1, fields: ["formerValue", "graftValue"] }],
      rowApprovals: [{ rowNumber: 1, approved: true }],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.rows[0].status).toBe("READY");
    expect(patched.body.rows[0].proposed.implants).toEqual([
      expect.objectContaining({ formerValue: "Healing", graftValue: "GBR" }),
      expect.objectContaining({ formerValue: "Healing", graftValue: "GBR" }),
    ]);
  });

  it("applies labeled structured NOTE values to the proposed object, import plan, and commit payload", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "structured-note-values.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,SYSTEM,NOTE,COST",
        'Structured note patient,UI-STRUCTURED-NOTE-1,2026-03-01,36,4.8x10,ROT,"Q: 80',
        "Former: Y",
        "Graft: N",
        "Pros: 3M",
        'NOTE: IMMED","documented payment requires review"',
      ].join("\n"),
    });
    expect(analyzed.status).toBe(201);
    const row = analyzed.body.rows[0];
    expect(row.proposed.implants).toEqual([
      expect.objectContaining({ site: "36", size: "4.8 × 10", qValue: "80", formerValue: "Y", graftValue: "N" }),
    ]);
    expect(row.proposed.case).toMatchObject({ prosValue: "3M", clinicalNote: "IMMED" });
    expect(row.proposed.legacyNotes.join("\n")).not.toMatch(/Q:|Former:|Graft:|Pros:/);
    expect(row.importPlan).toMatchObject({
      implants: [expect.objectContaining({ site: "36", size: "4.8 × 10", qValue: "80", formerValue: "Y", graftValue: "N" })],
      prosValue: "3M",
      paymentRecords: 0,
      createBoneGraftProcedure: false,
    });

    const approved = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      version: analyzed.body.version,
      rowApprovals: [{ rowNumber: 1, approved: true }],
    });
    expect(approved.status).toBe(200);
    expect(approved.body.rows[0].status).toBe("READY");
    const committed = await admin.post(`/api/admin/import/universal/${analyzed.body.id}/commit`).send({
      rowNumbers: [1],
      mode: "clinical_only",
      version: approved.body.version,
    });
    expect(committed.status).toBe(200);
    const persisted = await pool.query(
      `SELECT c.pros_value, c.general_note, i.q_value, i.former_value, i.graft_value
       FROM patients p
       JOIN implant_cases c ON c.patient_id = p.id
       JOIN implants i ON i.implant_case_id = c.id
       WHERE p.file_number = 'UI-STRUCTURED-NOTE-1'`,
    );
    expect(persisted.rows).toEqual([
      expect.objectContaining({ pros_value: "3M", general_note: "IMMED", q_value: "80", former_value: "Y", graft_value: "N" }),
    ]);
  });

  it("pairs multiline canonical values and synchronizes explicit apply-to-all into the import plan", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "structured-note-multi.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,SYSTEM,NOTE",
        'Structured multi patient,UI-STRUCTURED-MULTI-1,2026-03-02,"35,36","3.5x10,3.5x10",ROT,"Q: 35',
        "Former: MST",
        "MST",
        "Graft: N",
        "N",
        "Pros: 3M",
        'NOTE: IMMED"',
      ].join("\n"),
    });
    expect(analyzed.status).toBe(201);
    expect(analyzed.body.rows[0].proposed.implants).toEqual([
      expect.objectContaining({ site: "35", size: "3.5 × 10", qValue: null, formerValue: "MST", graftValue: "N" }),
      expect.objectContaining({ site: "36", size: "3.5 × 10", qValue: null, formerValue: "MST", graftValue: "N" }),
    ]);
    expect(analyzed.body.rows[0].proposed.sourceCandidates.qValue).toBe("35");
    expect(analyzed.body.rows[0].warnings.join(" ")).toContain("Q is a single source value");

    const applied = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      version: analyzed.body.version,
      implantApplyToAll: [{ rowNumber: 1, fields: ["qValue"] }],
    });
    expect(applied.status).toBe(200);
    expect(applied.body.rows[0].status).toBe("READY");
    expect(applied.body.rows[0].proposed.implants.map((implant: { qValue: string | null }) => implant.qValue)).toEqual(["35", "35"]);
    expect(applied.body.rows[0].importPlan.implants.map((implant: { qValue: string | null }) => implant.qValue)).toEqual(["35", "35"]);
    expect(applied.body.rows[0].importPlan.prosValue).toBe("3M");
  });

  it("does not let learned legacy mappings suppress recognized canonical headers", async () => {
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "recognized-headers.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,SYSTEM,Q,Former,Graft,Pros,NOTE",
        "Recognized header patient,UI-RECOGNIZED-HEADERS-1,2026-03-03,36,4.8x10,ROT,80,Y,N,3M,IMMED",
      ].join("\n"),
    });
    expect(analyzed.status).toBe(201);
    const patched = await admin.patch(`/api/admin/import/universal/${analyzed.body.id}/mapping`).send({
      version: analyzed.body.version,
      mappings: [
        { source: "Q", destination: "legacy_note" },
        { source: "Former", destination: "legacy_note" },
        { source: "Graft", destination: "legacy_note" },
        { source: "Pros", destination: "legacy_note" },
        { source: "NOTE", destination: "legacy_note" },
      ],
    });
    expect(patched.status).toBe(200);
    expect(Object.fromEntries(
      patched.body.mappings.map((mapping: { source: string; destination: string }) => [
        mapping.source,
        mapping.destination,
      ]),
    )).toMatchObject({
      Q: "implant.q_value",
      Former: "implant.former_value",
      Graft: "implant.graft_value",
      Pros: "case.pros_value",
      NOTE: "clinical_note",
    });
    const row = patched.body.rows[0];
    expect(row.proposed.implants).toEqual([
      expect.objectContaining({ site: "36", qValue: "80", formerValue: "Y", graftValue: "N" }),
    ]);
    expect(row.proposed.case).toMatchObject({ prosValue: "3M", clinicalNote: "IMMED" });
    expect(row.proposed.legacyNotes.join("\n")).not.toMatch(/Q:|Former:|Graft:|Pros:|NOTE:/);
    expect(row.importPlan.implants).toEqual(row.proposed.implants);
    expect(row.importPlan.prosValue).toBe("3M");

    const reanalyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "recognized-headers-after-learning.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,SYSTEM,Q,Former,Graft,Pros,NOTE",
        "Recognized header patient two,UI-RECOGNIZED-HEADERS-2,2026-03-04,35,3.8x10,ROT,35,MST,N,2M,DIRECT",
      ].join("\n"),
    });
    expect(reanalyzed.status).toBe(201);
    expect(Object.fromEntries(
      reanalyzed.body.mappings.map((mapping: { source: string; destination: string }) => [
        mapping.source,
        mapping.destination,
      ]),
    )).toMatchObject({
      Q: "implant.q_value",
      Former: "implant.former_value",
      Graft: "implant.graft_value",
      Pros: "case.pros_value",
      NOTE: "clinical_note",
    });
    expect(reanalyzed.body.rows[0].proposed).toMatchObject({
      case: { prosValue: "2M", clinicalNote: "DIRECT" },
      implants: [{ site: "35", size: "3.8 × 10", qValue: "35", formerValue: "MST", graftValue: "N" }],
      legacyNotes: [],
    });
  });

  it("pairs six dedicated multiline implant fields by source line order", async () => {
    const lines = {
      site: ["45", "44", "43", "34", "35", "15"],
      size: ["3.8x10", "3.8x10", "3.8x10", "3.8x10", "3.8x10", "3.8x12"],
      q: ["35", "35", "35", "35", "35", "35"],
      former: ["MST", "MST", "MST", "MST", "MST", "MST"],
      graft: ["N", "N", "N", "N", "N", "N"],
    };
    const analyzed = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "six-line-aligned-implants.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,SYSTEM,Q,Former,Graft,Pros,NOTE",
        [
          "Six implant patient",
          "UI-SIX-IMPLANTS-1",
          "2026-03-05",
          `"${lines.site.join("\n")}"`,
          `"${lines.size.join("\n")}"`,
          "ROT",
          `"${lines.q.join("\n")}"`,
          `"${lines.former.join("\n")}"`,
          `"${lines.graft.join("\n")}"`,
          "3M",
          "IMMED",
        ].join(","),
      ].join("\n"),
    });
    expect(analyzed.status).toBe(201);
    const implants = analyzed.body.rows[0].proposed.implants;
    expect(implants).toHaveLength(6);
    expect(implants).toEqual(lines.site.map((site, index) => ({
      site,
      size: lines.size[index].replace("x", " × "),
      system: "ROT / Root",
      qValue: lines.q[index],
      formerValue: lines.former[index],
      graftValue: lines.graft[index],
    })));
    expect(analyzed.body.rows[0].warnings.join(" ")).not.toMatch(/values must match implant site count/);
  });

  it("proposes explicit full-paid wording without treating installment sums as total", async () => {
    const fullPaid = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "full-paid-review.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,COST",
        'Full paid patient,UI-FULL-PAID-1,2026-03-06,36,4.8x10,"تم دفع كامل المبلغ 10000"',
      ].join("\n"),
    });
    expect(fullPaid.status).toBe(201);
    expect(fullPaid.body.rows[0].proposed.finance).toEqual({
      historicalTotalAmount: 1_000_000,
      historicalPaidAmount: 1_000_000,
      openingRemainingBalance: 0,
      historicalPaymentStatus: "PAID_IN_FULL",
      isVerified: false,
    });
    expect(fullPaid.body.rows[0].proposed.financeCandidate).toBe("تم دفع كامل المبلغ 10000");

    const installments = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "installments-review.csv",
      mime: "text/csv",
      content: [
        "NAME,FILE,DATE,SITE,SIZE,COST",
        'Installment patient,UI-INSTALLMENTS-1,2026-03-07,35,3.5x10,"دفعة أولى 1500 دفعة ثانية 1500"',
      ].join("\n"),
    });
    expect(installments.status).toBe(201);
    expect(installments.body.rows[0].proposed.finance).toMatchObject({
      historicalTotalAmount: null,
      historicalPaidAmount: 300_000,
      openingRemainingBalance: null,
      historicalPaymentStatus: "REVIEW_REQUIRED",
      isVerified: false,
    });
  });

  it("does not guess ambiguous dates, invalid FDI values, or exceed the five-patient pilot cap", async () => {
    const ambiguous = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "ambiguous-date.csv",
      mime: "text/csv",
      content: "NAME,FILE,DATE,SITE\nAmbiguous date,UI-AMBIGUOUS-DATE,04/05/2025,11",
    });
    expect(ambiguous.body.rows[0].status).toBe("REVIEW_REQUIRED");
    expect(ambiguous.body.rows[0].proposed.case.procedureDate).toBe("");
    expect(ambiguous.body.rows[0].warnings.join(" ")).toContain("DATE_AMBIGUOUS");

    const invalidSite = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "invalid-fdi.csv",
      mime: "text/csv",
      content: "NAME,FILE,DATE,SITE\nInvalid site,UI-INVALID-FDI,2026-02-15,99",
    });
    expect(invalidSite.body.rows[0].warnings.join(" ")).toContain("SITE_INVALID");
    expect((await admin.post(`/api/admin/import/universal/${invalidSite.body.id}/commit`).send({})).status).toBe(422);

    const rows = ["NAME,FILE,DATE,SITE"];
    for (let index = 1; index <= 6; index += 1) {
      rows.push(`Pilot ${index},UI-PILOT-CAP-${index},2026-02-${String(10 + index).padStart(2, "0")},${10 + index}`);
    }
    const pilot = await admin.post("/api/admin/import/universal/analyze").send({
      filename: "pilot-cap.csv",
      mime: "text/csv",
      content: rows.join("\n"),
    });
    expect(pilot.body.rows.every((row: { status: string }) => row.status === "READY")).toBe(true);
    const response = await admin.post(`/api/admin/import/universal/${pilot.body.id}/commit`).send({ pilot: true });
    expect(response.status).toBe(422);
    expect(response.body.error).toContain("limited to five");
  });
});

/* ------------------------------------------------------------------ */
/* CSV formula-injection hardening                                     */
/* ------------------------------------------------------------------ */

describe("csv formula-injection hardening", () => {
  it("neutralizes formula-leading cells but keeps plain numbers", () => {
    expect(csvEscape("=1+2")).toBe("'=1+2");
    expect(csvEscape("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("-50.00")).toBe("-50.00");
    expect(csvEscape(-25)).toBe("-25");
    expect(csvEscape("مريض عادي")).toBe("مريض عادي");
  });

  it("exports patient notes with formula triggers neutralized", async () => {
    const csv = [
      PATIENT_HEADER,
      "7010,مريض حقن الصيغ,,30,=2+5,",
    ].join("\n");
    const commit = await admin
      .post("/api/admin/import/commit")
      .send({ type: "patients", content: csv, mode: "create_only" });
    expect(commit.status).toBe(200);
    expect(commit.body.imported).toBe(1);

    const res = await admin.get("/api/admin/export/patients.csv");
    expect(res.status).toBe(200);
    expect(res.text).toContain("'=2+5");
    expect(res.text).not.toMatch(/,=2\+5/);
  });
});

/* ------------------------------------------------------------------ */
/* Data export                                                         */
/* ------------------------------------------------------------------ */

describe("full data export", () => {
  it("exports every entity as CSV without secrets", async () => {
    for (const entity of [
      "patients",
      "cases",
      "implants",
      "payments",
      "charges",
      "discounts",
      "followups",
      "communications",
    ]) {
      const res = await admin.get(`/api/admin/export/${entity}.csv`);
      expect(res.status, entity).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.text.startsWith("\uFEFF")).toBe(true);
      expect(res.text).not.toContain("$2"); // bcrypt hashes
    }
    const bad = await admin.get("/api/admin/export/users.csv");
    expect(bad.status).toBe(400);
  });

  it("exports every entity as localized PDF and XLSX reports", async () => {
    if (process.env.EXPORT_QA_DIR) {
      await mkdir(process.env.EXPORT_QA_DIR, { recursive: true });
    }
    for (const entity of [
      "patients",
      "cases",
      "implants",
      "payments",
      "charges",
      "discounts",
      "followups",
      "communications",
    ]) {
      for (const locale of ["ar", "en"]) {
        const pdf = await admin.get(`/api/admin/export/${entity}.pdf?locale=${locale}`);
        expect(pdf.status, `${entity} ${locale} PDF`).toBe(200);
        expect(pdf.headers["content-type"]).toContain("application/pdf");
        expect(pdf.body.length).toBeGreaterThan(100);
        if (process.env.EXPORT_QA_DIR) {
          await writeFile(
            `${process.env.EXPORT_QA_DIR}/settings-${entity}-${locale}.pdf`,
            pdf.body,
          );
        }
      }

      const xlsx = await admin.get(`/api/admin/export/${entity}.xlsx?locale=en`);
      expect(xlsx.status, `${entity} XLSX`).toBe(200);
      expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
      expect(Number(xlsx.headers["content-length"])).toBeGreaterThan(100);
    }
  });

  it("uses single-locale report headings and real Excel dates", async () => {
    const ar = await admin
      .get("/api/admin/export/patients.xlsx?locale=ar")
      .buffer(true)
      .parse(binaryParser);
    const en = await admin
      .get("/api/admin/export/patients.xlsx?locale=en")
      .buffer(true)
      .parse(binaryParser);
    const arBook = new ExcelJS.Workbook();
    const enBook = new ExcelJS.Workbook();
    await arBook.xlsx.load(ar.body);
    await enBook.xlsx.load(en.body);
    const arSheet = arBook.worksheets[0];
    const enSheet = enBook.worksheets[0];
    expect(arSheet.getCell("A1").text).toContain("المرضى");
    expect(arSheet.getCell("A6").text).toBe("رقم الملف");
    expect(enSheet.getCell("A1").text).toContain("Patients");
    expect(enSheet.getCell("A6").text).toBe("File number");
    const dateCell = arSheet.getCell("F7");
    if (dateCell.value) expect(dateCell.value).toBeInstanceOf(Date);
  });
});

/* ------------------------------------------------------------------ */
/* Production readiness                                                */
/* ------------------------------------------------------------------ */

describe("health endpoints", () => {
  it("serves /api/health and /api/ready without auth", async () => {
    const anon = agentFor(app);
    expect((await anon.get("/api/health")).status).toBe(200);
    const ready = await anon.get("/api/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("ready");
  });
});
