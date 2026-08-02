import { Router, type IRouter } from "express";
import {
  db,
  followupsTable,
  implantCasesTable,
  implantsTable,
  patientsTable,
  paymentsTable,
  usersTable,
} from "@workspace/db";
import {
  CASE_STATUSES,
  FDI_SITES,
  FOLLOWUP_STATUSES,
  FOLLOWUP_TYPES,
  IMPLANT_STATUSES,
  IMPORT_TYPE_LABELS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  importRequestSchema,
  normalizeArabicSearchText,
  normalizeMobile,
  toEnglishDigits,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type ImportRowResult,
  type ImportType,
} from "@workspace/shared";
import { and, inArray, isNull } from "drizzle-orm";
import { writeAudit } from "../lib/audit";
import { parseCsv, sendCsv, toCsv } from "../lib/csv";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/import", requireAuth, requireRole("ADMIN"));

const MAX_ROWS = 2000;
const MAX_RESULT_ROWS = 1000;

/* ------------------------------------------------------------------ */
/* CSV templates                                                       */
/* ------------------------------------------------------------------ */

const HEADERS: Record<ImportType, string[]> = {
  patients: [
    "رقم الملف",
    "الاسم الكامل",
    "رقم الجوال",
    "العمر",
    "ملاحظة إدارية",
    "تاريخ الإضافة",
  ],
  cases: [
    "رقم ملف المريض",
    "تاريخ العملية",
    "الطبيب المعالج",
    "الطبيب المحوِّل",
    "حالة الحالة",
    "Pros",
    "تاريخ التركيب المتوقع",
    "المبلغ الأساسي للعلاج",
    "ملاحظة عامة",
  ],
  implants: [
    "رقم ملف المريض",
    "تاريخ العملية",
    "الموقع",
    "النظام",
    "القطر",
    "الطول",
    "Q",
    "Former",
    "Graft",
    "وسوم الإجراء",
    "حالة الزرعة",
    "ملاحظة",
  ],
  payments: [
    "رقم ملف المريض",
    "تاريخ العملية",
    "المبلغ",
    "تاريخ الدفعة",
    "وصف الدفعة",
    "طريقة الدفع",
    "الرقم المرجعي",
    "ملاحظة",
  ],
  followups: [
    "رقم ملف المريض",
    "تاريخ العملية",
    "نوع المتابعة",
    "موعد المتابعة",
    "الحالة",
    "اسم المستخدم المسؤول",
    "ملاحظة",
  ],
};

const TEMPLATE_SAMPLES: Record<ImportType, string[][]> = {
  patients: [["1001", "محمد أحمد", "0501234567", "45", "", "2024-01-15"]],
  cases: [
    [
      "1001",
      "2024-02-01",
      "د. همام",
      "",
      "تمت الزراعة",
      "3 أشهر",
      "2024-05-01",
      "6000",
      "",
    ],
  ],
  implants: [
    ["1001", "2024-02-01", "36", "Straumann", "4.1", "10", "", "", "", "", "مزروعة", ""],
  ],
  payments: [
    ["1001", "2024-02-01", "2000", "2024-02-01", "دفعة أولى", "شبكة", "", ""],
  ],
  followups: [
    ["1001", "2024-02-01", "متابعة بعد العملية", "2024-02-15 10:00", "تمت", "", ""],
  ],
};

/* ------------------------------------------------------------------ */
/* Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;

function cleanDate(raw: string): string | null {
  const v = toEnglishDigits(raw.trim());
  if (!DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

function cleanDateTime(raw: string): string | null {
  const v = toEnglishDigits(raw.trim()).replace(" ", "T");
  if (!DATETIME_RE.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : v;
}

function cleanNumber(raw: string): number | null {
  const v = toEnglishDigits(raw.trim()).replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Money: non-negative, max 2 decimals. */
function cleanMoney(raw: string): number | null {
  const n = cleanNumber(raw);
  if (n === null || n < 0) return null;
  if (Math.round(n * 100) !== Math.round(n * 100 * 1e6) / 1e6) return null;
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
  return Math.round(n * 100) / 100;
}

