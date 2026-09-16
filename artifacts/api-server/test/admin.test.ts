import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
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
