/**
 * Reversible, deterministic screenshot data for the existing Ghars clinic.
 *
 * This file is deliberately an explicit command-line script.  It is never
 * imported by the API server or run as part of a migration/startup hook.
 * Every generated row has a deterministic UUID; the patient file prefix and
 * UUID allow cleanup to prove ownership without a schema change.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  and,
  count,
  eq,
  ilike,
  inArray,
  sql,
} from "drizzle-orm";
import {
  boneGraftProceduresTable,
  caseChargesTable,
  caseDiscountsTable,
  communicationsTable,
  db,
  auditLogsTable,
  createProstheticEventWithStatusSync,
  synchronizedImplantStatus,
  type ProstheticAuditEntry,
  type ProstheticAuditWriter,
  implantCasesTable,
  implantSystemOptionsTable,
  implantsTable,
  installmentPlansTable,
  installmentsTable,
  patientsTable,
  paymentsTable,
  prostheticEventsTable,
  followupsTable,
  tenantMembershipsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import {
  CASE_STATUSES,
  calcPaymentStatus,
  CHARGE_TYPES,
  IMPLANT_STATUSES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  PROSTHETIC_EVENT_TYPES,
  toCents,
  FOLLOWUP_TYPES,
  FOLLOWUP_STATUSES,
  ADJUNCT_PROCEDURE_CATEGORIES,
  normalizeArabicSearchText,
  riyadhDateOf,
  splitInstallmentAmount,
  addCalendarMonths,
} from "@workspace/shared";

export const TARGET_REFERENCE_CODE = "clinic-9a76f31ec25e";
export const TARGET_TENANT_ID = "1d3a1ebf-3f78-43a2-a201-3e1b7e35a0bb";
export const TARGET_CLUSTER_FINGERPRINT = "38429c9ee06c55f9ec14264a1892f390";
export const TARGET_DATABASE_NAME = "heliumdb";
export const ANCHOR_DATE = "2026-09-12";
export const TIME_ZONE = "Asia/Riyadh";
export const SEED_BATCH = "ghars-screenshot-2026-09-12-v1";
export const TARGET_DOCTOR_ID = "367cfae2-82df-4056-b7ed-3469b0bc4153";
const FILE_PREFIX = "SS26-";
const SCREENSHOT_DATA_CONFIRMATION = SEED_BATCH;

export const SEED_COUNTS = {
  implantSystems: 5,
  patients: 36,
  cases: 42,
  implants: 72,
  adjunctProcedures: 20,
  grafts: 10,
  sinusLifts: 7,
  nerveRepositions: 3,
  prostheticEvents: 34,
  temporaryEvents: 14,
  finalEvents: 20,
  followups: 84,
  communications: 44,
  payments: 68,
  charges: 55,
  discounts: 14,
  installmentPlans: 4,
} as const;

export const SEEDED_SYSTEM_OPTIONS = [
  "ROT / Root",
  "Bio",
  "Neodent",
  "Neoss",
  "Ora",
] as const;

const SHOWCASE_NAMES = [
  "سارة عبدالله العتيبي",
  "خالد إبراهيم الحربي",
  "نورة محمد القحطاني",
  "ياسر فهد المطيري",
  "ريم صالح الغامدي",
  "مازن عبدالله الدوسري",
];

const SYNTHETIC_NAMES = [
  ...SHOWCASE_NAMES,
  "ليان أحمد الشهري",
  "عمر سعد الزهراني",
  "جود ناصر السبيعي",
  "عبدالعزيز تركي العبدالله",
  "هيا فواز العنزي",
  "فيصل راشد العتيبي",
  "مها عادل القرني",
  "تركي وليد الحربي",
  "دانة منصور المطيري",
  "سلمان نواف القحطاني",
  "لجين خالد الغامدي",
  "بدر حمد الدوسري",
  "شهد ماجد الزهراني",
  "راكان يوسف الشهري",
  "أروى طلال السبيعي",
  "نايف علي العنزي",
  "جنى عبدالمجيد العتيبي",
  "حسام سالم المطيري",
  "تالا مشعل القحطاني",
  "وليد سامي الغامدي",
  "غلا فهد الحربي",
  "مشاري ياسر الدوسري",
  "رزان عيسى الزهراني",
  "منيرة سعد الشهري",
  "أنس عادل السبيعي",
  "لمى ناصر العنزي",
  "عادل مروان العتيبي",
  "سلمى حازم المطيري",
  "باسل وليد القحطاني",
  "فرح ماجد الغامدي",
  "حمد راشد الحربي",
  "عبير فهد الدوسري",
  "ريان نواف الزهراني",
  "شيماء خالد الشهري",
  "سيف منصور السبيعي",
  "بسمة تركي العنزي",
].slice(0, SEED_COUNTS.patients);

const FDI_SITES = [
  "11", "12", "13", "14", "15", "16", "17", "21", "22", "23", "24",
  "25", "26", "27", "31", "32", "33", "34", "35", "36", "37", "41",
  "42", "43", "44", "45", "46", "47", "48",
];

export type TargetContext = {
  tenantId: string;
  doctorId: string;
  systems: string[];
  systemOptionRows: SystemOptionIdentity[];
};

type SystemOptionIdentity = {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
};

type SeedIds = {
  systemIds: string[];
  patientIds: string[];
  caseIds: string[];
  implantIds: string[];
  adjunctIds: string[];
  prostheticIds: string[];
  followupIds: string[];
  communicationIds: string[];
  paymentIds: string[];
  chargeIds: string[];
  discountIds: string[];
  planIds: string[];
  installmentIds: string[];
};

type SystemOptionInsert = typeof implantSystemOptionsTable.$inferInsert;
type PatientInsert = typeof patientsTable.$inferInsert;
type ImplantCaseInsert = typeof implantCasesTable.$inferInsert;
type ImplantInsert = typeof implantsTable.$inferInsert;
type AdjunctInsert = typeof boneGraftProceduresTable.$inferInsert;
type ProstheticInsert = typeof prostheticEventsTable.$inferInsert;
type FollowupInsert = typeof followupsTable.$inferInsert;
type CommunicationInsert = typeof communicationsTable.$inferInsert;
type ChargeInsert = typeof caseChargesTable.$inferInsert;
type DiscountInsert = typeof caseDiscountsTable.$inferInsert;
type PlanInsert = typeof installmentPlansTable.$inferInsert;
type InstallmentInsert = typeof installmentsTable.$inferInsert;
type PaymentInsert = typeof paymentsTable.$inferInsert;
type PlannedCase = ImplantCaseInsert & { _adjunctOnly: boolean };

export type PlannedData = {
  ids: SeedIds;
  systemOptions: SystemOptionInsert[];
  patients: PatientInsert[];
  cases: PlannedCase[];
  implants: ImplantInsert[];
  adjuncts: AdjunctInsert[];
  prosthetics: ProstheticInsert[];
  followups: FollowupInsert[];
  communications: CommunicationInsert[];
  charges: ChargeInsert[];
  discounts: DiscountInsert[];
  plans: PlanInsert[];
  installments: InstallmentInsert[];
  payments: PaymentInsert[];
};

/** Stable UUIDv4-shaped identifier derived from a batch-local key. */
export function seedUuid(kind: string, index: number): string {
  const bytes = createHash("sha256")
    .update(`${SEED_BATCH}:${kind}:${index}`)
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const SEEDED_SYSTEM_OPTION_IDS = SEEDED_SYSTEM_OPTIONS.map((_, index) =>
  seedUuid("implant-system-option", index),
);

function timestamp(date: string, hour = 9): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+03:00`);
}

function dateAtOffset(monthOffset: number, day: number): string {
  const month = 9 + monthOffset;
  const year = month > 12 ? 2026 : 2026;
  const normalized = month > 12 ? month - 12 : month;
  return `${year}-${String(normalized).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateForCase(index: number): string {
  if (index >= 38) return ANCHOR_DATE;
  if (index >= 34) return `2026-09-${String(2 + (index - 34) * 2).padStart(2, "0")}`;
  const month = index % 7; // March through August, with varied activity.
  const monthNumber = 3 + month;
  const day = Math.min(5 + (index * 3) % 22, monthNumber === 9 ? 12 : 28);
  return `2026-0${monthNumber}-${String(day).padStart(2, "0")}`;
}

function dateAfter(base: string, days: number): string {
  const date = new Date(`${base}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function notAfterAnchor(date: string): string {
  return date > ANCHOR_DATE ? ANCHOR_DATE : date;
}

function money(value: number): string {
  return value.toFixed(2);
}

function arrayIds(kind: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => seedUuid(kind, index));
}

function seedIds(): SeedIds {
  return {
    systemIds: SEEDED_SYSTEM_OPTION_IDS,
    patientIds: arrayIds("patient", SEED_COUNTS.patients),
    caseIds: arrayIds("case", SEED_COUNTS.cases),
    implantIds: arrayIds("implant", SEED_COUNTS.implants),
    adjunctIds: arrayIds("adjunct", SEED_COUNTS.adjunctProcedures),
    prostheticIds: arrayIds("prosthetic", SEED_COUNTS.prostheticEvents),
    followupIds: arrayIds("followup", SEED_COUNTS.followups),
    communicationIds: arrayIds("communication", SEED_COUNTS.communications),
    paymentIds: arrayIds("payment", SEED_COUNTS.payments),
    chargeIds: arrayIds("charge", SEED_COUNTS.charges),
    discountIds: arrayIds("discount", SEED_COUNTS.discounts),
    planIds: arrayIds("plan", SEED_COUNTS.installmentPlans),
    installmentIds: arrayIds("installment", 12),
  };
}

function patientIndexForCase(caseIndex: number): number {
  return caseIndex < 36 ? caseIndex : caseIndex - 36;
}

export function buildData(context: TargetContext): PlannedData {
  const ids = seedIds();
  const now = timestamp(ANCHOR_DATE, 18);
  const systemOptions: SystemOptionInsert[] = SEEDED_SYSTEM_OPTIONS.map((name, index) => ({
    id: ids.systemIds[index],
    tenantId: context.tenantId,
    name,
    isActive: true,
    sortOrder: index + 1,
    createdAt: now,
  }));
  const patients = SYNTHETIC_NAMES.map((fullName, index) => ({
    id: ids.patientIds[index],
    tenantId: context.tenantId,
    fileNumber: `${FILE_PREFIX}${String(index + 1).padStart(3, "0")}`,
    fullName,
    fullNameNormalized: normalizeArabicSearchText(fullName),
    mobileNumber: `000-TEST-${String(index + 1).padStart(4, "0")}`,
    mobileNormalized: `000TEST${String(index + 1).padStart(4, "0")}`,
    age: 22 + ((index * 7) % 49),
    administrativeNote: `ملف اصطناعي للقطات الشاشة — ${SEED_BATCH}`,
    createdBy: context.doctorId,
    updatedBy: context.doctorId,
    createdAt: timestamp(notAfterAnchor(dateAtOffset((index % 7) - 6, 3 + (index % 20)))),
    updatedAt: now,
  }));

  const adjunctOnlyCases = new Set([4, 18, 30]);
  const cases = Array.from({ length: SEED_COUNTS.cases }, (_, index) => {
    const procedureDate = dateForCase(index);
    const isShowcase = index < 6;
    const statuses = [
      "مكتمل", "مرحلة الالتئام", "تم تركيب مؤقت", "تم التركيب",
      "تحت المتابعة", "جاهز للتركيب", "تمت الزراعة", "تم تحديد موعد التركيب",
      "تحويل المؤقت إلى دائم", "مؤجل", "يحتاج تواصل", "حالة جديدة",
    ] as const;
    return {
      id: ids.caseIds[index],
      tenantId: context.tenantId,
      patientId: ids.patientIds[patientIndexForCase(index)],
      procedureDate,
      treatingDoctor: "د. همام",
      referringDoctor: index % 6 === 0 ? "د. خالد — إحالة اصطناعية" : null,
      caseStatus: statuses[index % statuses.length] as (typeof CASE_STATUSES)[number],
      prosValue: index % 3 === 0 ? "3M" : "2M",
      expectedProstheticDate: dateAfter(procedureDate, 35 + (index % 30)),
      baseTreatmentAmount: money(4200 + (index % 9) * 850),
      generalNote: isShowcase
        ? `مسار عرض اصطناعي ${String.fromCharCode(65 + index)} — ${SEED_BATCH}`
        : `خطة علاج اصطناعية متدرجة — ${SEED_BATCH}`,
      legacyCostNote: null,
      isReimplantation: false,
      reimplantationReason: null,
      sourceCaseId: null,
      createdBy: context.doctorId,
      updatedBy: context.doctorId,
      createdAt: timestamp(dateAfter(procedureDate, -2), 8),
      updatedAt: now,
      archivedAt: null,
      _adjunctOnly: adjunctOnlyCases.has(index),
    };
  });

  const implantCaseRows = cases.filter((row) => !row._adjunctOnly);
  const implants: ImplantInsert[] = [];
  let implantOrdinal = 0;
  let regularCaseOrdinal = 0;
  implantCaseRows.forEach((caseRow) => {
    const caseIndex = cases.indexOf(caseRow);
    const showcaseCounts = [1, 2, 3, 3, 0, 2];
    const implantCount =
      caseIndex < showcaseCounts.length
        ? showcaseCounts[caseIndex]
        : caseIndex >= 38
          ? 2
        : regularCaseOrdinal++ < 23
          ? 2
          : 1;
    for (let local = 0; local < implantCount; local += 1) {
      const implantId = ids.implantIds[implantOrdinal];
      const status =
        caseIndex >= 38
          ? "مزروعة"
          : (["تم التركيب", "مرحلة الالتئام", "جاهزة للتركيب", "تم تركيب مؤقت", "مزروعة"][
              (implantOrdinal + caseIndex) % 5
            ] as (typeof IMPLANT_STATUSES)[number]);
      const showcaseSites: Record<number, string[]> = {
        0: ["11"],
        1: ["35", "36"],
        2: ["16", "26", "27"],
        3: ["44", "45", "46"],
      };
      implants.push({
        id: implantId,
        tenantId: context.tenantId,
        implantCaseId: caseRow.id,
        site: showcaseSites[caseIndex]?.[local] ??
          FDI_SITES[(implantOrdinal + local * 4) % FDI_SITES.length],
        isCustomSite: false,
        system: context.systems.length ? context.systems[implantOrdinal % context.systems.length] : null,
        diameter: money(3.5 + ((implantOrdinal % 4) * 0.2)),
        length: money(9 + (implantOrdinal % 5)),
        qValue: null,
        formerValue: null,
        graftValue: null,
        graftProcedureType: null,
        graftNote: null,
        procedureTags: ["لقطة شاشة"],
        implantStatus: status,
        implantNote: "زرعة اصطناعية ببيانات اختبار آمنة",
        createdBy: context.doctorId,
        updatedBy: context.doctorId,
        createdAt: timestamp(caseRow.procedureDate as string, 10),
        updatedAt: now,
        archivedAt: null,
      });
      implantOrdinal += 1;
    }
  });

  const implantForCase = new Map<string, string>();
  implants.forEach((implant) => {
    if (!implantForCase.has(implant.implantCaseId as string)) {
      implantForCase.set(implant.implantCaseId as string, implant.id as string);
    }
  });

  const adjunctCaseIndexes = [
    4, 18, 30,
    1, 8, 9, 10, 11, 12, 13,
    2, 14, 15, 16, 17, 19, 20,
    21, 22, 23,
  ];
  const adjuncts: AdjunctInsert[] = Array.from({ length: SEED_COUNTS.adjunctProcedures }, (_, index) => {
    const categories = [
      ...Array(10).fill(ADJUNCT_PROCEDURE_CATEGORIES[0]),
      ...Array(7).fill(ADJUNCT_PROCEDURE_CATEGORIES[1]),
      ...Array(3).fill(ADJUNCT_PROCEDURE_CATEGORIES[2]),
    ] as string[];
    const category = categories[index];
    const caseIndex = adjunctCaseIndexes[index];
    const caseRow = cases[caseIndex];
    const candidateProcedureDate =
      index === 5 || index === 12
        ? (caseRow.procedureDate as string)
        : caseRow.procedureDate === ANCHOR_DATE
          ? ANCHOR_DATE
          : dateAfter(caseRow.procedureDate as string, index % 2 === 0 ? -8 : 5);
    const procedureDate =
      candidateProcedureDate > ANCHOR_DATE ? ANCHOR_DATE : candidateProcedureDate;
    return {
      id: ids.adjunctIds[index],
      tenantId: context.tenantId,
      implantCaseId: caseRow.id,
      implantId: implantForCase.get(caseRow.id as string) ?? null,
      procedureDate,
      procedureCategory: category,
      procedureType:
        category === "زراعة عظم"
          ? index % 2 ? "حفظ الحافة السنخية" : "تجديد عظمي موجه"
          : category === "رفع الجيب الفكي"
            ? "رفع جيب فكي جانبي"
            : "إبعاد العصب السنخي السفلي",
      procedureSide: category === "زراعة عظم" ? null : index % 2 ? "يمين" : "يسار",
      liftType: category === "رفع الجيب الفكي" ? (index % 2 ? "مفتوح" : "مغلق") : null,
      site: category === "زراعة عظم" ? `السن ${FDI_SITES[index % FDI_SITES.length]}` : "المنطقة الخلفية",
      material: category === "زراعة عظم" ? (index % 2 ? "مادة عظمية اصطناعية" : "طعم عظمي بشري معالج") : null,
      membrane: category === "زراعة عظم" ? (index % 3 ? "غشاء كولاجين" : "غشاء قابل للتحلل") : null,
      quantity: category === "زراعة عظم" ? `${1 + (index % 3)} cc` : null,
      size: category === "زراعة عظم" ? "متوسط" : null,
      treatingDoctor: "د. همام",
      procedureStatus: index % 5 === 0 ? "مخطط" : "تم",
      note: `إجراء مساند اصطناعي ${index + 1} — ${SEED_BATCH}`,
      createdBy: context.doctorId,
      updatedBy: context.doctorId,
      createdAt: timestamp(procedureDate, 11),
      updatedAt: now,
      archivedAt: null,
    };
  });

  const implantsByCase = new Map<string, ImplantInsert[]>();
  implants.forEach((implant) => {
    const rows = implantsByCase.get(implant.implantCaseId) ?? [];
    rows.push(implant);
    implantsByCase.set(implant.implantCaseId, rows);
  });
  const specialEvents: Array<{ caseIndex: number; implantIndex: number; eventType: (typeof PROSTHETIC_EVENT_TYPES)[number] }> = [
    { caseIndex: 0, implantIndex: 0, eventType: "تركيب دائم" },
    { caseIndex: 2, implantIndex: 0, eventType: "تركيب مؤقت" },
    { caseIndex: 2, implantIndex: 1, eventType: "تركيب مؤقت" },
    { caseIndex: 3, implantIndex: 0, eventType: "تركيب دائم" },
    { caseIndex: 3, implantIndex: 1, eventType: "تركيب دائم" },
    { caseIndex: 3, implantIndex: 2, eventType: "تركيب دائم" },
    { caseIndex: 5, implantIndex: 0, eventType: "تركيب دائم" },
  ];
  const selected = new Set<string>();
  const eventPlans: Array<{ implant: ImplantInsert; eventType: (typeof PROSTHETIC_EVENT_TYPES)[number] }> = [];
  for (const special of specialEvents) {
    const implant = implantsByCase.get(ids.caseIds[special.caseIndex])?.[special.implantIndex];
    if (!implant) throw new Error(`Invalid showcase prosthetic plan for case ${special.caseIndex}.`);
    selected.add(implant.id!);
    eventPlans.push({ implant, eventType: special.eventType });
  }
  for (const implant of implants) {
    if (eventPlans.length >= SEED_COUNTS.prostheticEvents || selected.has(implant.id!)) continue;
    eventPlans.push({
      implant,
      eventType: eventPlans.filter((item) => item.eventType === "تركيب مؤقت").length < SEED_COUNTS.temporaryEvents
        ? "تركيب مؤقت"
        : "تركيب دائم",
    });
    selected.add(implant.id!);
  }
  const prosthetics: ProstheticInsert[] = eventPlans.map(({ implant, eventType }, index) => {
    const caseRow = cases.find((row) => row.id === implant.implantCaseId)!;
    const candidateEventDate =
      index >= 30
        ? ANCHOR_DATE
        : dateAfter(caseRow.procedureDate as string, eventType === "تركيب مؤقت" ? 30 : 60);
    const eventDate = candidateEventDate > ANCHOR_DATE ? ANCHOR_DATE : candidateEventDate;
    return {
      id: ids.prostheticIds[index],
      tenantId: context.tenantId,
      implantCaseId: implant.implantCaseId,
      implantId: implant.id,
      eventType: eventType as (typeof PROSTHETIC_EVENT_TYPES)[number],
      eventDate,
      note: `توثيق ${eventType} اصطناعي — ${SEED_BATCH}`,
      createdBy: context.doctorId,
      createdAt: timestamp(eventDate, 13),
      archivedAt: null,
    };
  });

  const followups: FollowupInsert[] = Array.from({ length: SEED_COUNTS.followups }, (_, index) => {
    const caseRow = cases[index % cases.length];
    const patientId = caseRow.patientId as string;
    const bucket = index % 7;
    const status = caseRow.id === ids.caseIds[40]
      ? "مجدولة"
      : bucket === 2 || bucket === 3
        ? "تمت"
        : bucket === 4
          ? "تحتاج إعادة تواصل"
          : bucket === 5
            ? "لم يحضر"
            : "مجدولة";
    const rawScheduledDate =
      bucket === 0 ? ANCHOR_DATE :
        bucket === 1 ? dateAfter(ANCHOR_DATE, 7 + (index % 12)) :
          dateAfter(caseRow.procedureDate as string, 14 + (index % 50));
    const scheduledDate =
      ["تمت", "تحتاج إعادة تواصل", "لم يحضر"].includes(status)
        ? notAfterAnchor(rawScheduledDate)
        : rawScheduledDate;
    const createdDate = notAfterAnchor(dateAfter(scheduledDate, -1));
    return {
      id: ids.followupIds[index],
      tenantId: context.tenantId,
      implantCaseId: caseRow.id,
      patientId,
      followupType: FOLLOWUP_TYPES[index % FOLLOWUP_TYPES.length],
      followupStatus: status as (typeof FOLLOWUP_STATUSES)[number],
      scheduledAt: timestamp(scheduledDate, 10 + (index % 7)),
      result: status === "تمت" ? "الالتئام يسير بصورة طبيعية" : null,
      requiresContact: status === "تحتاج إعادة تواصل" || bucket === 0,
      contactDueAt: status === "تحتاج إعادة تواصل" || bucket === 0 ? timestamp(scheduledDate, 9) : null,
      nextAppointmentAt: status === "تمت" ? timestamp(dateAfter(scheduledDate, 30), 10) : null,
      note: `متابعة سريرية اصطناعية ${index + 1} — ${SEED_BATCH}`,
      assignedUserId: context.doctorId,
      createdBy: context.doctorId,
      createdAt: timestamp(createdDate, 8),
      updatedAt: now,
    };
  });

  const communications = Array.from({ length: SEED_COUNTS.communications }, (_, index) => {
    const caseRow = cases[index % cases.length];
    const patientId = caseRow.patientId as string;
    const communicationDate =
      index % 8 === 0
        ? ANCHOR_DATE
        : notAfterAnchor(dateAfter(caseRow.procedureDate as string, 10 + (index % 40)));
    return {
      id: ids.communicationIds[index],
      tenantId: context.tenantId,
      patientId,
      implantCaseId: caseRow.id,
      templateId: null,
      communicationReason: [
        "تذكير بالموعد", "متابعة زراعة", "استكمال العلاج", "موعد فائت",
        "متابعة بعد الإجراء", "تذكير مالي عام", "تواصل عام",
      ][index % 7],
      renderedMessage: "هذه رسالة اختبار اصطناعية للتذكير بالموعد.",
      openedAt: timestamp(communicationDate, 15),
      communicationResult: [
        "تم فتح واتساب", "تم التواصل", "أكد الموعد", "طلب تغيير الموعد",
      ][index % 4],
      resultNote: "سجل تواصل اصطناعي آمن.",
      userId: context.doctorId,
      createdAt: timestamp(communicationDate, 15),
    };
  });

  const charges = Array.from({ length: SEED_COUNTS.charges }, (_, index) => {
    const caseIndex = index % cases.length;
    const caseRow = cases[caseIndex];
    return {
      id: ids.chargeIds[index],
      tenantId: context.tenantId,
      implantCaseId: caseRow.id,
      implantId: index % 3 === 0 ? implantForCase.get(caseRow.id as string) ?? null : null,
      chargeType: (CHARGE_TYPES[index % CHARGE_TYPES.length]),
      description: index % 3 === 0 ? "رسم علاجي إضافي" : "خدمة سريرية مساندة",
      amount: money(250 + (index % 6) * 125),
      chargeDate: notAfterAnchor(dateAfter(caseRow.procedureDate as string, index % 20)),
      note: `رسم اصطناعي مستقل عن الإجراء السريري — ${SEED_BATCH}`,
      createdBy: context.doctorId,
      createdAt: timestamp(notAfterAnchor(dateAfter(caseRow.procedureDate as string, index % 20)), 16),
    };
  });

  const discounts = Array.from({ length: SEED_COUNTS.discounts }, (_, index) => {
    const caseRow = cases[index];
    const base = Number(caseRow.baseTreatmentAmount);
    const amount = index % 2 === 0 ? Math.round(base * 0.1) : 300 + index * 25;
    return {
      id: ids.discountIds[index],
      tenantId: context.tenantId,
      implantCaseId: caseRow.id,
      amount: money(amount),
      discountDate: notAfterAnchor(dateAfter(caseRow.procedureDate as string, 3)),
      reason: index % 2 === 0 ? "خصم موسمي بنسبة 10% (اصطناعي)" : "خصم متابعة (مبلغ ثابت اصطناعي)",
      approvedBy: context.doctorId,
      createdBy: context.doctorId,
      createdAt: timestamp(notAfterAnchor(dateAfter(caseRow.procedureDate as string, 3)), 16),
    };
  });

  const planCaseIndexes = [1, 2, 3, 5];
  const plans: PlanInsert[] = Array.from({ length: SEED_COUNTS.installmentPlans }, (_, index) => {
    const caseRow = cases[planCaseIndexes[index]];
    const amount = Math.round(Number(caseRow.baseTreatmentAmount) * 0.75);
    const firstDueDate = dateAfter(caseRow.procedureDate as string, 10);
    return {
      id: ids.planIds[index],
      tenantId: context.tenantId,
      implantCaseId: caseRow.id,
      totalAmount: money(amount),
      installmentCount: 3,
      firstDueDate,
      createdBy: context.doctorId,
      updatedBy: context.doctorId,
      createdAt: timestamp(notAfterAnchor(dateAfter(caseRow.procedureDate as string, 5)), 16),
      updatedAt: now,
    };
  });
  const installments: InstallmentInsert[] = plans.flatMap((plan, planIndex) => {
    const amounts = splitInstallmentAmount(Number(plan.totalAmount), plan.installmentCount);
    return amounts.map((amount, sequence) => ({
      id: ids.installmentIds[planIndex * 3 + sequence],
      tenantId: context.tenantId,
      planId: plan.id!,
      sequence: sequence + 1,
      dueDate: addCalendarMonths(plan.firstDueDate as string, sequence),
      amount: money(amount),
      createdAt: plan.createdAt,
      updatedAt: now,
    }));
  });

  // Two rows per first 26 cases and one per remaining case gives 68 rows.
  // Amounts intentionally cover paid, partial, unpaid, and overpaid states.
  const planIndexByCase = new Map(planCaseIndexes.map((caseIndex, planIndex) => [caseIndex, planIndex]));
  const payments: PaymentInsert[] = Array.from({ length: SEED_COUNTS.payments }, (_, index) => {
    const caseIndex = index < 52 ? Math.floor(index / 2) : index - 26;
    const caseRow = cases[caseIndex];
    const total = Math.max(
      0,
      Number(caseRow.baseTreatmentAmount) +
        charges.filter((charge) => charge.implantCaseId === caseRow.id).reduce((sum, charge) => sum + Number(charge.amount), 0) -
        discounts.filter((discount) => discount.implantCaseId === caseRow.id).reduce((sum, discount) => sum + Number(discount.amount), 0),
    );
    const paymentSequence = index < 52 ? index % 2 : 0;
    const category = caseIndex % 5;
    let amount = category === 0 ? total / (paymentSequence === 0 ? 2 : 2)
      : category === 1 ? total / 4
        : category === 2 ? 100
          : category === 3 ? total / 3
            : total;
    if (index === 1) amount = total / 2;
    if (index === 2) amount = 100;
    const planIndex = planIndexByCase.get(caseIndex);
    if (planIndex !== undefined) {
      // Keep linked payment rows within the canonical installment amount.
      amount = Math.min(amount, Number(installments[planIndex * 3].amount));
    }
    return {
      id: ids.paymentIds[index],
      tenantId: context.tenantId,
      implantCaseId: caseRow.id,
      installmentId: planIndex === undefined ? null : installments[planIndex * 3 + (paymentSequence % 2)].id,
      amount: money(Math.max(1, amount)),
      paymentDate:
        index % 9 === 0
          ? ANCHOR_DATE
          : notAfterAnchor(dateAfter(caseRow.procedureDate as string, 8 + (index % 35))),
      paymentLabel: PAYMENT_LABELS[paymentSequence % PAYMENT_LABELS.length],
      paymentMethod: PAYMENT_METHODS[index % PAYMENT_METHODS.length],
      referenceNumber: `TEST-PAY-${String(index + 1).padStart(3, "0")}`,
      note: `دفعة اصطناعية آمنة — ${SEED_BATCH}`,
      createdBy: context.doctorId,
      createdAt: timestamp(ANCHOR_DATE, 17),
      voidedAt: [2, 4, 5, 14].includes(index) ? timestamp(ANCHOR_DATE, 18) : null,
      voidedBy: [2, 4, 5, 14].includes(index) ? context.doctorId : null,
      voidReason: [2, 4, 5, 14].includes(index) ? "إلغاء اختبار اصطناعي" : null,
    };
  });

  return {
    ids,
    systemOptions,
    patients,
    cases,
    implants,
    adjuncts,
    prosthetics,
    followups,
    communications,
    charges,
    discounts,
    plans,
    installments,
    payments,
  };
}

export type ClinicalRowCounts = {
  implantSystems: number;
  patients: number;
  cases: number;
  implants: number;
  adjuncts: number;
  prosthetics: number;
  followups: number;
  communications: number;
  payments: number;
  charges: number;
  discounts: number;
  installmentPlans: number;
  installments: number;
};

export function assertClinicalRowsEmpty(counts: ClinicalRowCounts): void {
  const occupied = Object.entries(counts).filter(([, value]) => value !== 0);
  if (occupied.length) {
    throw new Error(
      `Refusing screenshot seed: target tenant already contains clinical/financial rows (${occupied
        .map(([name, value]) => `${name}=${value}`)
        .join(", ")}).`,
    );
  }
}

export function assertTargetDatabaseName(databaseName: string): void {
  if (databaseName !== TARGET_DATABASE_NAME) {
    throw new Error(
      `Refusing screenshot data command: current_database() must be ${TARGET_DATABASE_NAME}, observed ${databaseName || "<absent>"}.`,
    );
  }
}

export function assertTargetClusterFingerprint(fingerprint: string): void {
  if (fingerprint !== TARGET_CLUSTER_FINGERPRINT) {
    throw new Error(
      `Refusing screenshot data command: PostgreSQL cluster fingerprint mismatch (observed ${fingerprint || "<absent>"}).`,
    );
  }
}

export function validateScreenshotEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  runtimeDate = riyadhDateOf(new Date()),
): void {
  const nodeEnvironment = env.NODE_ENV?.trim().toLowerCase();
  const appEnvironment = env.APP_ENV?.trim().toLowerCase();
  const deployment = env.REPLIT_DEPLOYMENT?.trim().toLowerCase();
  if (env.SCREENSHOT_DATA_ENV !== "development") {
    throw new Error("Set SCREENSHOT_DATA_ENV=development explicitly for screenshot data commands.");
  }
  if (env.SCREENSHOT_DATA_CONFIRM !== SCREENSHOT_DATA_CONFIRMATION) {
    throw new Error("Set the exact SCREENSHOT_DATA_CONFIRM value before continuing.");
  }
  if (!env.REPLIT_DEV_DOMAIN?.trim()) {
    throw new Error("Refusing screenshot data command without REPLIT_DEV_DOMAIN.");
  }
  if (
    env.REPLIT_DEPLOYMENT !== undefined &&
    !["0", "false"].includes(deployment ?? "")
  ) {
    throw new Error(`Refusing screenshot data command for REPLIT_DEPLOYMENT=${deployment}.`);
  }
  if (
    nodeEnvironment !== "development" ||
    appEnvironment !== "development"
  ) {
    throw new Error("Refusing screenshot data command outside an explicit development environment.");
  }
  const approvedOverride = env.SCREENSHOT_DATA_DATE_OVERRIDE;
  if (approvedOverride && approvedOverride !== ANCHOR_DATE) {
    throw new Error(`Only the approved screenshot date override ${ANCHOR_DATE} is accepted.`);
  }
  if (runtimeDate !== ANCHOR_DATE && approvedOverride !== ANCHOR_DATE) {
    throw new Error(
      `Refusing screenshot data command: Riyadh date is ${runtimeDate}, expected ${ANCHOR_DATE}; set the approved SCREENSHOT_DATA_DATE_OVERRIDE explicitly.`,
    );
  }
}

function seededSystemIdentities(tenantId: string): SystemOptionIdentity[] {
  return SEEDED_SYSTEM_OPTIONS.map((name, index) => ({
    id: SEEDED_SYSTEM_OPTION_IDS[index],
    tenantId,
    name,
    isActive: true,
  }));
}

export function assertSeedSystemOptionsAvailable(
  rows: SystemOptionIdentity[],
): void {
  if (rows.length !== 0) {
    throw new Error(
      `Refusing screenshot seed: target tenant already has ${rows.length} implant system option row(s); refusing to modify existing lists.`,
    );
  }
}

export function assertSeedSystemOptionsExact(
  rows: SystemOptionIdentity[],
  tenantId: string,
): void {
  const expected = seededSystemIdentities(tenantId);
  if (
    rows.length !== expected.length ||
    expected.some((wanted) =>
      !rows.some(
        (actual) =>
          actual.id === wanted.id &&
          actual.tenantId === wanted.tenantId &&
          actual.name === wanted.name &&
          actual.isActive === wanted.isActive,
      ),
    )
  ) {
    throw new Error(
      "Refusing screenshot cleanup/validation: seeded implant system options do not exactly match their deterministic tenant-owned identities.",
    );
  }
}

function assertCleanupSystemOptions(
  rows: SystemOptionIdentity[],
  tenantId: string,
): boolean {
  const ownedRows = rows.filter((row) =>
    SEEDED_SYSTEM_OPTION_IDS.includes(row.id),
  );
  if (!ownedRows.length) return false;
  assertSeedSystemOptionsExact(ownedRows, tenantId);
  return true;
}

type CommandMode = "seed" | "cleanup" | "validate";

async function targetContext(mode: CommandMode): Promise<TargetContext> {
  validateScreenshotEnvironment();

  const clusterResult = await db.execute<{ cluster_fingerprint: string }>(
    sql`select md5(system_identifier::text) as cluster_fingerprint from pg_control_system()`,
  );
  assertTargetClusterFingerprint(clusterResult.rows[0]?.cluster_fingerprint ?? "");
  const databaseResult = await db.execute<{ database_name: string }>(
    sql`select current_database() as database_name`,
  );
  assertTargetDatabaseName(databaseResult.rows[0]?.database_name ?? "");
  const tenants = await db
    .select({ id: tenantsTable.id, status: tenantsTable.status, isInternal: tenantsTable.isInternal })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.id, TARGET_TENANT_ID),
        eq(tenantsTable.referenceCode, TARGET_REFERENCE_CODE),
      ),
    );
  if (
    tenants.length !== 1 ||
    tenants[0].id !== TARGET_TENANT_ID ||
    tenants[0].status !== "ACTIVE" ||
    tenants[0].isInternal
  ) {
    throw new Error(
      `Refusing screenshot data command: tenant ${TARGET_TENANT_ID} must match reference code ${TARGET_REFERENCE_CODE} and be active/non-internal.`,
    );
  }
  const tenant = tenants[0];
  const doctors = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName, role: tenantMembershipsTable.role })
    .from(usersTable)
    .innerJoin(
      tenantMembershipsTable,
      and(
        eq(tenantMembershipsTable.userId, usersTable.id),
        eq(tenantMembershipsTable.tenantId, tenant.id),
        eq(tenantMembershipsTable.isActive, true),
      ),
    )
    .where(and(eq(usersTable.id, TARGET_DOCTOR_ID), eq(usersTable.isActive, true)));
  if (
    doctors.length !== 1 ||
    !doctors[0].fullName.includes("همام") ||
    !["ADMIN", "DOCTOR"].includes(doctors[0].role)
  ) {
    throw new Error(
      `Refusing screenshot data command: immutable Dr. Humam user ${TARGET_DOCTOR_ID} is not one active ADMIN/DOCTOR membership in the target tenant.`,
    );
  }
  const systemOptionRows = await db
    .select({
      id: implantSystemOptionsTable.id,
      tenantId: implantSystemOptionsTable.tenantId,
      name: implantSystemOptionsTable.name,
      isActive: implantSystemOptionsTable.isActive,
    })
    .from(implantSystemOptionsTable)
    .where(eq(implantSystemOptionsTable.tenantId, tenant.id));
  if (mode === "seed") {
    assertSeedSystemOptionsAvailable(systemOptionRows);
    const globalOptionCollisions = await db
      .select({
        id: implantSystemOptionsTable.id,
        tenantId: implantSystemOptionsTable.tenantId,
        name: implantSystemOptionsTable.name,
      })
      .from(implantSystemOptionsTable)
      .where(inArray(implantSystemOptionsTable.id, SEEDED_SYSTEM_OPTION_IDS));
    if (globalOptionCollisions.length) {
      throw new Error(
        "Refusing screenshot seed: deterministic implant system option ID collision exists.",
      );
    }
  }
  return {
    tenantId: tenant.id,
    doctorId: doctors[0].id,
    systems: [...SEEDED_SYSTEM_OPTIONS],
    systemOptionRows:
      mode === "seed" ? seededSystemIdentities(tenant.id) : systemOptionRows,
  };
}

async function existingSeedPatients(tenantId: string) {
  return db
    .select({ id: patientsTable.id, fileNumber: patientsTable.fileNumber })
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.tenantId, tenantId),
        ilike(patientsTable.fileNumber, `${FILE_PREFIX}%`),
      ),
    );
}

async function assertNoSyntheticCollision(tenantId: string): Promise<void> {
  const existing = await db
    .select({ id: patientsTable.id, fullName: patientsTable.fullName, mobileNumber: patientsTable.mobileNumber })
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.tenantId, tenantId),
        inArray(patientsTable.fullName, SYNTHETIC_NAMES),
      ),
    );
  if (existing.length) {
    throw new Error(
      `Refusing screenshot seed: one or more synthetic names already exist in the target tenant (${existing.map((row) => row.fullName).join(", ")}).`,
    );
  }
  const testPhones = SYNTHETIC_NAMES.map((_, index) => `000-TEST-${String(index + 1).padStart(4, "0")}`);
  const existingPhones = await db
    .select({ id: patientsTable.id, mobileNumber: patientsTable.mobileNumber })
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.tenantId, tenantId),
        inArray(patientsTable.mobileNumber, testPhones),
      ),
    );
  if (existingPhones.length) {
    throw new Error("Refusing screenshot seed: a synthetic test phone is already present in the target tenant.");
  }
}

async function targetClinicalRowCounts(tenantId: string): Promise<ClinicalRowCounts> {
  const [systemOptions, patients, cases, implants, adjuncts, prosthetics, followups, communications, payments, charges, discounts, plans, installments] =
    await Promise.all([
      db.select({ count: count() }).from(implantSystemOptionsTable).where(eq(implantSystemOptionsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(patientsTable).where(eq(patientsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(implantCasesTable).where(eq(implantCasesTable.tenantId, tenantId)),
      db.select({ count: count() }).from(implantsTable).where(eq(implantsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(boneGraftProceduresTable).where(eq(boneGraftProceduresTable.tenantId, tenantId)),
      db.select({ count: count() }).from(prostheticEventsTable).where(eq(prostheticEventsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(followupsTable).where(eq(followupsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(communicationsTable).where(eq(communicationsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(paymentsTable).where(eq(paymentsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(caseChargesTable).where(eq(caseChargesTable.tenantId, tenantId)),
      db.select({ count: count() }).from(caseDiscountsTable).where(eq(caseDiscountsTable.tenantId, tenantId)),
      db.select({ count: count() }).from(installmentPlansTable).where(eq(installmentPlansTable.tenantId, tenantId)),
      db.select({ count: count() }).from(installmentsTable).where(eq(installmentsTable.tenantId, tenantId)),
    ]);
  return {
    implantSystems: Number(systemOptions[0]?.count ?? 0),
    patients: Number(patients[0]?.count ?? 0),
    cases: Number(cases[0]?.count ?? 0),
    implants: Number(implants[0]?.count ?? 0),
    adjuncts: Number(adjuncts[0]?.count ?? 0),
    prosthetics: Number(prosthetics[0]?.count ?? 0),
    followups: Number(followups[0]?.count ?? 0),
    communications: Number(communications[0]?.count ?? 0),
    payments: Number(payments[0]?.count ?? 0),
    charges: Number(charges[0]?.count ?? 0),
    discounts: Number(discounts[0]?.count ?? 0),
    installmentPlans: Number(plans[0]?.count ?? 0),
    installments: Number(installments[0]?.count ?? 0),
  };
}

function requirePlan(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Screenshot planner validation failed: ${message}`);
}

function plannedFinance(
  data: PlannedData,
  caseId: string,
): { finalCents: number; paidCents: number; status: string } {
  const caseRow = data.cases.find((row) => row.id === caseId);
  if (!caseRow) throw new Error(`Missing planned case ${caseId}.`);
  const charges = data.charges
    .filter((row) => row.implantCaseId === caseId)
    .reduce((sum, row) => sum + toCents(Number(row.amount)), 0);
  const discounts = data.discounts
    .filter((row) => row.implantCaseId === caseId)
    .reduce((sum, row) => sum + toCents(Number(row.amount)), 0);
  const paid = data.payments
    .filter((row) => row.implantCaseId === caseId && !row.voidedAt)
    .reduce((sum, row) => sum + toCents(Number(row.amount)), 0);
  const finalCents = toCents(Number(caseRow.baseTreatmentAmount)) + charges - discounts;
  return {
    finalCents,
    paidCents: paid,
    status: calcPaymentStatus({ finalTotalCents: finalCents, paidCents: paid, caseStatus: caseRow.caseStatus! }),
  };
}

export function validatePlannedData(context: TargetContext, data: PlannedData): void {
  requirePlan(data.systemOptions.length === SEED_COUNTS.implantSystems, "implant system option count");
  requirePlan(
    data.systemOptions.every(
      (row, index) =>
        row.id === SEEDED_SYSTEM_OPTION_IDS[index] &&
        row.tenantId === context.tenantId &&
        row.name === SEEDED_SYSTEM_OPTIONS[index] &&
        row.isActive === true,
    ),
    "deterministic implant system options",
  );
  requirePlan(data.patients.length === SEED_COUNTS.patients, "patient count");
  requirePlan(data.cases.length === SEED_COUNTS.cases, "case count");
  requirePlan(data.implants.length === SEED_COUNTS.implants, "implant count");
  requirePlan(data.adjuncts.length === SEED_COUNTS.adjunctProcedures, "adjunct count");
  requirePlan(data.prosthetics.length === SEED_COUNTS.prostheticEvents, "prosthetic count");
  requirePlan(data.followups.length === SEED_COUNTS.followups, "followup count");
  requirePlan(data.communications.length === SEED_COUNTS.communications, "communication count");
  requirePlan(data.payments.length === SEED_COUNTS.payments, "payment count");
  requirePlan(data.charges.length === SEED_COUNTS.charges, "charge count");
  requirePlan(data.discounts.length === SEED_COUNTS.discounts, "discount count");
  requirePlan(data.plans.length === SEED_COUNTS.installmentPlans, "installment plan count");

  const caseIds = new Set(data.cases.map((row) => row.id));
  const implantIds = new Set(data.implants.map((row) => row.id));
  const implantsByCase = new Map<string, number>();
  data.implants.forEach((row) => implantsByCase.set(row.implantCaseId, (implantsByCase.get(row.implantCaseId) ?? 0) + 1));
  requirePlan(data.cases.filter((row) => !implantsByCase.has(row.id!)).length >= 2 && data.cases.filter((row) => !implantsByCase.has(row.id!)).length <= 4, "2-4 adjunct-only cases");

  const grafts = data.adjuncts.filter((row) => row.procedureCategory === ADJUNCT_PROCEDURE_CATEGORIES[0]);
  const sinus = data.adjuncts.filter((row) => row.procedureCategory === ADJUNCT_PROCEDURE_CATEGORIES[1]);
  const nerves = data.adjuncts.filter((row) => row.procedureCategory === ADJUNCT_PROCEDURE_CATEGORIES[2]);
  requirePlan(grafts.length === 10 && sinus.length === 7 && nerves.length === 3, "adjunct category counts");
  requirePlan(grafts.some((row) => row.implantId && implantIds.has(row.implantId)), "implant-linked graft");
  requirePlan(sinus.some((row) => row.implantId && implantIds.has(row.implantId)), "implant-linked sinus lift");
  requirePlan(data.adjuncts.some((row) => row.procedureDate < (data.cases.find((c) => c.id === row.implantCaseId)?.procedureDate ?? "")), "pre-placement adjunct");
  requirePlan(data.adjuncts.some((row) => row.procedureDate === data.cases.find((c) => c.id === row.implantCaseId)?.procedureDate), "simultaneous adjunct");
  requirePlan(data.adjuncts.some((row) => row.procedureDate > (data.cases.find((c) => c.id === row.implantCaseId)?.procedureDate ?? "")), "after-placement adjunct");

  requirePlan(data.cases.every((row) => CASE_STATUSES.includes(row.caseStatus as (typeof CASE_STATUSES)[number])), "canonical case statuses");
  requirePlan(data.implants.every((row) => IMPLANT_STATUSES.includes(row.implantStatus as (typeof IMPLANT_STATUSES)[number])), "canonical implant statuses");
  requirePlan(data.prosthetics.every((row) => PROSTHETIC_EVENT_TYPES.includes(row.eventType as (typeof PROSTHETIC_EVENT_TYPES)[number])), "canonical prosthetic event types");
  requirePlan(data.followups.every((row) => FOLLOWUP_TYPES.includes(row.followupType as (typeof FOLLOWUP_TYPES)[number]) && FOLLOWUP_STATUSES.includes(row.followupStatus as (typeof FOLLOWUP_STATUSES)[number])), "canonical followup values");
  requirePlan(data.payments.every((row) => PAYMENT_LABELS.includes(row.paymentLabel as (typeof PAYMENT_LABELS)[number]) && PAYMENT_METHODS.includes(row.paymentMethod as (typeof PAYMENT_METHODS)[number])), "canonical payment values");
  requirePlan(data.adjuncts.every((row) => ADJUNCT_PROCEDURE_CATEGORIES.includes(row.procedureCategory as (typeof ADJUNCT_PROCEDURE_CATEGORIES)[number])), "canonical adjunct values");

  const plansById = new Map(data.plans.map((row) => [row.id!, row]));
  const installmentsByPlan = new Map<string, InstallmentInsert[]>();
  data.installments.forEach((row) => {
    const rows = installmentsByPlan.get(row.planId) ?? [];
    rows.push(row);
    installmentsByPlan.set(row.planId, rows);
  });
  requirePlan(data.installments.length === 12, "installment count");
  for (const plan of data.plans) {
    const rows = installmentsByPlan.get(plan.id!);
    requirePlan(Boolean(rows), `installments for ${plan.id}`);
    const planRows = rows ?? [];
    requirePlan(planRows.length === plan.installmentCount, `installments for ${plan.id}`);
    const sum = planRows.reduce((total, row) => total + toCents(Number(row.amount)), 0);
    requirePlan(sum === toCents(Number(plan.totalAmount)), `installment cent sum for ${plan.id}`);
    planRows.forEach((row, index) => requirePlan(row.dueDate === addCalendarMonths(plan.firstDueDate, index), `installment calendar for ${row.id}`));
  }
  data.payments.forEach((payment) => {
    if (!payment.installmentId) return;
    const installment = data.installments.find((row) => row.id === payment.installmentId);
    requirePlan(Boolean(installment) && plansById.has(installment!.planId), `payment installment FK ${payment.id}`);
  });

  const showcase = data.cases.slice(0, 6);
  requirePlan((data.implants.filter((row) => row.implantCaseId === showcase[0].id)).length === 1, "showcase A single implant");
  requirePlan(showcase[0].caseStatus === "مكتمل" && data.prosthetics.some((row) => row.implantCaseId === showcase[0].id && row.eventType === "تركيب دائم"), "showcase A completed final");
  requirePlan(plannedFinance(data, showcase[0].id!).paidCents === plannedFinance(data, showcase[0].id!).finalCents, "showcase A fully paid");
  requirePlan((data.implants.filter((row) => row.implantCaseId === showcase[1].id)).length === 2 && showcase[1].caseStatus === "مرحلة الالتئام" && data.adjuncts.some((row) => row.implantCaseId === showcase[1].id && row.procedureCategory === "زراعة عظم"), "showcase B");
  const financeB = plannedFinance(data, showcase[1].id!);
  requirePlan(financeB.paidCents > 0 && financeB.paidCents < financeB.finalCents, "showcase B partial payment");
  requirePlan((data.implants.filter((row) => row.implantCaseId === showcase[2].id)).length >= 3 && data.adjuncts.some((row) => row.implantCaseId === showcase[2].id && row.procedureCategory === "رفع الجيب الفكي") && data.prosthetics.some((row) => row.implantCaseId === showcase[2].id && row.eventType === "تركيب مؤقت"), "showcase C");
  requirePlan((data.implants.filter((row) => row.implantCaseId === showcase[3].id)).length >= 3 && data.prosthetics.filter((row) => row.implantCaseId === showcase[3].id && row.eventType === "تركيب دائم").length >= 2 && data.payments.filter((row) => row.implantCaseId === showcase[3].id && !row.voidedAt).length >= 2, "showcase D");
  const showcaseE = showcase[4]!;
  const laterCase = data.cases[40]!;
  requirePlan(!implantsByCase.has(showcaseE.id!) && data.implants.some((row) => row.implantCaseId === laterCase.id) && laterCase.patientId === showcaseE.patientId && laterCase.procedureDate! >= showcaseE.procedureDate! && data.followups.some((row) => row.implantCaseId === laterCase.id && row.followupStatus === "مجدولة"), "showcase E");
  requirePlan(data.charges.some((row) => row.implantCaseId === showcase[5].id) && data.discounts.some((row) => row.implantCaseId === showcase[5].id) && data.followups.filter((row) => row.implantCaseId === showcase[5].id).length >= 2, "showcase F");

  const todayCases = data.cases.filter((row) => row.procedureDate === ANCHOR_DATE);
  const monthCases = data.cases.filter((row) => (row.procedureDate ?? "") >= "2026-09-01" && (row.procedureDate ?? "") <= ANCHOR_DATE);
  requirePlan(todayCases.length >= 4 && data.implants.filter((row) => todayCases.some((c) => c.id === row.implantCaseId)).length >= 8, "today implant KPI");
  requirePlan(data.prosthetics.filter((row) => row.eventDate === ANCHOR_DATE).length >= 4, "today prosthetic KPI");
  requirePlan(monthCases.length >= 8 && data.implants.filter((row) => monthCases.some((c) => c.id === row.implantCaseId)).length >= 12, "current-month KPI");
  requirePlan(
    context.systems.length === SEED_COUNTS.implantSystems &&
      context.systems.every((name, index) => name === SEEDED_SYSTEM_OPTIONS[index]),
    "configured systems",
  );

  const rowsWithDates = [...data.patients, ...data.cases, ...data.implants, ...data.adjuncts, ...data.followups, ...data.communications, ...data.charges, ...data.discounts, ...data.plans, ...data.installments, ...data.payments] as Array<{ id?: string; createdAt?: Date; updatedAt?: Date }>;
  rowsWithDates.forEach((row) => {
    if (row.createdAt && row.updatedAt) requirePlan(row.createdAt <= row.updatedAt, `createdAt <= updatedAt for ${row.id}`);
  });
  data.followups.forEach((row) => {
    const scheduled = row.scheduledAt!;
    requirePlan(row.createdAt! <= row.updatedAt!, `followup timestamps ${row.id}`);
    if (row.followupStatus === "تمت" || row.followupStatus === "لم يحضر" || row.followupStatus === "تحتاج إعادة تواصل") {
      requirePlan(riyadhDateOf(scheduled) <= ANCHOR_DATE, `closed followup chronology ${row.id}`);
    }
  });
  for (const caseRow of data.cases) {
    const finance = plannedFinance(data, caseRow.id!);
    requirePlan(finance.finalCents >= 0 && typeof finance.status === "string", `finance ${caseRow.id}`);
  }
  requirePlan(caseIds.size === SEED_COUNTS.cases, "unique case IDs");
}

async function seed(): Promise<void> {
  const context = await targetContext("seed");
  assertClinicalRowsEmpty(await targetClinicalRowCounts(context.tenantId));
  const existing = await existingSeedPatients(context.tenantId);
  if (existing.length > 0) {
    throw new Error(
      `Screenshot seed batch already exists (${existing.length} patients). Run validate or cleanup; refusing to duplicate it.`,
    );
  }
  await assertNoSyntheticCollision(context.tenantId);
  const data = buildData(context);
  validatePlannedData(context, data);
  const caseRowsForInsert = data.cases.map(({ _adjunctOnly: _ignored, ...row }) => row);
  const writeSeedAudit: ProstheticAuditWriter = async (
    entry: ProstheticAuditEntry,
    writer,
  ) => {
    await writer.insert(auditLogsTable).values({
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      details: entry.details ?? null,
    });
  };
  await db.transaction(async (tx) => {
    await tx.insert(implantSystemOptionsTable).values(data.systemOptions);
    await tx.insert(patientsTable).values(data.patients);
    await tx.insert(implantCasesTable).values(caseRowsForInsert);
    await tx.insert(implantsTable).values(data.implants);
    await tx.insert(boneGraftProceduresTable).values(data.adjuncts);
    for (const planned of data.prosthetics) {
      await createProstheticEventWithStatusSync(
        tx,
        {
          id: planned.id,
          tenantId: planned.tenantId,
          implantCaseId: planned.implantCaseId,
          implantId: planned.implantId ?? null,
          eventType: planned.eventType as (typeof PROSTHETIC_EVENT_TYPES)[number],
          eventDate: planned.eventDate,
          note: planned.note ?? null,
          createdBy: planned.createdBy!,
          createdAt: planned.createdAt,
          updatedAt: timestamp(ANCHOR_DATE, 18),
        },
        writeSeedAudit,
      );
    }
    await tx.insert(followupsTable).values(data.followups);
    await tx.insert(communicationsTable).values(data.communications);
    await tx.insert(caseChargesTable).values(data.charges);
    await tx.insert(caseDiscountsTable).values(data.discounts);
    await tx.insert(installmentPlansTable).values(data.plans);
    await tx.insert(installmentsTable).values(data.installments);
    await tx.insert(paymentsTable).values(data.payments);
  });
  console.info(JSON.stringify({ batch: SEED_BATCH, tenant: TARGET_REFERENCE_CODE, ...SEED_COUNTS }));
}

async function cleanup(): Promise<void> {
  const context = await targetContext("cleanup");
  const data = buildData(context);
  const existing = await existingSeedPatients(context.tenantId);
  const ownsSystemOptions = assertCleanupSystemOptions(
    context.systemOptionRows,
    context.tenantId,
  );
  if (!existing.length && !ownsSystemOptions) {
    console.info(JSON.stringify({ batch: SEED_BATCH, status: "already-clean" }));
    return;
  }
  if (existing.length && !ownsSystemOptions) {
    throw new Error(
      "Refusing cleanup: seeded patients exist but deterministic implant system options are missing.",
    );
  }
  const expectedPatients = new Set(data.ids.patientIds);
  if (existing.some((row) => !expectedPatients.has(row.id) || !row.fileNumber.startsWith(FILE_PREFIX))) {
    throw new Error("Refusing cleanup: a screenshot-looking file number is not owned by this deterministic batch.");
  }

  await db.transaction(async (tx) => {
    // The pinned tenant is dedicated to screenshot/demo use. Delete every
    // tenant-owned clinical/financial row so manually-added screenshot smoke
    // records cannot keep deterministic parents alive through foreign keys.
    // Children remain first and every predicate remains tenant-scoped.
    await tx.delete(paymentsTable).where(eq(paymentsTable.tenantId, context.tenantId));
    await tx.delete(installmentsTable).where(eq(installmentsTable.tenantId, context.tenantId));
    await tx.delete(installmentPlansTable).where(eq(installmentPlansTable.tenantId, context.tenantId));
    await tx.delete(auditLogsTable).where(eq(auditLogsTable.tenantId, context.tenantId));
    await tx.delete(communicationsTable).where(eq(communicationsTable.tenantId, context.tenantId));
    await tx.delete(followupsTable).where(eq(followupsTable.tenantId, context.tenantId));
    await tx.delete(prostheticEventsTable).where(
      eq(prostheticEventsTable.tenantId, context.tenantId),
    );
    await tx.delete(boneGraftProceduresTable).where(
      eq(boneGraftProceduresTable.tenantId, context.tenantId),
    );
    await tx.delete(caseChargesTable).where(eq(caseChargesTable.tenantId, context.tenantId));
    await tx.delete(caseDiscountsTable).where(eq(caseDiscountsTable.tenantId, context.tenantId));
    await tx.delete(implantsTable).where(eq(implantsTable.tenantId, context.tenantId));
    await tx.delete(implantCasesTable).where(eq(implantCasesTable.tenantId, context.tenantId));
    await tx.delete(patientsTable).where(eq(patientsTable.tenantId, context.tenantId));
    if (ownsSystemOptions) {
      await tx.delete(implantSystemOptionsTable).where(
        and(
          eq(implantSystemOptionsTable.tenantId, context.tenantId),
          inArray(implantSystemOptionsTable.id, data.ids.systemIds),
        ),
      );
    }
  });
  console.info(JSON.stringify({ batch: SEED_BATCH, tenant: TARGET_REFERENCE_CODE, status: "cleaned" }));
}

async function validate(): Promise<void> {
  const context = await targetContext("validate");
  const data = buildData(context);
  validatePlannedData(context, data);
  const [systemOptions, patients, cases, implants, adjuncts, prosthetics, followups, communications, payments, charges, discounts, plans] =
    await Promise.all([
      db.select().from(implantSystemOptionsTable).where(and(eq(implantSystemOptionsTable.tenantId, context.tenantId), inArray(implantSystemOptionsTable.id, data.ids.systemIds))),
      db.select().from(patientsTable).where(and(eq(patientsTable.tenantId, context.tenantId), inArray(patientsTable.id, data.ids.patientIds))),
      db.select().from(implantCasesTable).where(and(eq(implantCasesTable.tenantId, context.tenantId), inArray(implantCasesTable.id, data.ids.caseIds))),
      db.select().from(implantsTable).where(and(eq(implantsTable.tenantId, context.tenantId), inArray(implantsTable.id, data.ids.implantIds))),
      db.select().from(boneGraftProceduresTable).where(and(eq(boneGraftProceduresTable.tenantId, context.tenantId), inArray(boneGraftProceduresTable.id, data.ids.adjunctIds))),
      db.select().from(prostheticEventsTable).where(and(eq(prostheticEventsTable.tenantId, context.tenantId), inArray(prostheticEventsTable.id, data.ids.prostheticIds))),
      db.select().from(followupsTable).where(and(eq(followupsTable.tenantId, context.tenantId), inArray(followupsTable.id, data.ids.followupIds))),
      db.select().from(communicationsTable).where(and(eq(communicationsTable.tenantId, context.tenantId), inArray(communicationsTable.id, data.ids.communicationIds))),
      db.select().from(paymentsTable).where(and(eq(paymentsTable.tenantId, context.tenantId), inArray(paymentsTable.id, data.ids.paymentIds))),
      db.select().from(caseChargesTable).where(and(eq(caseChargesTable.tenantId, context.tenantId), inArray(caseChargesTable.id, data.ids.chargeIds))),
      db.select().from(caseDiscountsTable).where(and(eq(caseDiscountsTable.tenantId, context.tenantId), inArray(caseDiscountsTable.id, data.ids.discountIds))),
      db.select().from(installmentPlansTable).where(and(eq(installmentPlansTable.tenantId, context.tenantId), inArray(installmentPlansTable.id, data.ids.planIds))),
    ]);
  const installments = await db
    .select()
    .from(installmentsTable)
    .where(and(eq(installmentsTable.tenantId, context.tenantId), inArray(installmentsTable.id, data.ids.installmentIds)));
  const counts = {
    implantSystems: systemOptions.length,
    patients: patients.length,
    cases: cases.length,
    implants: implants.length,
    adjunctProcedures: adjuncts.length,
    grafts: adjuncts.filter((row) => row.procedureCategory === "زراعة عظم").length,
    sinusLifts: adjuncts.filter((row) => row.procedureCategory === "رفع الجيب الفكي").length,
    nerveRepositions: adjuncts.filter((row) => row.procedureCategory === "إبعاد / نقل العصب السنخي السفلي").length,
    prostheticEvents: prosthetics.length,
    temporaryEvents: prosthetics.filter((row) => row.eventType === "تركيب مؤقت").length,
    finalEvents: prosthetics.filter((row) => row.eventType === "تركيب دائم").length,
    followups: followups.length,
    communications: communications.length,
    payments: payments.length,
    charges: charges.length,
    discounts: discounts.length,
    installmentPlans: plans.length,
  };
  const expected = { ...SEED_COUNTS };
  const countMismatch = Object.entries(expected).filter(([key, value]) => counts[key as keyof typeof counts] !== value);
  const patientIds = new Set(patients.map((row) => row.id));
  const caseIds = new Set(cases.map((row) => row.id));
  const implantIds = new Set(implants.map((row) => row.id));
  const implantsById = new Map(implants.map((row) => [row.id, row]));
  const fkErrors = [
    ...cases.filter((row) => !patientIds.has(row.patientId)).map((row) => `case:${row.id}`),
    ...implants.filter((row) => !caseIds.has(row.implantCaseId)).map((row) => `implant:${row.id}`),
    ...adjuncts.filter((row) => !caseIds.has(row.implantCaseId) || (row.implantId && !implantIds.has(row.implantId))).map((row) => `adjunct:${row.id}`),
    ...prosthetics.filter((row) => !caseIds.has(row.implantCaseId) || (row.implantId && !implantIds.has(row.implantId))).map((row) => `prosthetic:${row.id}`),
    ...followups.filter((row) => !caseIds.has(row.implantCaseId) || !patientIds.has(row.patientId)).map((row) => `followup:${row.id}`),
    ...communications.filter((row) => !patientIds.has(row.patientId) || (row.implantCaseId && !caseIds.has(row.implantCaseId))).map((row) => `communication:${row.id}`),
    ...payments.filter((row) => !caseIds.has(row.implantCaseId)).map((row) => `payment:${row.id}`),
    ...charges.filter((row) => !caseIds.has(row.implantCaseId) || (row.implantId && !implantIds.has(row.implantId))).map((row) => `charge:${row.id}`),
    ...discounts.filter((row) => !caseIds.has(row.implantCaseId)).map((row) => `discount:${row.id}`),
    ...plans.filter((row) => !caseIds.has(row.implantCaseId)).map((row) => `plan:${row.id}`),
    ...installments.filter((row) => !plans.some((plan) => plan.id === row.planId)).map((row) => `installment:${row.id}`),
  ];
  const chronologyErrors = [
    ...prosthetics
      .filter((row) => {
        const implant = row.implantId ? implantsById.get(row.implantId) : undefined;
        const caseRow = cases.find((candidate) => candidate.id === row.implantCaseId);
        return !implant || !caseRow ||
          row.eventDate < (caseRow.procedureDate as string) ||
        implant.implantStatus !== synchronizedImplantStatus(row.eventType as (typeof PROSTHETIC_EVENT_TYPES)[number]);
      })
      .map((row) => `prosthetic-chronology:${row.id}`),
    ...adjuncts
      .filter((row) => {
        const caseRow = cases.find((candidate) => candidate.id === row.implantCaseId);
        return !caseRow || row.procedureDate > ANCHOR_DATE;
      })
      .map((row) => `adjunct-chronology:${row.id}`),
  ];
  const markerErrors = patients
    .filter((row) => !row.fileNumber.startsWith(FILE_PREFIX))
    .map((row) => `patient-marker:${row.id}`);
  let systemOptionErrors: string[] = [];
  try {
    assertSeedSystemOptionsExact(context.systemOptionRows, context.tenantId);
  } catch {
    systemOptionErrors = ["implant-system-options"];
  }

  const chargesByCase = new Map<string, number>();
  charges.forEach((row) => chargesByCase.set(row.implantCaseId, (chargesByCase.get(row.implantCaseId) ?? 0) + toCents(Number(row.amount))));
  const discountsByCase = new Map<string, number>();
  discounts.forEach((row) => discountsByCase.set(row.implantCaseId, (discountsByCase.get(row.implantCaseId) ?? 0) + toCents(Number(row.amount))));
  const paymentsByCase = new Map<string, number>();
  payments.forEach((row) => {
    if (!row.voidedAt) paymentsByCase.set(row.implantCaseId, (paymentsByCase.get(row.implantCaseId) ?? 0) + toCents(Number(row.amount)));
  });
  const financialErrors: string[] = [];
  cases.forEach((row) => {
    const finalCents = toCents(Number(row.baseTreatmentAmount)) + (chargesByCase.get(row.id) ?? 0) - (discountsByCase.get(row.id) ?? 0);
    const paidCents = paymentsByCase.get(row.id) ?? 0;
    const status = calcPaymentStatus({ finalTotalCents: finalCents, paidCents, caseStatus: row.caseStatus });
    if (finalCents < 0 || !status) financialErrors.push(`finance:${row.id}`);
  });
  const runtimeErrors: string[] = [];
  for (const plan of plans) {
    const rows = installments.filter((row) => row.planId === plan.id);
    if (rows.length !== plan.installmentCount) runtimeErrors.push(`installment-count:${plan.id}`);
    const sum = rows.reduce((total, row) => total + toCents(Number(row.amount)), 0);
    if (sum !== toCents(Number(plan.totalAmount))) runtimeErrors.push(`installment-sum:${plan.id}`);
    rows.forEach((row, index) => {
      if (row.dueDate !== addCalendarMonths(plan.firstDueDate, index)) runtimeErrors.push(`installment-date:${row.id}`);
    });
  }
  if (cases.filter((row) => row.procedureDate === ANCHOR_DATE).length < 4) runtimeErrors.push("today-cases");
  const todayPatientIds = new Set(cases.filter((row) => row.procedureDate === ANCHOR_DATE).map((row) => row.patientId));
  if (todayPatientIds.size < 4) runtimeErrors.push("today-patients");
  if (implants.filter((row) => cases.some((caseRow) => caseRow.id === row.implantCaseId && caseRow.procedureDate === ANCHOR_DATE)).length < 8) runtimeErrors.push("today-implants");
  if (prosthetics.filter((row) => row.eventDate === ANCHOR_DATE).length < 4) runtimeErrors.push("today-prosthetics");
  if (payments.filter((row) => row.paymentDate === ANCHOR_DATE).length < 4) runtimeErrors.push("today-payments");
  if (followups.filter((row) => row.scheduledAt && riyadhDateOf(row.scheduledAt) === ANCHOR_DATE).length < 4) runtimeErrors.push("today-followups");
  if (cases.filter((row) => (row.procedureDate ?? "") >= "2026-09-01" && (row.procedureDate ?? "") <= ANCHOR_DATE).length < 8) runtimeErrors.push("month-cases");
  if (payments.filter((row) => row.paymentDate >= "2026-09-01" && row.paymentDate <= ANCHOR_DATE).length < 8) runtimeErrors.push("month-payments");
  if (followups.filter((row) => row.scheduledAt && riyadhDateOf(row.scheduledAt) >= "2026-09-01" && riyadhDateOf(row.scheduledAt) <= ANCHOR_DATE).length < 8) runtimeErrors.push("month-followups");
  const actualImplantsByCase = new Set(implants.map((row) => row.implantCaseId));
  const actualAdjunctOnlyCases = cases.filter((row) => !actualImplantsByCase.has(row.id)).length;
  if (actualAdjunctOnlyCases < 2 || actualAdjunctOnlyCases > 4) runtimeErrors.push("adjunct-only-case-count");
  if (implants.some((row) => !IMPLANT_STATUSES.includes(row.implantStatus as (typeof IMPLANT_STATUSES)[number]))) runtimeErrors.push("implant-enum");
  if (cases.some((row) => !CASE_STATUSES.includes(row.caseStatus as (typeof CASE_STATUSES)[number]))) runtimeErrors.push("case-enum");
  if (prosthetics.some((row) => !PROSTHETIC_EVENT_TYPES.includes(row.eventType as (typeof PROSTHETIC_EVENT_TYPES)[number]))) runtimeErrors.push("prosthetic-enum");
  if (followups.some((row) => !FOLLOWUP_TYPES.includes(row.followupType as (typeof FOLLOWUP_TYPES)[number]) || !FOLLOWUP_STATUSES.includes(row.followupStatus as (typeof FOLLOWUP_STATUSES)[number]) || row.createdAt > row.updatedAt)) runtimeErrors.push("followup-enum-or-chronology");
  for (const rows of [patients, cases, implants, adjuncts, followups, plans, installments]) {
    if (rows.some((row) => row.createdAt && row.updatedAt && row.createdAt > row.updatedAt)) runtimeErrors.push("created-at-after-updated-at");
  }
  const runtimeShowcase = cases.slice().sort((a, b) => data.ids.caseIds.indexOf(a.id) - data.ids.caseIds.indexOf(b.id)).slice(0, 6);
  if (runtimeShowcase.length !== 6) runtimeErrors.push("showcase-count");
  if (runtimeShowcase[0] && implants.filter((row) => row.implantCaseId === runtimeShowcase[0].id).length !== 1) runtimeErrors.push("showcase-a");
  if (runtimeShowcase[1] && implants.filter((row) => row.implantCaseId === runtimeShowcase[1].id).length !== 2) runtimeErrors.push("showcase-b");
  if (runtimeShowcase[2] && (!adjuncts.some((row) => row.implantCaseId === runtimeShowcase[2].id && row.procedureCategory === "رفع الجيب الفكي") || !prosthetics.some((row) => row.implantCaseId === runtimeShowcase[2].id && row.eventType === "تركيب مؤقت"))) runtimeErrors.push("showcase-c");
  if (runtimeShowcase[3] && prosthetics.filter((row) => row.implantCaseId === runtimeShowcase[3].id && row.eventType === "تركيب دائم").length < 2) runtimeErrors.push("showcase-d");
  if (runtimeShowcase[4] && !implants.some((row) => row.implantCaseId === data.ids.caseIds[40])) runtimeErrors.push("showcase-e");
  if (runtimeShowcase[5] && (!charges.some((row) => row.implantCaseId === runtimeShowcase[5].id) || !discounts.some((row) => row.implantCaseId === runtimeShowcase[5].id))) runtimeErrors.push("showcase-f");
  const result = {
    batch: SEED_BATCH,
    tenant: TARGET_REFERENCE_CODE,
    anchorDate: ANCHOR_DATE,
    counts,
    expected,
    countMismatch,
    fkErrors,
    financialErrors,
    chronologyErrors,
    markerErrors,
    systemOptionErrors,
    runtimeErrors,
    valid:
      countMismatch.length === 0 &&
      fkErrors.length === 0 &&
      financialErrors.length === 0 &&
      chronologyErrors.length === 0 &&
      markerErrors.length === 0 &&
      systemOptionErrors.length === 0 &&
      runtimeErrors.length === 0,
  };
  console.info(JSON.stringify(result, null, 2));
  if (!result.valid) throw new Error("Screenshot seed validation failed.");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "seed") await seed();
  else if (command === "cleanup") await cleanup();
  else if (command === "validate") await validate();
  else throw new Error("Usage: seed | cleanup | validate");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      const { pool } = await import("@workspace/db");
      await pool.end();
    });
}