function canonicalFileNumber(value: string): string {
  return toEnglishDigits(value).trim();
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface AnalyzedRow {
  rowNumber: number;
  status: "valid" | "invalid" | "duplicate";
  summary: string;
  errors: string[];
  insert?: (tx: Tx) => Promise<void>;
}

interface ParsedInput {
  headers: string[];
  records: { rowNumber: number; get: (header: string) => string }[];
}

/** Validate header row and map data rows by header name. */
function parseRecords(
  type: ImportType,
  content: string,
): { ok: true; parsed: ParsedInput } | { ok: false; error: string } {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    return { ok: false, error: "الملف فارغ أو لا يحتوي على صفوف صالحة." };
  }
  const expected = HEADERS[type];
  const header = rows[0].map((h) => h.trim());
  const missing = expected.filter((h) => !header.includes(h));
  const extra = header.filter((h) => h && !expected.includes(h));
  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`أعمدة ناقصة: ${missing.join("، ")}`);
    if (extra.length > 0) parts.push(`أعمدة غير معروفة: ${extra.join("، ")}`);
    return {
      ok: false,
      error: `ترويسة الملف لا تطابق القالب المطلوب. ${parts.join(" — ")}. حمِّل القالب من صفحة الاستيراد.`,
    };
  }
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ok: false, error: "الملف لا يحتوي على صفوف بيانات بعد الترويسة." };
  }
  if (dataRows.length > MAX_ROWS) {
    return {
      ok: false,
      error: `عدد الصفوف كبير جدًا (${dataRows.length}). الحد الأقصى ${MAX_ROWS} صفًا لكل ملف. قسّم الملف وأعد المحاولة.`,
    };
  }
  const indexOf = new Map(header.map((h, i) => [h, i]));
  return {
    ok: true,
    parsed: {
      headers: header,
      records: dataRows.map((cells, i) => ({
        rowNumber: i + 1,
        get: (h: string) => (cells[indexOf.get(h) ?? -1] ?? "").trim(),
      })),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shared context loaders                                              */
/* ------------------------------------------------------------------ */

interface PatientRef {
  id: string;
  fileNumber: string;
  archived: boolean;
}

async function loadPatientsByFileNumbers(
  fileNumbers: string[],
): Promise<Map<string, PatientRef>> {
  if (fileNumbers.length === 0) return new Map();
  const rows = await db
    .select({
      id: patientsTable.id,
      fileNumber: patientsTable.fileNumber,
      archivedAt: patientsTable.archivedAt,
    })
    .from(patientsTable)
    .where(inArray(patientsTable.fileNumber, fileNumbers));
  return new Map(
    rows.map((r) => [
      r.fileNumber,
      { id: r.id, fileNumber: r.fileNumber, archived: r.archivedAt !== null },
    ]),
  );
}

interface CaseRef {
  id: string;
  patientId: string;
  procedureDate: string | null;
  archived: boolean;
}

async function loadCasesForPatients(
  patientIds: string[],
): Promise<CaseRef[]> {
  if (patientIds.length === 0) return [];
  const rows = await db
    .select({
      id: implantCasesTable.id,
      patientId: implantCasesTable.patientId,
      procedureDate: implantCasesTable.procedureDate,
      archivedAt: implantCasesTable.archivedAt,
    })
    .from(implantCasesTable)
    .where(inArray(implantCasesTable.patientId, patientIds));
  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    procedureDate: r.procedureDate,
    archived: r.archivedAt !== null,
  }));
}

/**
 * Resolve the target case by patient file number + procedure date.
 * Returns an Arabic error string on failure.
 */
function resolveCase(
  patient: PatientRef | undefined,
  fileNumber: string,
  procedureDate: string | null,
  cases: CaseRef[],
): { ok: true; caseRef: CaseRef } | { ok: false; error: string } {
  if (!fileNumber) return { ok: false, error: "رقم ملف المريض مطلوب." };
  if (!patient) {
    return {
      ok: false,
      error: `لا يوجد مريض برقم الملف ${fileNumber}. استورد المرضى أولًا.`,
    };
  }
  if (patient.archived) {
    return { ok: false, error: "ملف المريض مؤرشف — لا يمكن الاستيراد إليه." };
  }
  if (!procedureDate) {
    return {
      ok: false,
      error: "تاريخ العملية مطلوب بصيغة YYYY-MM-DD لتحديد الحالة.",
    };
  }
  const matches = cases.filter(
    (c) => c.patientId === patient.id && c.procedureDate === procedureDate,
  );
  if (matches.length === 0) {
    return {
      ok: false,
      error: `لا توجد حالة زراعة للمريض ${fileNumber} بتاريخ العملية ${procedureDate}. استورد الحالات أولًا.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `توجد أكثر من حالة للمريض ${fileNumber} بنفس تاريخ العملية ${procedureDate} — لا يمكن تحديد الحالة تلقائيًا.`,
    };
  }
  if (matches[0].archived) {
    return { ok: false, error: "الحالة المستهدفة مؤرشفة — لا يمكن الاستيراد إليها." };
  }
  return { ok: true, caseRef: matches[0] };
}

/* ------------------------------------------------------------------ */
/* Per-type analyzers                                                  */
/* ------------------------------------------------------------------ */

async function analyzePatients(
  parsed: ParsedInput,
  actorId: string,
): Promise<AnalyzedRow[]> {
  const fileNumbers = parsed.records.map((r) =>
    canonicalFileNumber(r.get("رقم الملف")),
  );
  const existing = await loadPatientsByFileNumbers(
    fileNumbers.filter(Boolean),
  );
  const seenInFile = new Set<string>();
  return parsed.records.map((record) => {
    const fileNumber = canonicalFileNumber(record.get("رقم الملف"));
    const fullName = record.get("الاسم الكامل");
    const summary = `${fileNumber || "بدون رقم ملف"} — ${fullName || "بدون اسم"}`;
    const errors: string[] = [];

    if (!fileNumber) errors.push("رقم الملف مطلوب.");
    else if (fileNumber.length > 50) errors.push("رقم الملف طويل جدًا.");
    if (!fullName) errors.push("اسم المريض مطلوب.");
    else if (fullName.length > 200) errors.push("اسم المريض طويل جدًا.");

    const mobileRaw = record.get("رقم الجوال");
    let mobileNumber: string | null = null;
    let mobileNormalized: string | null = null;
    if (mobileRaw) {
      const result = normalizeMobile(mobileRaw);
      if (!result.ok) errors.push(result.message);
      else {
        mobileNumber = mobileRaw;
        mobileNormalized = result.normalized;
      }
    }

    const ageRaw = record.get("العمر");
    let age: number | null = null;
    if (ageRaw) {
      const n = cleanNumber(ageRaw);
      if (n === null || !Number.isInteger(n) || n < 0 || n > 130) {
        errors.push("العمر غير صحيح.");
      } else {
        age = n;
      }
    }

    const note = record.get("ملاحظة إدارية") || null;
    if (note && note.length > 2000) errors.push("الملاحظة طويلة جدًا.");

    const addedRaw = record.get("تاريخ الإضافة");
    let createdAt: Date | undefined;
    if (addedRaw) {
      const d = cleanDate(addedRaw);
      if (!d) errors.push("تاريخ الإضافة يجب أن يكون بصيغة YYYY-MM-DD.");
      else createdAt = new Date(`${d}T09:00:00+03:00`);
    }

    if (errors.length > 0) {
      return { rowNumber: record.rowNumber, status: "invalid" as const, summary, errors };
    }
    if (existing.has(fileNumber) || seenInFile.has(fileNumber)) {
      return {
        rowNumber: record.rowNumber,
        status: "duplicate" as const,
        summary,
        errors: [`رقم الملف ${fileNumber} موجود مسبقًا — لن يتم استبدال أي بيانات.`],
      };
    }
    seenInFile.add(fileNumber);
    return {
      rowNumber: record.rowNumber,
      status: "valid" as const,
      summary,
      errors: [],
      insert: async (tx: Tx) => {
        await tx.insert(patientsTable).values({
          fileNumber,
          fullName,
          fullNameNormalized: normalizeArabicSearchText(fullName),
          mobileNumber,
          mobileNormalized,
          age,
          administrativeNote: note,
          ...(createdAt ? { createdAt } : {}),
          createdBy: actorId,
          updatedBy: actorId,
        });
      },
    };
  });
}

async function analyzeCases(
  parsed: ParsedInput,
  actorId: string,
): Promise<AnalyzedRow[]> {
  const fileNumbers = [
    ...new Set(
      parsed.records
        .map((r) => canonicalFileNumber(r.get("رقم ملف المريض")))
        .filter(Boolean),
    ),
  ];
  const patients = await loadPatientsByFileNumbers(fileNumbers);
  const cases = await loadCasesForPatients(
    [...patients.values()].map((p) => p.id),
  );
  const existingKeys = new Set(
    cases
      .filter((c) => c.procedureDate)
      .map((c) => `${c.patientId}|${c.procedureDate}`),
  );
  const seenInFile = new Set<string>();

  return parsed.records.map((record) => {
    const fileNumber = canonicalFileNumber(record.get("رقم ملف المريض"));
    const procedureDate = cleanDate(record.get("تاريخ العملية"));
    const summary = `${fileNumber || "بدون رقم ملف"} — عملية ${procedureDate ?? record.get("تاريخ العملية") ?? ""}`;
    const errors: string[] = [];
    const patient = patients.get(fileNumber);

    if (!fileNumber) errors.push("رقم ملف المريض مطلوب.");
    else if (!patient) {
      errors.push(`لا يوجد مريض برقم الملف ${fileNumber}. استورد المرضى أولًا.`);
    } else if (patient.archived) {
      errors.push("ملف المريض مؤرشف — لا يمكن الاستيراد إليه.");
    }
    if (!procedureDate) {
      errors.push("تاريخ العملية مطلوب بصيغة YYYY-MM-DD.");
    }

    const treatingDoctor = record.get("الطبيب المعالج") || "د. همام";
    if (treatingDoctor.length > 200) errors.push("اسم الطبيب طويل جدًا.");
    const referringDoctor = record.get("الطبيب المحوِّل") || null;
    const caseStatus = record.get("حالة الحالة") || "حالة جديدة";
    if (!(CASE_STATUSES as readonly string[]).includes(caseStatus)) {
      errors.push(
        `حالة الحالة غير معروفة: "${caseStatus}". القيم المسموحة: ${CASE_STATUSES.join("، ")}.`,
      );
    }
    const prosValue = record.get("Pros") || null;
    const expectedRaw = record.get("تاريخ التركيب المتوقع");
    const expectedProstheticDate = expectedRaw ? cleanDate(expectedRaw) : null;
    if (expectedRaw && !expectedProstheticDate) {
      errors.push("تاريخ التركيب المتوقع يجب أن يكون بصيغة YYYY-MM-DD.");
    }
    const amountRaw = record.get("المبلغ الأساسي للعلاج");
    let baseAmount = 0;
    if (amountRaw) {
      const money = cleanMoney(amountRaw);
      if (money === null) errors.push("المبلغ الأساسي للعلاج غير صحيح.");
      else baseAmount = money;
    }
    const generalNote = record.get("ملاحظة عامة") || null;

    if (errors.length > 0) {
      return { rowNumber: record.rowNumber, status: "invalid" as const, summary, errors };
    }
    const key = `${patient!.id}|${procedureDate}`;
    if (existingKeys.has(key) || seenInFile.has(key)) {
      return {
        rowNumber: record.rowNumber,
        status: "duplicate" as const,
        summary,
        errors: [
          `توجد حالة للمريض ${fileNumber} بنفس تاريخ العملية ${procedureDate} — لن يتم استبدالها.`,
        ],
      };
    }
    seenInFile.add(key);
    return {
      rowNumber: record.rowNumber,
      status: "valid" as const,
      summary,
      errors: [],
      insert: async (tx: Tx) => {
        await tx.insert(implantCasesTable).values({
          patientId: patient!.id,
          procedureDate,
          treatingDoctor,
          referringDoctor,
          caseStatus,
          prosValue,
          expectedProstheticDate,
          baseTreatmentAmount: baseAmount.toFixed(2),
          generalNote,
          createdBy: actorId,
          updatedBy: actorId,
        });
      },
    };
  });
}

async function analyzeImplants(parsed: ParsedInput): Promise<AnalyzedRow[]> {
  const fileNumbers = [
    ...new Set(
      parsed.records
        .map((r) => canonicalFileNumber(r.get("رقم ملف المريض")))
        .filter(Boolean),
    ),
  ];
  const patients = await loadPatientsByFileNumbers(fileNumbers);
  const cases = await loadCasesForPatients(
    [...patients.values()].map((p) => p.id),
  );
  const caseIds = cases.map((c) => c.id);
  const existingSites =
    caseIds.length > 0
      ? await db
          .select({
            implantCaseId: implantsTable.implantCaseId,
            site: implantsTable.site,
          })
          .from(implantsTable)
          .where(
            and(
              inArray(implantsTable.implantCaseId, caseIds),
              isNull(implantsTable.archivedAt),
            ),
          )
      : [];
  const siteKeys = new Set(
    existingSites.map((s) => `${s.implantCaseId}|${s.site}`),
  );
  const seenInFile = new Set<string>();

  return parsed.records.map((record) => {
    const fileNumber = canonicalFileNumber(record.get("رقم ملف المريض"));
    const procedureDate = cleanDate(record.get("تاريخ العملية"));
    const site = toEnglishDigits(record.get("الموقع"));
    const summary = `${fileNumber || "بدون رقم ملف"} — زرعة ${site || "بدون موقع"}`;
    const errors: string[] = [];

    const resolved = resolveCase(
      patients.get(fileNumber),
      fileNumber,
      procedureDate,
      cases,
    );
    if (!resolved.ok) errors.push(resolved.error);

    if (!site) errors.push("موقع الزرعة مطلوب.");
    else if (site.length > 20) errors.push("موقع الزرعة طويل جدًا.");
    const isCustomSite = !!site && !(FDI_SITES as readonly string[]).includes(site);

    const system = record.get("النظام") || null;
    const diameterRaw = record.get("القطر");
    const lengthRaw = record.get("الطول");
    const diameter = diameterRaw ? cleanNumber(diameterRaw) : null;
    const lengthVal = lengthRaw ? cleanNumber(lengthRaw) : null;
    if (diameterRaw && (diameter === null || diameter <= 0 || diameter > 99.99)) {
      errors.push("القطر غير صحيح.");
    }
    if (lengthRaw && (lengthVal === null || lengthVal <= 0 || lengthVal > 99.99)) {
      errors.push("الطول غير صحيح.");
    }
    const qValue = record.get("Q") || null;
    const formerValue = record.get("Former") || null;
    const graftValue = record.get("Graft") || null;
    const tags = record
      .get("وسوم الإجراء")
      .split(/[؛;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.some((t) => t.length > 50)) errors.push("أحد الوسوم طويل جدًا.");
    const implantStatus = record.get("حالة الزرعة") || "مزروعة";
    if (!(IMPLANT_STATUSES as readonly string[]).includes(implantStatus)) {
      errors.push(
        `حالة الزرعة غير معروفة: "${implantStatus}". القيم المسموحة: ${IMPLANT_STATUSES.join("، ")}.`,
      );
    }
    const implantNote = record.get("ملاحظة") || null;

    if (errors.length > 0) {
      return { rowNumber: record.rowNumber, status: "invalid" as const, summary, errors };
    }
    const caseRef = (resolved as { ok: true; caseRef: CaseRef }).caseRef;
    const key = `${caseRef.id}|${site}`;
    if (siteKeys.has(key) || seenInFile.has(key)) {
      return {
        rowNumber: record.rowNumber,
        status: "duplicate" as const,
        summary,
        errors: [
          `توجد زرعة في الموقع ${site} لنفس الحالة — لن يتم استبدالها.`,
        ],
      };
    }
    seenInFile.add(key);
    return {
      rowNumber: record.rowNumber,
      status: "valid" as const,
      summary,
      errors: [],
      insert: async (tx: Tx) => {
        await tx.insert(implantsTable).values({
          implantCaseId: caseRef.id,
          site,
          isCustomSite,
          system,
          diameter: diameter === null ? null : String(diameter),
          length: lengthVal === null ? null : String(lengthVal),
          qValue,
          formerValue,
          graftValue,
          procedureTags: tags,
          implantStatus,
          implantNote,
        });
      },
    };
  });
}

async function analyzePayments(
  parsed: ParsedInput,
  actorId: string,
): Promise<AnalyzedRow[]> {
  const fileNumbers = [
    ...new Set(
      parsed.records
        .map((r) => canonicalFileNumber(r.get("رقم ملف المريض")))
        .filter(Boolean),
    ),
  ];
  const patients = await loadPatientsByFileNumbers(fileNumbers);
  const cases = await loadCasesForPatients(
    [...patients.values()].map((p) => p.id),
  );
  // Duplicate detection: an identical payment (same case, date, amount,
  // label, and method) already in the DB — or earlier in the same file —
  // is reported as duplicate instead of being inserted again.
  const caseIds = [...cases.values()].flat().map((c) => c.id);
  const existingPayments =
    caseIds.length === 0
      ? []
      : await db
          .select({
            implantCaseId: paymentsTable.implantCaseId,
            amount: paymentsTable.amount,
            paymentDate: paymentsTable.paymentDate,
            paymentLabel: paymentsTable.paymentLabel,
            paymentMethod: paymentsTable.paymentMethod,
          })
          .from(paymentsTable)
          .where(inArray(paymentsTable.implantCaseId, caseIds));
  const paymentKey = (
    caseId: string,
    date: string | null,
    amount: string | null,
    label: string | null,
    method: string | null,
  ) =>
    `${caseId}|${date ?? ""}|${Number(amount ?? 0).toFixed(2)}|${label ?? ""}|${method ?? ""}`;
  const existingPaymentKeys = new Set(
    existingPayments.map((p) =>
      paymentKey(p.implantCaseId, p.paymentDate, p.amount, p.paymentLabel, p.paymentMethod),
    ),
  );
  const seenInFile = new Set<string>();

  return parsed.records.map((record) => {
    const fileNumber = canonicalFileNumber(record.get("رقم ملف المريض"));
    const procedureDate = cleanDate(record.get("تاريخ العملية"));
    const amountRaw = record.get("المبلغ");
    const summary = `${fileNumber || "بدون رقم ملف"} — دفعة ${amountRaw || ""}`;
    const errors: string[] = [];

    const resolved = resolveCase(
      patients.get(fileNumber),
      fileNumber,
      procedureDate,
      cases,
    );
    if (!resolved.ok) errors.push(resolved.error);

    const amount = amountRaw ? cleanMoney(amountRaw) : null;
    if (amount === null || amount <= 0) {
      errors.push("المبلغ مطلوب ويجب أن يكون رقمًا أكبر من صفر.");
    }
    const paymentDate = cleanDate(record.get("تاريخ الدفعة"));
    if (!paymentDate) errors.push("تاريخ الدفعة مطلوب بصيغة YYYY-MM-DD.");
    const paymentLabel = record.get("وصف الدفعة");
    if (!(PAYMENT_LABELS as readonly string[]).includes(paymentLabel)) {
      errors.push(
        `وصف الدفعة غير معروف: "${paymentLabel}". القيم المسموحة: ${PAYMENT_LABELS.join("، ")}.`,
      );
    }
    const paymentMethod = record.get("طريقة الدفع");
    if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
      errors.push(
        `طريقة الدفع غير معروفة: "${paymentMethod}". القيم المسموحة: ${PAYMENT_METHODS.join("، ")}.`,
      );
    }
    const referenceNumber = record.get("الرقم المرجعي") || null;
    const note = record.get("ملاحظة") || null;

    if (errors.length > 0) {
      return { rowNumber: record.rowNumber, status: "invalid" as const, summary, errors };
    }
    const caseRef = (resolved as { ok: true; caseRef: CaseRef }).caseRef;
    const key = paymentKey(
      caseRef.id,
      paymentDate!,
      amount!.toFixed(2),
      paymentLabel,
      paymentMethod,
    );
    if (existingPaymentKeys.has(key) || seenInFile.has(key)) {
      return {
        rowNumber: record.rowNumber,
        status: "duplicate" as const,
        summary,
        errors: [
          "دفعة مطابقة (نفس الحالة والتاريخ والمبلغ والوصف والطريقة) موجودة مسبقًا — لن يتم استبدال أي بيانات.",
        ],
      };
    }
    seenInFile.add(key);
    return {
      rowNumber: record.rowNumber,
      status: "valid" as const,
      summary,
      errors: [],
      insert: async (tx: Tx) => {
        await tx.insert(paymentsTable).values({
          implantCaseId: caseRef.id,
          amount: amount!.toFixed(2),
          paymentDate: paymentDate!,
          paymentLabel,
          paymentMethod,
          referenceNumber,
          note,
          createdBy: actorId,
        });
      },
    };
  });
}

async function analyzeFollowups(
  parsed: ParsedInput,
  actorId: string,
): Promise<AnalyzedRow[]> {
  const fileNumbers = [
    ...new Set(
      parsed.records
        .map((r) => canonicalFileNumber(r.get("رقم ملف المريض")))
        .filter(Boolean),
    ),
  ];
  const patients = await loadPatientsByFileNumbers(fileNumbers);
  const cases = await loadCasesForPatients(
    [...patients.values()].map((p) => p.id),
  );
  const allUsers = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable);
  const usersByUsername = new Map(allUsers.map((u) => [u.username, u.id]));

  // Duplicate detection: an identical followup (same case, type, and
  // scheduled time) already in the DB — or earlier in the same file — is
  // reported as duplicate instead of being inserted again.
  const caseIds = [...cases.values()].flat().map((c) => c.id);
  const existingFollowups =
    caseIds.length === 0
      ? []
      : await db
          .select({
            implantCaseId: followupsTable.implantCaseId,
            followupType: followupsTable.followupType,
            scheduledAt: followupsTable.scheduledAt,
          })
          .from(followupsTable)
          .where(inArray(followupsTable.implantCaseId, caseIds));
  const followupKey = (caseId: string, type: string, at: Date | null) =>
    `${caseId}|${type}|${at ? at.getTime() : "none"}`;
  const existingFollowupKeys = new Set(
    existingFollowups.map((f) =>
      followupKey(f.implantCaseId, f.followupType, f.scheduledAt),
    ),
  );
  const seenInFile = new Set<string>();

  return parsed.records.map((record) => {
    const fileNumber = canonicalFileNumber(record.get("رقم ملف المريض"));
    const procedureDate = cleanDate(record.get("تاريخ العملية"));
    const followupType = record.get("نوع المتابعة");
    const summary = `${fileNumber || "بدون رقم ملف"} — ${followupType || "متابعة"}`;
    const errors: string[] = [];

    const resolved = resolveCase(
      patients.get(fileNumber),
      fileNumber,
      procedureDate,
      cases,
    );
    if (!resolved.ok) errors.push(resolved.error);

    if (!(FOLLOWUP_TYPES as readonly string[]).includes(followupType)) {
      errors.push(
        `نوع المتابعة غير معروف: "${followupType}". القيم المسموحة: ${FOLLOWUP_TYPES.join("، ")}.`,
      );
    }
    const scheduledAt = cleanDateTime(record.get("موعد المتابعة"));
    if (!scheduledAt) {
      errors.push("موعد المتابعة مطلوب بصيغة YYYY-MM-DD HH:mm.");
    }
    const status = record.get("الحالة") || "مجدولة";
    if (!(FOLLOWUP_STATUSES as readonly string[]).includes(status)) {
      errors.push(
        `حالة المتابعة غير معروفة: "${status}". القيم المسموحة: ${FOLLOWUP_STATUSES.join("، ")}.`,
      );
    }
    const assignedUsername = record.get("اسم المستخدم المسؤول");
    let assignedUserId: string | null = null;
    if (assignedUsername) {
      const id = usersByUsername.get(assignedUsername.toLowerCase());
      if (!id) {
        errors.push(`لا يوجد مستخدم باسم المستخدم "${assignedUsername}".`);
      } else {
        assignedUserId = id;
      }
    }
    const note = record.get("ملاحظة") || null;

    if (errors.length > 0) {
      return { rowNumber: record.rowNumber, status: "invalid" as const, summary, errors };
    }
    const caseRef = (resolved as { ok: true; caseRef: CaseRef }).caseRef;
    const patient = patients.get(fileNumber)!;
    const key = followupKey(caseRef.id, followupType, new Date(scheduledAt!));
    if (existingFollowupKeys.has(key) || seenInFile.has(key)) {
      return {
        rowNumber: record.rowNumber,
        status: "duplicate" as const,
        summary,
        errors: [
          "متابعة مطابقة (نفس الحالة والنوع والموعد) موجودة مسبقًا — لن يتم استبدال أي بيانات.",
        ],
      };
    }
    seenInFile.add(key);
    return {
      rowNumber: record.rowNumber,
      status: "valid" as const,
      summary,
      errors: [],
      insert: async (tx: Tx) => {
        await tx.insert(followupsTable).values({
          implantCaseId: caseRef.id,
          patientId: patient.id,
          followupType,
          followupStatus: status,
          scheduledAt: new Date(scheduledAt!),
          note,
          assignedUserId,
          createdBy: actorId,
        });
      },
    };
  });
}

async function analyze(
  type: ImportType,
  parsed: ParsedInput,
  actorId: string,
): Promise<AnalyzedRow[]> {
  switch (type) {
    default:
      throw new Error(`unknown import type: ${type as string}`);
    case "patients":
      return analyzePatients(parsed, actorId);
    case "cases":
      return analyzeCases(parsed, actorId);
    case "implants":
      return analyzeImplants(parsed);
    case "payments":
      return analyzePayments(parsed, actorId);
    case "followups":
      return analyzeFollowups(parsed, actorId);
  }
}

function toRowResults(rows: AnalyzedRow[]): {
  rows: ImportRowResult[];
  truncated: boolean;
} {
  const truncated = rows.length > MAX_RESULT_ROWS;
  return {
    rows: rows.slice(0, MAX_RESULT_ROWS).map((r) => ({
      rowNumber: r.rowNumber,
      status: r.status,
      summary: r.summary,
      errors: r.errors,
    })),
    truncated,
  };
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

router.get("/admin/import/template/:type.csv", async (req, res) => {
  const type = req.params.type as ImportType;
  if (!HEADERS[type]) {
    res.status(400).json({ error: "نوع الاستيراد غير معروف.", code: "VALIDATION_ERROR" });
    return;
  }
  sendCsv(
    res,
    `import-template-${type}.csv`,
    toCsv(HEADERS[type], TEMPLATE_SAMPLES[type]),
  );
});

/** Dry run — parses and validates only. NEVER writes to the database. */
router.post("/admin/import/preview", async (req, res) => {
  const input = parseOrRespond(importRequestSchema, req.body, res);
  if (!input) return;

  const parsedResult = parseRecords(input.type, input.content);
  if (!parsedResult.ok) {
    res.status(422).json({ error: parsedResult.error, code: "IMPORT_FILE_ERROR" });
    return;
  }
  const analyzed = await analyze(
    input.type,
    parsedResult.parsed,
    req.currentUser!.id,
  );
  const { rows, truncated } = toRowResults(analyzed);
  const body: ImportPreviewResponse = {
    type: input.type,
    totalRows: analyzed.length,
    validRows: analyzed.filter((r) => r.status === "valid").length,
    invalidRows: analyzed.filter((r) => r.status === "invalid").length,
    duplicateRows: analyzed.filter((r) => r.status === "duplicate").length,
    rows,
    truncated,
  };
  res.json(body);
});

router.post("/admin/import/commit", async (req, res) => {
  const input = parseOrRespond(importRequestSchema, req.body, res);
  if (!input) return;

  const parsedResult = parseRecords(input.type, input.content);
  if (!parsedResult.ok) {
    res.status(422).json({ error: parsedResult.error, code: "IMPORT_FILE_ERROR" });
    return;
  }
  // Re-analyze server-side: the commit never trusts a client-side preview.
  const analyzed = await analyze(
    input.type,
    parsedResult.parsed,
    req.currentUser!.id,
  );

  const valid = analyzed.filter((r) => r.status === "valid");
  const duplicates = analyzed.filter((r) => r.status === "duplicate");
  const invalid = analyzed.filter((r) => r.status === "invalid");

  // In create_only mode any duplicate is an error and blocks nothing else;
  // in skip_duplicates mode duplicates are silently skipped. Existing data
  // is NEVER overwritten in either mode.
  const failed = invalid.length + (input.mode === "create_only" ? duplicates.length : 0);
  const skipped = input.mode === "create_only" ? 0 : duplicates.length;

  const user = req.currentUser!;
  if (valid.length > 0) {
    await db.transaction(async (tx) => {
      for (const row of valid) {
        await row.insert!(tx);
      }
      await writeAudit(
        {
          userId: user.id,
          action: "data_import",
          entityType: input.type,
          summary: `استيراد ${IMPORT_TYPE_LABELS[input.type]}: ${valid.length} سجلًا جديدًا (تم تخطي ${skipped}، فشل ${failed})`,
          details: {
            type: input.type,
            mode: input.mode,
            imported: valid.length,
            skipped,
            failed,
          },
        },
        tx,
      );
    });
  }

  const { rows, truncated } = toRowResults(analyzed);
  const body: ImportCommitResponse = {
    type: input.type,
    imported: valid.length,
    skipped,
    failed,
    rows,
    truncated,
  };
  res.json(body);
});

export default router;
