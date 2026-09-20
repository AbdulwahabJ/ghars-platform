import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import {
  db,
  importBatchesTable,
  importMappingsTable,
  implantCasesTable,
  implantsTable,
  patientsTable,
  caseHistoricalFinanceTable,
  implantSystemOptionsTable,
} from "@workspace/db";
import {
  UNIVERSAL_IMPORT_DESTINATIONS,
  universalImportCommitSchema,
  universalImportInputSchema,
  universalImportMappingPatchSchema,
  universalImportBatchSchema,
  universalImportCommitResponseSchema,
  universalImportPartialFailureResponseSchema,
  universalImportRollbackResponseSchema,
  type UniversalImportBatch,
  type UniversalImportDestination,
  type UniversalImportMapping,
  normalizeArabicSearchText,
  normalizeMobile,
  FDI_SITES,
} from "@workspace/shared";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { parseCsv } from "../lib/csv";
import { writeAuditRequired } from "../lib/audit";
import { extractVisualTable } from "../lib/visual-table-extractor";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use("/admin/import/universal", requireAuth, requireRole("ADMIN"));

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 5_000;
const MAX_SHEETS = 20;
const MIN_CONFIDENCE = 0.8;
const IMAGE_MIMES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_XLSX_UNCOMPRESSED = 64 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 2_000;
const MAX_XLSX_ENTRY = 16 * 1024 * 1024;

type RawRow = { rowNumber: number; sheet: string; values: Record<string, string>; confidence?: Record<string, number> };
type CreatedRecord = {
  table: string;
  id: string;
  patientId?: string;
  createdAt: string;
  updatedAt: string;
};
type ProposedImplant = { site: string; size: string | null; system: string | null; qValue: string | null; formerValue: string | null; graftValue: string | null };
type StructuredNoteValues = {
  qValues: string[];
  formerValues: string[];
  graftValues: string[];
  prosValues: string[];
  noteValues: string[];
  residualText: string;
};
type HistoricalFinance = {
  historicalTotalAmount: number | null;
  historicalPaidAmount: number | null;
  openingRemainingBalance: number | null;
  historicalPaymentStatus: "UNKNOWN" | "UNPAID" | "PARTIALLY_PAID" | "PAID_IN_FULL" | "REVIEW_REQUIRED" | null;
  isVerified: boolean;
};
type NormalizedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  status: "READY" | "REVIEW_REQUIRED" | "BLOCKED" | "DUPLICATE";
  warnings: string[];
  confidence: Record<string, number>;
  proposed: {
    patient: { name: string; fileNumber: string; mobile: string | null; age: number | null };
    case: { procedureDate: string; treatingDoctor: string; status: string; prosValue: string | null; clinicalNote: string | null };
    implants: ProposedImplant[];
    financeCandidate: string | null;
    finance: HistoricalFinance;
    implantApplyToAll: Array<"qValue" | "formerValue" | "graftValue">;
    sourceCandidates: { qValue: string | null; formerValue: string | null; graftValue: string | null };
    legacyNotes: string[];
  };
  importPlan: {
    createPatient: boolean;
    createCase: boolean;
    implantCount: number;
    createBoneGraftProcedure: false;
    createProstheticEvent: false;
    paymentRecords: 0;
    historicalFinanceEligible: boolean;
    preserveLegacyNote: boolean;
    openingRemainingBalance: number | null;
    implants: ProposedImplant[];
    prosValue: string | null;
  };
};

const destinationSet = new Set<string>(UNIVERSAL_IMPORT_DESTINATIONS);

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .toLocaleLowerCase()
    .replace(/[\s_.:/\\()-]+/g, "")
    .replace(/[؟?]/g, "");
}

const ALIASES: Record<string, UniversalImportDestination> = {
  name: "patient.name", patient: "patient.name", patientname: "patient.name",
  fullname: "patient.name", patientfullname: "patient.name", "اسم": "patient.name", "اسم المريض والجوال": "patient.name",
  "اسم المريض": "patient.name", "الاسم الكامل": "patient.name", "name+mobile": "patient.name",
  file: "patient.file_number", fileno: "patient.file_number", file_number: "patient.file_number",
  mrn: "patient.file_number", no: "patient.file_number", "رقم الملف": "patient.file_number",
  mobile: "patient.mobile", phone: "patient.mobile", telephone: "patient.mobile", "رقم الجوال": "patient.mobile",
  mobilenumber: "patient.mobile", phonenumber: "patient.mobile", whatsapp: "patient.mobile", جوال: "patient.mobile", هاتف: "patient.mobile",
  age: "patient.age", العمر: "patient.age",
  date: "case.procedure_date", surgerydate: "case.procedure_date", implantdate: "case.procedure_date",
  proceduredate: "case.procedure_date", "تاريخ العملية": "case.procedure_date", "تاريخ الزراعة": "case.procedure_date",
  dateofprocedure: "case.procedure_date", dateofimplant: "case.procedure_date", surgery: "case.procedure_date",
  system: "implant.system", implant: "implant.system", brand: "implant.system", "نظام الزرعة": "implant.system",
  implantbrand: "implant.system",
  site: "implant.site", tooth: "implant.site", toothno: "implant.site", location: "implant.site", "الموقع": "implant.site",
  implantsite: "implant.site", toothnumber: "implant.site", fdi: "implant.site", "رقم السن": "implant.site", السن: "implant.site",
  size: "implant.size", implantsize: "implant.size", dimensions: "implant.size", "المقاس": "implant.size",
  implantdimensions: "implant.size", "حجم الزرعة": "implant.size",
  q: "implant.q_value", qvalue: "implant.q_value",
  former: "implant.former_value", formervalue: "implant.former_value",
  graft: "implant.graft_value", graftvalue: "implant.graft_value",
  pros: "case.pros_value", prosvalue: "case.pros_value",
  note: "clinical_note", notes: "clinical_note", "ملاحظة": "clinical_note",
  cost: "finance.candidate", price: "finance.candidate", amount: "finance.candidate", total: "finance.candidate",
  historicaltotal: "finance.total", paid: "finance.paid", historicalpaid: "finance.paid",
  openingremaining: "finance.opening_remaining", balance: "finance.opening_remaining",
  paymentstatus: "finance.status",
  "التكلفة": "finance.candidate", "المبلغ": "finance.candidate",
  doctor: "case.treating_doctor", treatingdoctor: "case.treating_doctor", "الطبيب المعالج": "case.treating_doctor",
  status: "case.status", casestatus: "case.status", "حالة الحالة": "case.status",
};

/** Parse only amounts explicitly documented in COST/finance text; unknown stays null. */
export function parseHistoricalFinance(raw: string | null): HistoricalFinance {
  if (!raw?.trim()) return { historicalTotalAmount: null, historicalPaidAmount: null, openingRemainingBalance: null, historicalPaymentStatus: null, isVerified: false };
  const text = raw.normalize("NFKC").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const parseAmount = (value: string) => {
    const normalized = value.includes(",") && (value.split(",").pop() ?? "").length === 3
      ? value.replace(/,/g, "")
      : value.replace(",", ".");
    return Math.round(Number(normalized) * 100);
  };
  const noPayment = /لم\s*تدفع\s*شي[ئء]|لم\s*يدفع\s*شي[ئء]|no\s+payment/i.test(text);
  const paidInFullMatch = text.match(/(?:تم\s+دفع\s+كامل\s+المبلغ|paid\s+in\s+full)[^\d]{0,20}([\d,]+(?:[.]\d{1,2})?)/i);
  if (paidInFullMatch) {
    const amount = parseAmount(paidInFullMatch[1]);
    return {
      historicalTotalAmount: amount,
      historicalPaidAmount: amount,
      openingRemainingBalance: 0,
      historicalPaymentStatus: "PAID_IN_FULL",
      isVerified: false,
    };
  }
  const totalMatch = text.match(/(?:total|الإجمالي|المجموع|تكلفة)[^\d]{0,20}([\d,]+(?:[.]\d{1,2})?)/i);
  const paidMatches = [...text.matchAll(/(?:paid|مدفوع|دفعة)[^\d]{0,20}([\d,]+(?:[.]\d{1,2})?)/gi)];
  const total = totalMatch ? parseAmount(totalMatch[1]) : null;
  const paid = noPayment ? 0 : paidMatches.length ? paidMatches.reduce((sum, m) => sum + parseAmount(m[1]), 0) : null;
  const remainingMatch = text.match(/(?:balance|remaining|المتبقي|الباقي)[^\d]{0,20}([\d,]+(?:[.]\d{1,2})?)/i);
  const remaining = remainingMatch ? parseAmount(remainingMatch[1]) : (total != null && paid != null ? total - paid : null);
  const status = noPayment ? "UNPAID" : total != null && paid != null && paid === total ? "PAID_IN_FULL" : paid != null && paid > 0 ? (remaining == null ? "REVIEW_REQUIRED" : "PARTIALLY_PAID") : null;
  return { historicalTotalAmount: total, historicalPaidAmount: paid, openingRemainingBalance: remaining, historicalPaymentStatus: status, isVerified: false };
}

function aliasFor(header: string): UniversalImportDestination | null {
  const normalized = normalizeHeader(header);
  const direct = ALIASES[header.trim()] ?? ALIASES[normalized];
  if (direct) return direct;
  return Object.entries(ALIASES).find(([key]) => normalizeHeader(key) === normalized)?.[1] ?? null;
}

const LOCKED_CANONICAL_DESTINATIONS = new Set<UniversalImportDestination>([
  "implant.q_value",
  "implant.former_value",
  "implant.graft_value",
  "case.pros_value",
  "clinical_note",
]);

function lockedCanonicalDestination(header: string): UniversalImportDestination | null {
  const destination = aliasFor(header);
  return destination && LOCKED_CANONICAL_DESTINATIONS.has(destination) ? destination : null;
}

function splitValues(value: string): string[] {
  return normalizeDigits(value).split(/[,\n;؛|/]+/).map((part) => part.trim()).filter(Boolean);
}

function parseStructuredNote(value: string): StructuredNoteValues {
  const sections: Record<"q" | "former" | "graft" | "pros" | "note", string[]> = {
    q: [],
    former: [],
    graft: [],
    pros: [],
    note: [],
  };
  const residual: string[] = [];
  let active: keyof typeof sections | null = null;
  for (const sourceLine of value.replace(/\r\n?/g, "\n").split("\n")) {
    const line = sourceLine.trim();
    const match = /^(Q|Former|Graft|Pros|NOTE)\s*[:：]\s*(.*)$/i.exec(line);
    if (match) {
      active = match[1].toLowerCase() as keyof typeof sections;
      if (match[2].trim()) sections[active].push(normalizeDigits(match[2].trim()));
      continue;
    }
    if (!line) continue;
    if (active) sections[active].push(normalizeDigits(line));
    else residual.push(sourceLine);
  }
  const noteValues = sections.note.length > 1 && sections.note.every((entry) => entry === sections.note[0])
    ? [sections.note[0]]
    : sections.note;
  return {
    qValues: sections.q,
    formerValues: sections.former,
    graftValues: sections.graft,
    prosValues: sections.pros,
    noteValues,
    residualText: residual.join("\n").trim(),
  };
}

function syncImportPlan(row: NormalizedRow): void {
  row.importPlan.implants = row.proposed.implants.map((implant) => ({ ...implant }));
  row.importPlan.prosValue = row.proposed.case.prosValue;
  row.importPlan.implantCount = row.proposed.implants.length;
  row.importPlan.preserveLegacyNote = Boolean(row.proposed.case.clinicalNote || row.proposed.legacyNotes.length);
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function normalizeSize(value: string): string {
  return normalizeDigits(value).trim().replace(/[×Xx*]/g, " × ").replace(/\s+/g, " ").trim();
}

function sizeNumbers(value: string | null): { diameter: string | null; length: string | null } {
  if (!value) return { diameter: null, length: null };
  const numbers = value.match(/\d+(?:\.\d+)?/g) ?? [];
  return { diameter: numbers[0] ?? null, length: numbers[1] ?? null };
}

function parseDate(value: string): { date: string | null; ambiguous: boolean } {
  const v = normalizeDigits(value.trim());
  let year = 0;
  let month = 0;
  let day = 0;
  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const textual = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(v);
  if (textual) {
    day = Number(textual[1]);
    month = monthNames[textual[2].toLowerCase()] ?? 0;
    year = Number(textual[3]);
  }
  let match = textual ? null : /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(v);
  if (textual) {
    // Parsed above using an explicit English month-name table.
  } else if (match) {
    [, year, month, day] = match.map(Number) as [string, number, number, number];
  } else {
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(v);
    if (!match) return { date: null, ambiguous: false };
    [, day, month, year] = match.map(Number) as [string, number, number, number];
    if (day <= 12 && month <= 12) return { date: null, ambiguous: true };
    if (year < 100) year += year <= 69 ? 2000 : 1900;
  }
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    return { date: null, ambiguous: false };
  }
  return { date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, ambiguous: false };
}

function cleanDate(value: string): string | null {
  return parseDate(value).date;
}

function excelDate(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function parseNumber(value: string): number | null {
  const v = normalizeDigits(value).replace(/,/g, "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitCombinedNameMobile(value: string): { name: string; mobile: string | null; review: string | null } {
  const trimmed = value.trim();
  const phoneLike = /(?:\+?966|00966|05)\s*[\dA-Za-z\s().-]{5,}/iu.test(trimmed) || /^\+?\d[\d\s().-]{7,}$/u.test(trimmed);
  const match = /^(.*?)[\s,،;؛|/:-]+((?:\+?966|00966|05|5)[\d\s().-]{7,})\s*$/u.exec(trimmed);
  if (!match) {
    if (phoneLike) return { name: "", mobile: null, review: "Combined name/mobile value contains a phone-like segment that could not be split deterministically." };
    return { name: trimmed, mobile: null, review: null };
  }
  const candidate = match[2].replace(/[^\d+]/g, "");
  const normalized = normalizeMobile(candidate);
  if (!normalized.ok || !match[1].trim()) {
    return { name: "", mobile: null, review: "Combined name/mobile value has a malformed or ambiguous phone segment." };
  }
  return { name: match[1].trim(), mobile: candidate, review: null };
}

function compatiblePatientIdentity(rows: NormalizedRow[]): boolean {
  const names = new Set(rows.map((row) => normalizeArabicSearchText(row.proposed.patient.name)));
  if (names.size > 1) return false;
  const phones = new Set(rows.map((row) => {
    const phone = row.proposed.patient.mobile ? normalizeMobile(row.proposed.patient.mobile) : null;
    return phone?.ok ? phone.normalized : null;
  }).filter((phone): phone is string => Boolean(phone)));
  return phones.size <= 1;
}

function canonicalGroupMobile(rows: NormalizedRow[]): string | null {
  for (const row of rows) {
    const raw = row.proposed.patient.mobile;
    if (!raw) continue;
    const normalized = normalizeMobile(raw);
    if (normalized.ok) return raw;
  }
  return null;
}

function inspectXlsxPackage(buffer: Buffer): void {
  if (buffer.length < 22) throw new Error("The XLSX package is truncated.");
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("The XLSX package directory is invalid.");
  const entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries > MAX_XLSX_ENTRIES || directoryOffset + directorySize > buffer.length) {
    throw new Error("The XLSX package structure exceeds safe limits.");
  }
  let offset = directoryOffset;
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("The XLSX central directory is invalid.");
    }
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (uncompressed > MAX_XLSX_ENTRY || total + uncompressed > MAX_XLSX_UNCOMPRESSED ||
      (compressed > 0 && uncompressed / compressed > 1000)) {
      throw new Error("The XLSX package compression or uncompressed-size limits were exceeded.");
    }
    if (/vbaProject|externalLinks|^xl\/(embeddings|activeX)\//i.test(name)) {
      throw new Error("Macros, embedded objects, external links, and unsafe package metadata are not allowed.");
    }
    total += uncompressed;
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

async function readSpreadsheet(
  filename: string,
  mime: string,
  content: string,
): Promise<{ rows: RawRow[]; extractionReview?: string; pagesProcessed?: number; documentType?: "TEXT" | "IMAGE" | "MIXED" }> {
  const lower = filename.toLowerCase();
  const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  const isCsv = extension === ".csv" || extension === ".txt";
  const isXlsx = extension === ".xlsx";
  const isRejectedWorkbook = extension === ".xls" || extension === ".xlsm";
  if (isRejectedWorkbook || (extension === ".xlsx" && !(
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/octet-stream"
  ))) {
    throw new Error("XLS/XLSM and MIME/extension-mismatched workbooks are not allowed; upload a standard XLSX file.");
  }
  if (isCsv && mime !== "text/csv" && mime !== "text/plain" && !mime.includes("csv")) {
    throw new Error("CSV MIME type does not match the file extension.");
  }
  if (IMAGE_MIMES.has(mime) || /\.(pdf|png|jpe?g)$/i.test(lower)) {
    if (extension === ".pdf" && mime !== "application/pdf") throw new Error("PDF MIME type does not match the file extension.");
    if (extension !== ".pdf" && !mime.startsWith("image/")) throw new Error("Image MIME type does not match the file extension.");
    const extracted = await extractVisualTable(filename, mime, content);
    return {
      rows: extracted.rows,
      pagesProcessed: extracted.pagesProcessed,
      documentType: extracted.documentType,
    };
  }
  let headers: string[];
  let values: string[][];
  if (isCsv || mime.includes("csv")) {
    const parsed = parseCsv(content);
    if (!parsed.length) throw new Error("The uploaded file contains no rows.");
    headers = parsed[0].map((v, i) => v.trim() || `Column ${i + 1}`);
    values = parsed.slice(1);
  } else if (
    isXlsx ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const buffer = Buffer.from(content, "base64");
    if (buffer.length > MAX_BYTES) throw new Error("The spreadsheet exceeds the 8 MB limit.");
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error("The XLSX signature is invalid.");
    }
    inspectXlsxPackage(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    if (workbook.worksheets.length > MAX_SHEETS) throw new Error(`Too many sheets; maximum is ${MAX_SHEETS}.`);
    const workbookModel = workbook as unknown as { model?: { externalLinks?: unknown[] } };
    if ((workbookModel.model?.externalLinks?.length ?? 0) > 0) {
      throw new Error("External-link worksheets are not allowed.");
    }
    for (const worksheet of workbook.worksheets) {
      if (worksheet.rowCount > MAX_ROWS || worksheet.columnCount > 100) {
        throw new Error("The workbook structure exceeds the row/column limits.");
      }
    }
    const allRows: RawRow[] = [];
    for (const sheet of workbook.worksheets) {
      const matrix: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          const value = cell.value;
          if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
            throw new Error("Formula cells are not allowed; upload calculated/static values only.");
          }
          cells.push(value == null ? "" : value instanceof Date ? excelDate(value) : String(value));
        });
        if (cells.some(Boolean)) matrix.push(cells);
      });
      if (!matrix.length) continue;
      const sheetHeaders = matrix[0].map((v, i) => v.trim() || `Column ${i + 1}`);
      for (const [index, cells] of matrix.slice(1).entries()) {
        allRows.push({
          rowNumber: allRows.length + 1,
          sheet: sheet.name,
          values: Object.fromEntries(sheetHeaders.map((header, i) => [header, (cells[i] ?? "").trim()])),
        });
      }
    }
    if (!allRows.length) throw new Error("The workbook contains no rows.");
    if (allRows.some((row) => Object.keys(row.values).length > 100)) throw new Error("Too many columns; maximum is 100.");
    return { rows: allRows };
  } else {
    throw new Error("Supported uploads are CSV, XLSX, PDF, PNG, and JPEG.");
  }
  if (headers.length > 100) throw new Error("Too many columns; maximum is 100.");
  if (values.length > MAX_ROWS) throw new Error(`Too many rows; maximum is ${MAX_ROWS}.`);
  return {
    rows: values.map((cells, index) => ({
      rowNumber: index + 1,
      sheet: "CSV",
      values: Object.fromEntries(headers.map((header, i) => [header, (cells[i] ?? "").trim()])),
    })),
  };
}

async function learnedMappings(tenantId: string): Promise<{
  headers: Map<string, UniversalImportDestination>;
  values: Map<string, string>;
}> {
  const rows = await db.select().from(importMappingsTable)
    .where(eq(importMappingsTable.tenantId, tenantId))
    .orderBy(desc(importMappingsTable.approvedAt));
  const headers = new Map<string, UniversalImportDestination>();
  const values = new Map<string, string>();
  for (const row of rows) {
    if (!row.approvedAt) continue;
    if (row.sourceKind === "header") {
      const key = normalizeHeader(row.sourceValue);
      if (headers.has(key)) continue;
      headers.set(
        key,
        lockedCanonicalDestination(row.sourceValue) ??
          (row.destination as UniversalImportDestination),
      );
    } else if (row.sourceKind.startsWith("value:")) {
      const key = `${row.sourceKind}:${row.sourceValue}`;
      if (!values.has(key)) values.set(key, row.destination);
    }
  }
  return {
    headers,
    values,
  };
}

function makeMappings(
  headers: string[],
  learned: { headers: Map<string, UniversalImportDestination>; values: Map<string, string> },
  overrides?: UniversalImportMapping[],
): UniversalImportMapping[] {
  const overrideMap = new Map((overrides ?? []).map((mapping) => [mapping.source, mapping]));
  return headers.map((source) => {
    const canonicalDestination = lockedCanonicalDestination(source);
    if (canonicalDestination) {
      return {
        source,
        destination: canonicalDestination,
        confidence: 1,
        reason: "Canonical source field",
        requiresReview: false,
      };
    }
    const override = overrideMap.get(source);
    if (override) return override;
    const learnedDestination = learned.headers.get(normalizeHeader(source));
    const destination = learnedDestination ?? aliasFor(source);
    const confidence = learnedDestination ? 1 : destination ? 0.92 : 0;
    return {
      source,
      destination: destination ?? "legacy_note",
      confidence,
      reason: learnedDestination ? "Approved tenant mapping" : destination ? "Deterministic header alias" : "Unknown column preserved for review",
      requiresReview: !destination || confidence < MIN_CONFIDENCE || destination === "finance.candidate",
    };
  });
}

async function repairStagingMappings(
  batch: typeof importBatchesTable.$inferSelect,
  tenantId: string,
) {
  if (batch.status !== "ANALYZED") return batch;
  const current = batch.mappings as UniversalImportMapping[];
  let changed = false;
  const mappings = current.map((mapping) => {
    const canonical = lockedCanonicalDestination(mapping.source);
    if (!canonical || canonical === mapping.destination) return mapping;
    changed = true;
    return {
      ...mapping,
      destination: canonical,
      confidence: 1,
      reason: "Canonical source field",
      requiresReview: false,
    };
  });
  if (!changed) return batch;
  const [updated] = await db.update(importBatchesTable).set({
    mappings,
    version: batch.version + 1,
    updatedAt: new Date(),
  }).where(and(
    eq(importBatchesTable.id, batch.id),
    eq(importBatchesTable.tenantId, tenantId),
    eq(importBatchesTable.status, "ANALYZED"),
    eq(importBatchesTable.version, batch.version),
  )).returning();
  return updated ?? batch;
}

function normalizeRows(
  rows: RawRow[],
  mappings: UniversalImportMapping[],
  valueMappings: Map<string, string> = new Map(),
  extractionReview?: string,
  approvedRows: Set<number> = new Set(),
  managedSystems: Map<string, string> = new Map(),
): NormalizedRow[] {
  const byDestination = new Map<UniversalImportDestination, string[]>();
  for (const mapping of mappings) {
    if (!destinationSet.has(mapping.destination)) continue;
    const values = byDestination.get(mapping.destination) ?? [];
    values.push(mapping.source);
    byDestination.set(mapping.destination, values);
  }
  const get = (row: RawRow, destination: UniversalImportDestination): string =>
    (byDestination.get(destination) ?? []).map((source) => row.values[source] ?? "").find(Boolean) ?? "";
  const hasCombinedNameMobile = (byDestination.get("patient.name") ?? [])
    .some((source) => normalizeHeader(source) === normalizeHeader("name+mobile"));
  return rows.map((row) => {
    const rowApproved = approvedRows.has(row.rowNumber);
    const warnings = mappings
      .filter((mapping) => mapping.requiresReview && !(rowApproved && mapping.destination === "finance.candidate"))
      .map((mapping) => `${mapping.source} requires review`);
    if (extractionReview && !rowApproved) warnings.push(extractionReview);
    const combined = hasCombinedNameMobile
      ? splitCombinedNameMobile(get(row, "patient.name"))
      : { name: get(row, "patient.name"), mobile: null, review: null };
    const name = combined.name.replace(/^\s*[٠-٩۰-۹\d]+\s*[-–—.)،]\s*/u, "").trim();
    const fileNumber = normalizeDigits(get(row, "patient.file_number"));
    const intrinsicDestination = (source: string): UniversalImportDestination | null => aliasFor(source);
    const isDedicatedStructuredSource = (source: string): boolean =>
      ["implant.q_value", "implant.former_value", "implant.graft_value", "case.pros_value"].includes(intrinsicDestination(source) ?? "");
    const structuredSources = [...new Set([
      ...(byDestination.get("clinical_note") ?? []).filter((source) => !isDedicatedStructuredSource(source)),
      ...(byDestination.get("legacy_note") ?? []).filter((source) => !isDedicatedStructuredSource(source)),
      ...mappings.filter((mapping) => intrinsicDestination(mapping.source) === "clinical_note").map((mapping) => mapping.source),
    ])];
    const parsedStructured = structuredSources.map((source) => ({
      source,
      destination: intrinsicDestination(source) === "clinical_note"
        ? "clinical_note"
        : mappings.find((mapping) => mapping.source === source)?.destination,
      parsed: parseStructuredNote(row.values[source] ?? ""),
    }));
    const embedded = parsedStructured.reduce<StructuredNoteValues>((result, entry) => ({
      qValues: [...result.qValues, ...entry.parsed.qValues],
      formerValues: [...result.formerValues, ...entry.parsed.formerValues],
      graftValues: [...result.graftValues, ...entry.parsed.graftValues],
      prosValues: [...result.prosValues, ...entry.parsed.prosValues],
      noteValues: [...result.noteValues, ...entry.parsed.noteValues],
      residualText: [result.residualText, entry.parsed.residualText].filter(Boolean).join("\n"),
    }), { qValues: [], formerValues: [], graftValues: [], prosValues: [], noteValues: [], residualText: "" });
    const rawDate = get(row, "case.procedure_date");
    const parsedDate = parseDate(rawDate);
    const procedureDate = parsedDate.date;
    if (parsedDate.ambiguous) warnings.push("DATE_AMBIGUOUS: Numeric date is ambiguous; use YYYY-MM-DD or an explicit month name.");
    const sites = splitValues(get(row, "implant.site")).map((site) => normalizeDigits(site).trim());
    const blocked: string[] = [];
    const sizes = splitValues(get(row, "implant.size")).map(normalizeSize);
    const rawSystems = splitValues(get(row, "implant.system"));
    const systems = rawSystems.map((rawSystem) => {
      const approved = valueMappings.get(`value:implant.system:${rawSystem}`);
      if (approved) return approved;
      const normalized = normalizeArabicSearchText(rawSystem);
      const exact = managedSystems.get(normalized);
      if (exact) return exact;
      if (normalized === "rot") {
        return [...managedSystems.entries()].find(([key]) => key === "rot / root" || key.startsWith("rot "))?.[1] ?? "";
      }
      return "";
    }).filter(Boolean);
    if (rawSystems.length && managedSystems.size && systems.length !== rawSystems.length) {
      warnings.push("IMPLANT_SYSTEM_UNKNOWN: Implant system is not in the tenant managed list and was not written as canonical data.");
    }
    const implantMetric = (destination: UniversalImportDestination, embeddedValues: string[]): string[] => {
      const recognizedSource = mappings.find((mapping) => intrinsicDestination(mapping.source) === destination)?.source;
      const explicit = splitValues(recognizedSource ? row.values[recognizedSource] ?? "" : get(row, destination));
      return explicit.length ? explicit : embeddedValues;
    };
    const qValues = implantMetric("implant.q_value", embedded.qValues);
    const formerValues = implantMetric("implant.former_value", embedded.formerValues);
    const graftValues = implantMetric("implant.graft_value", embedded.graftValues);
    const treatingDoctor = get(row, "case.treating_doctor").trim() || "غير محدد";
    const caseStatus = get(row, "case.status").trim() || "غير محدد";
    for (const [label, values] of [["Q", qValues], ["Former", formerValues], ["Graft", graftValues]] as const) {
      if (sites.length > 1 && values.length === 1 && values[0]) warnings.push(`${label} is a single source value for multiple implants; review explicit apply-to-all before commit.`);
      if (values.length > 1 && values.length !== sites.length) blocked.push(`${label} values must match implant site count.`);
    }
    const implants = sites.map((site, index) => ({
      site,
      size: sizes[index] ?? null,
      system: systems[index] ?? (systems.length === 1 ? systems[0] : null),
      qValue: qValues.length === sites.length ? qValues[index] ?? null : null,
      formerValue: formerValues.length === sites.length ? formerValues[index] ?? null : null,
      graftValue: graftValues.length === sites.length ? graftValues[index] ?? null : null,
    }));
    if (combined.review) warnings.push(combined.review);
    if ((!name && !combined.review) || !fileNumber || (!procedureDate && !parsedDate.ambiguous)) blocked.push("Patient name, file number, and clinical date are required.");
    if (!sites.length) blocked.push("At least one implant site is required.");
    for (const site of sites) {
      const isFdi = (FDI_SITES as readonly string[]).includes(site);
      const isExplicitCustom = /^custom\s*:/i.test(site) || /^مخصص\s*:/u.test(site);
      if (!isFdi && !isExplicitCustom) {
        warnings.push(`SITE_INVALID: Site "${site}" is not a valid FDI tooth and cannot be committed until corrected.`);
      }
      if (isExplicitCustom && site.replace(/^custom\s*:/i, "").replace(/^مخصص\s*:/u, "").trim().length < 1) {
        blocked.push("Custom implant sites must include a non-empty label.");
      }
    }
    if (
      (sites.length > 1 && sizes.length !== sites.length) ||
      (row.confidence && sizes.length !== sites.length)
    ) {
      blocked.push("Implant site/size counts do not match; pairing is blocked.");
    }
    if (systems.length > 1 && systems.length !== sites.length) blocked.push("Implant site/system counts do not match; pairing is blocked.");
    const finance = get(row, "finance.candidate") || get(row, "finance.preserve_summary") || null;
    const parsedFinance = parseHistoricalFinance(finance);
    const explicitTotal = parseNumber(get(row, "finance.total"));
    const explicitPaid = parseNumber(get(row, "finance.paid"));
    const explicitRemaining = parseNumber(get(row, "finance.opening_remaining"));
    if (explicitTotal != null) parsedFinance.historicalTotalAmount = Math.round(explicitTotal * 100);
    if (explicitPaid != null) parsedFinance.historicalPaidAmount = Math.round(explicitPaid * 100);
    if (explicitRemaining != null) parsedFinance.openingRemainingBalance = Math.round(explicitRemaining * 100);
    const explicitStatus = get(row, "finance.status").trim().toUpperCase();
    if (["UNKNOWN", "UNPAID", "PARTIALLY_PAID", "PAID_IN_FULL", "REVIEW_REQUIRED"].includes(explicitStatus)) {
      parsedFinance.historicalPaymentStatus = explicitStatus as HistoricalFinance["historicalPaymentStatus"];
    }
    if (parsedFinance.historicalTotalAmount != null && parsedFinance.historicalPaidAmount != null &&
        parsedFinance.openingRemainingBalance != null &&
        parsedFinance.historicalTotalAmount !== parsedFinance.historicalPaidAmount + parsedFinance.openingRemainingBalance) {
      warnings.push("Historical total must equal paid plus opening remaining; finance requires correction.");
      parsedFinance.isVerified = false;
      parsedFinance.historicalPaymentStatus = "REVIEW_REQUIRED";
    }
    if (get(row, "finance.candidate") && !rowApproved) warnings.push("Financial source text is review-only; explicitly preserve it as a historical summary or ignore it before commit.");
    const legacyNotes = parsedStructured
      .filter((entry) => entry.destination === "legacy_note")
      .map((entry) => ({
        source: entry.source,
        value: [entry.parsed.residualText, ...entry.parsed.noteValues].filter(Boolean).join("\n"),
      }))
      .filter((entry) => Boolean(entry.value))
      .map((entry) => `${entry.source}: ${entry.value}`);
    const directClinicalNote = parsedStructured
      .filter((entry) => entry.destination === "clinical_note")
      .flatMap((entry) => [entry.parsed.residualText, ...entry.parsed.noteValues])
      .filter(Boolean);
    const clinicalNote = [...new Set(directClinicalNote)].join("\n") || null;
    const recognizedProsSource = mappings.find((mapping) => intrinsicDestination(mapping.source) === "case.pros_value")?.source;
    const explicitProsValues = splitValues(recognizedProsSource ? row.values[recognizedProsSource] ?? "" : get(row, "case.pros_value"));
    const prosValues = explicitProsValues.length ? explicitProsValues : embedded.prosValues;
    const distinctProsValues = [...new Set(prosValues.map((value) => value.trim()).filter(Boolean))];
    const canonicalProsValue = distinctProsValues.length === 1 && (distinctProsValues[0] === "2M" || distinctProsValues[0] === "3M")
      ? distinctProsValues[0]
      : null;
    if (distinctProsValues.length && !canonicalProsValue) {
      legacyNotes.push(`Pros: ${distinctProsValues.join("\n")}`);
      if (!rowApproved) warnings.push("PROS_REVIEW_REQUIRED: Pros meaning is not proven and will be preserved as a legacy prosthetic note.");
    }
    for (const mapping of mappings) {
      const valueConfidence = row.confidence?.[mapping.source];
      if (!rowApproved && row.values[mapping.source] && valueConfidence != null && valueConfidence < MIN_CONFIDENCE) {
        warnings.push(`${mapping.source} has low extraction confidence (${Math.round(valueConfidence * 100)}%).`);
      }
    }
    const status = blocked.length
      ? "BLOCKED"
      : warnings.length
        ? "REVIEW_REQUIRED"
        : "READY";
    return {
      rowNumber: row.rowNumber,
      raw: { ...row.values },
      status,
      warnings: [...blocked, ...warnings],
      confidence: Object.fromEntries(mappings.map((mapping) => [
        mapping.source,
        Math.min(mapping.confidence, row.confidence?.[mapping.source] ?? 1),
      ])),
      proposed: {
        patient: { name, fileNumber, mobile: get(row, "patient.mobile") || combined.mobile, age: parseNumber(get(row, "patient.age")) },
        case: {
          procedureDate: procedureDate ?? "",
          treatingDoctor,
          status: caseStatus,
          prosValue: canonicalProsValue,
          clinicalNote,
        },
        implants,
        implantApplyToAll: [],
        sourceCandidates: { qValue: qValues.length === 1 ? qValues[0] : null, formerValue: formerValues.length === 1 ? formerValues[0] : null, graftValue: graftValues.length === 1 ? graftValues[0] : null },
        financeCandidate: finance,
        finance: parsedFinance,
        legacyNotes,
      },
      importPlan: {
        createPatient: true,
        createCase: true,
        implantCount: implants.length,
        createBoneGraftProcedure: false,
        createProstheticEvent: false,
        paymentRecords: 0,
        historicalFinanceEligible: parsedFinance.isVerified,
        preserveLegacyNote: Boolean(clinicalNote || legacyNotes.length),
        openingRemainingBalance: parsedFinance.openingRemainingBalance,
        implants: implants.map((implant) => ({ ...implant })),
        prosValue: canonicalProsValue,
      },
    };
  });
}

async function classifyDuplicates(
  rows: NormalizedRow[],
  tenantId: string,
  approvedRows: Set<number> = new Set(),
): Promise<NormalizedRow[]> {
  const byFile = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    if (!row.proposed.patient.fileNumber) continue;
    const group = byFile.get(row.proposed.patient.fileNumber) ?? [];
    group.push(row);
    byFile.set(row.proposed.patient.fileNumber, group);
  }
  for (const [fileNumber, group] of byFile) {
    if (!compatiblePatientIdentity(group)) {
      for (const row of group) {
        row.status = "BLOCKED";
        row.warnings = [...row.warnings, `File number ${fileNumber} has conflicting patient identity across rows.`];
      }
    }
  }
  const fileNumbers = [...new Set(rows.map((row) => row.proposed.patient.fileNumber).filter(Boolean))];
  if (!fileNumbers.length) return rows;
  const patients = await db.select({
    id: patientsTable.id,
    fileNumber: patientsTable.fileNumber,
    fullNameNormalized: patientsTable.fullNameNormalized,
    mobileNormalized: patientsTable.mobileNormalized,
  }).from(patientsTable).where(and(
    eq(patientsTable.tenantId, tenantId),
    inArray(patientsTable.fileNumber, fileNumbers),
  ));
  const patientByFile = new Map(patients.map((patient) => [patient.fileNumber, patient]));
  const patientIds = patients.map((patient) => patient.id);
  const cases = patientIds.length
    ? await db.select({
      patientId: implantCasesTable.patientId,
      procedureDate: implantCasesTable.procedureDate,
    }).from(implantCasesTable).where(and(
      eq(implantCasesTable.tenantId, tenantId),
      inArray(implantCasesTable.patientId, patientIds),
      isNull(implantCasesTable.archivedAt),
    ))
    : [];
  const existingCases = new Set(cases.map((item) => `${item.patientId}|${item.procedureDate ?? ""}`));
  const tenantPhoneRows = await db.select({ mobileNormalized: patientsTable.mobileNormalized })
    .from(patientsTable)
    .where(eq(patientsTable.tenantId, tenantId));
  const phoneNumbers = new Set(
    tenantPhoneRows.map((patient) => patient.mobileNormalized)
      .filter((value): value is string => Boolean(value)),
  );
  const seenInUpload = new Set<string>();
  return rows.map((row) => {
    if (row.status === "BLOCKED") return row;
    const patient = patientByFile.get(row.proposed.patient.fileNumber);
    if (patient && patient.fullNameNormalized !== normalizeArabicSearchText(row.proposed.patient.name)) {
      return {
        ...row,
        status: "BLOCKED",
        warnings: [...row.warnings, `File number ${row.proposed.patient.fileNumber} belongs to a different patient.`],
      };
    }
    const normalizedPhone = row.proposed.patient.mobile
      ? normalizeMobile(row.proposed.patient.mobile)
      : null;
    if (normalizedPhone?.ok && phoneNumbers.has(normalizedPhone.normalized) && !patient && !approvedRows.has(row.rowNumber)) {
      return {
        ...row,
        status: row.status === "READY" ? "REVIEW_REQUIRED" : row.status,
        warnings: [...row.warnings, "A tenant patient already uses this phone number; review before creating a separate patient."],
      };
    }
    const key = `${row.proposed.patient.fileNumber}|${row.proposed.case.procedureDate}`;
    if (
      (patient && existingCases.has(`${patient.id}|${row.proposed.case.procedureDate}`)) ||
      seenInUpload.has(key)
    ) {
      return {
        ...row,
        status: "DUPLICATE",
        warnings: [...row.warnings, "This patient/case already exists in the tenant or earlier in this upload."],
      };
    }
    seenInUpload.add(key);
    return row;
  });
}

function publicBatch(batch: typeof importBatchesTable.$inferSelect): UniversalImportBatch {
  const mappings = batch.mappings as UniversalImportMapping[];
  const rows = batch.normalizedRows as NormalizedRow[];
  return universalImportBatchSchema.parse({
    id: batch.id,
    filename: batch.sourceFilename,
    mime: batch.sourceMime,
    status: batch.status,
    version: batch.version,
    mappings,
    rows,
    summary: batch.summary,
    createdRecords: batch.createdRecords,
    committedRowNumbers: batch.committedRowNumbers,
  });
}

router.post("/admin/import/universal/analyze", async (req, res): Promise<void> => {
  const parsed = universalImportInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { filename, mime, content } = parsed.data;
  const bytes = mime.includes("csv") ? Buffer.byteLength(content) : Buffer.from(content, "base64").length;
  if (bytes > MAX_BYTES) {
    res.status(413).json({ error: "The uploaded file exceeds the 8 MB limit." });
    return;
  }
  try {
    const { rows, extractionReview, pagesProcessed, documentType } = await readSpreadsheet(filename, mime, content);
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row.values)))];
    const learned = await learnedMappings(req.currentTenant!.id);
    const managedSystemRows = await db.select({ name: implantSystemOptionsTable.name })
      .from(implantSystemOptionsTable)
      .where(and(eq(implantSystemOptionsTable.tenantId, req.currentTenant!.id), eq(implantSystemOptionsTable.isActive, true)));
    const managedSystems = new Map(managedSystemRows.map((row) => [normalizeArabicSearchText(row.name), row.name]));
    // Client confidence/review flags are never trusted. Analyze always
    // recomputes deterministic and learned mappings on the server; edits use
    // the authenticated PATCH endpoint after preview.
    const mappings = makeMappings(headers, learned);
     const normalizedRows = await classifyDuplicates(
       normalizeRows(rows, mappings, learned.values, extractionReview, new Set(), managedSystems),
      req.currentTenant!.id,
     );
    const summary = {
      totalRows: normalizedRows.length,
      ready: normalizedRows.filter((row) => row.status === "READY").length,
      reviewRequired: normalizedRows.filter((row) => row.status === "REVIEW_REQUIRED").length,
      blocked: normalizedRows.filter((row) => row.status === "BLOCKED").length,
      duplicate: normalizedRows.filter((row) => row.status === "DUPLICATE").length,
      patients: new Set(normalizedRows.map((row) => row.proposed.patient.fileNumber)).size,
      implants: normalizedRows.reduce((sum, row) => sum + row.proposed.implants.length, 0),
      ...(pagesProcessed ? { pagesProcessed } : {}),
      ...(documentType ? { documentType } : {}),
      ...(extractionReview ? { extractionReview } : {}),
      importMode: parsed.data.mode,
    };
    const [batch] = await db.insert(importBatchesTable).values({
      tenantId: req.currentTenant!.id,
      importedBy: req.currentUser!.id,
      sourceFilename: filename,
      sourceMime: mime,
      sourceRows: rows,
      mappings,
      normalizedRows,
      summary,
    }).returning();
    await writeAuditRequired({
      tenantId: req.currentTenant!.id,
      userId: req.currentUser!.id,
      action: "IMPORT_UPLOADED",
      entityType: "import_batch",
      entityId: batch.id,
      summary: `Universal import analyzed: ${filename}`,
      details: { rows: summary.totalRows, mime },
    });
    await writeAuditRequired({
      tenantId: req.currentTenant!.id,
      userId: req.currentUser!.id,
      action: "IMPORT_ANALYZED",
      entityType: "import_batch",
      entityId: batch.id,
      summary: `Universal import mappings analyzed: ${filename}`,
      details: summary,
    });
    res.status(201).json(publicBatch(batch));
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : "Unable to analyze the upload." });
  }
});

router.patch("/admin/import/universal/:id/mapping", async (req, res): Promise<void> => {
  const parsed = universalImportMappingPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [batch] = await db.select().from(importBatchesTable).where(and(
    eq(importBatchesTable.id, req.params.id),
    eq(importBatchesTable.tenantId, req.currentTenant!.id),
  ));
  if (!batch || batch.status !== "ANALYZED") {
    res.status(404).json({ error: "Import staging batch not found or no longer editable." });
    return;
  }
  const current = batch.mappings as UniversalImportMapping[];
  const patch = new Map(parsed.data.mappings.map((mapping) => [mapping.source, mapping.destination]));
  const mappings = current.map((mapping) => {
    const explicit = patch.get(mapping.source);
    if (!explicit) return mapping;
    const canonical = lockedCanonicalDestination(mapping.source);
    // Only an explicitly submitted source is resolved. Omitted unknown
    // columns retain their server-computed review requirement.
    return {
      ...mapping,
      destination: canonical ?? explicit,
      confidence: 1,
      reason: canonical ? "Canonical source field" : mapping.reason,
      requiresReview: !canonical && explicit === "finance.candidate",
    };
  });
  const learned = await learnedMappings(req.currentTenant!.id);
  const managedSystemRows = await db.select({ name: implantSystemOptionsTable.name })
    .from(implantSystemOptionsTable)
    .where(and(eq(implantSystemOptionsTable.tenantId, req.currentTenant!.id), eq(implantSystemOptionsTable.isActive, true)));
  const managedSystems = new Map(managedSystemRows.map((row) => [normalizeArabicSearchText(row.name), row.name]));
  const valueMappings = new Map(learned.values);
  for (const mapping of parsed.data.valueMappings ?? []) {
    valueMappings.set(`value:implant.system:${mapping.source}`, mapping.destination);
  }
  const priorApprovals = new Set((batch.summary as { approvedRows?: number[] }).approvedRows ?? []);
  for (const approval of parsed.data.rowApprovals ?? []) {
    if (approval.approved) priorApprovals.add(approval.rowNumber);
    else priorApprovals.delete(approval.rowNumber);
  }
  const rows = await classifyDuplicates(
    normalizeRows(
      batch.sourceRows as RawRow[],
      mappings,
      valueMappings,
      (batch.summary as { extractionReview?: string }).extractionReview,
      priorApprovals,
      managedSystems,
    ),
    req.currentTenant!.id,
    priorApprovals,
  );
  const previousRows = batch.normalizedRows as NormalizedRow[];
  for (const row of rows) {
    const previous = previousRows.find((candidate) => candidate.rowNumber === row.rowNumber);
    if (!previous) continue;
    row.proposed.sourceCandidates = previous.proposed.sourceCandidates;
    if (previous.proposed.case.treatingDoctor && previous.proposed.case.status) {
      row.proposed.case.procedureDate = previous.proposed.case.procedureDate;
      row.proposed.case.treatingDoctor = previous.proposed.case.treatingDoctor;
      row.proposed.case.status = previous.proposed.case.status;
      row.warnings = row.warnings.filter((warning) => !warning.startsWith("CASE_DETAILS_REQUIRED:"));
    }
    if (previous.proposed.finance.isVerified) {
      row.proposed.finance = previous.proposed.finance;
      row.importPlan.historicalFinanceEligible = previous.proposed.finance.isVerified;
      row.importPlan.openingRemainingBalance = previous.proposed.finance.openingRemainingBalance;
      row.warnings = row.warnings.filter((warning) => !warning.includes("finance") && !warning.includes("Financial source text"));
      if (row.status === "REVIEW_REQUIRED" && row.warnings.length === 0) row.status = "READY";
    }
    for (const field of previous.proposed.implantApplyToAll) {
      const source = previous.proposed.implants.find((implant) => implant[field] != null)?.[field] ??
        row.proposed.implants.find((implant) => implant[field] != null)?.[field] ??
        row.proposed.sourceCandidates[field];
      if (source != null) row.proposed.implants = row.proposed.implants.map((implant) => ({ ...implant, [field]: source }));
      row.proposed.implantApplyToAll = [...new Set([...row.proposed.implantApplyToAll, field])];
      const label = field === "qValue" ? "Q" : field === "formerValue" ? "Former" : "Graft";
      row.warnings = row.warnings.filter((warning) => !warning.startsWith(`${label} is a single source value`));
    }
    if (row.status === "REVIEW_REQUIRED" && row.warnings.length === 0) row.status = "READY";
  }
  for (const correction of parsed.data.caseCorrections ?? []) {
    const row = rows.find((candidate) => candidate.rowNumber === correction.rowNumber);
    if (!row) {
      res.status(422).json({ error: `Unknown import row ${correction.rowNumber}.` });
      return;
    }
    row.proposed.case.procedureDate = correction.procedureDate;
    row.proposed.case.treatingDoctor = correction.treatingDoctor.trim();
    row.proposed.case.status = correction.status.trim();
    row.warnings = row.warnings.filter((warning) => !warning.startsWith("CASE_DETAILS_REQUIRED:"));
    row.warnings = row.warnings.filter((warning) => !warning.startsWith("DATE_AMBIGUOUS:"));
    if (row.status === "REVIEW_REQUIRED" && row.warnings.length === 0) row.status = "READY";
  }
  for (const correction of parsed.data.financeCorrections ?? []) {
    const row = rows.find((candidate) => candidate.rowNumber === correction.rowNumber);
    if (!row) {
      res.status(422).json({ error: `Unknown import row ${correction.rowNumber}.` });
      return;
    }
    const values = [correction.historicalTotalAmount, correction.historicalPaidAmount, correction.openingRemainingBalance];
    const consistent = correction.historicalTotalAmount != null &&
      correction.historicalPaidAmount != null &&
      correction.openingRemainingBalance != null &&
      correction.historicalTotalAmount === correction.historicalPaidAmount + correction.openingRemainingBalance;
    const statusConsistent =
      (correction.historicalPaymentStatus === "UNPAID" && correction.historicalPaidAmount === 0) ||
      (correction.historicalPaymentStatus === "PAID_IN_FULL" && correction.openingRemainingBalance === 0 && correction.historicalPaidAmount === correction.historicalTotalAmount) ||
      (correction.historicalPaymentStatus === "PARTIALLY_PAID" && (correction.historicalPaidAmount ?? 0) > 0 && (correction.openingRemainingBalance ?? 0) > 0);
    if (correction.isVerified && (!consistent || !statusConsistent || values.some((value) => value == null))) {
      res.status(422).json({ error: "Verified finance requires total, paid, opening remaining, and total = paid + opening remaining." });
      return;
    }
    row.proposed.finance = { ...correction };
    row.importPlan.historicalFinanceEligible = correction.isVerified;
    row.importPlan.openingRemainingBalance = correction.openingRemainingBalance;
    if (correction.isVerified) {
      row.proposed.financeCandidate = row.proposed.financeCandidate ?? row.raw.COST ?? null;
      row.warnings = row.warnings.filter((warning) =>
        !warning.includes("finance requires correction") &&
        !warning.includes("finance.candidate requires review") &&
        !warning.includes("finance.total requires review") &&
        !warning.includes("finance.paid requires review") &&
        !warning.includes("finance.opening_remaining requires review") &&
        !warning.includes("finance.status requires review"));
      if (row.status === "REVIEW_REQUIRED" && row.warnings.length === 0) row.status = "READY";
    } else if (row.status === "READY") {
      row.status = "REVIEW_REQUIRED";
      row.warnings = [...row.warnings, "Finance is unresolved; choose clinical-only or verify corrected values."];
    }
  }
  for (const resolution of parsed.data.implantApplyToAll ?? []) {
    const row = rows.find((candidate) => candidate.rowNumber === resolution.rowNumber);
    if (!row) {
      res.status(422).json({ error: `Unknown import row ${resolution.rowNumber}.` });
      return;
    }
    for (const field of resolution.fields) {
      const source = row.proposed.implants.find((implant) => implant[field] != null)?.[field] ?? row.proposed.sourceCandidates[field];
      if (source == null) {
        res.status(422).json({ error: `No source ${field} value is available for row ${resolution.rowNumber}.` });
        return;
      }
      row.proposed.implants = row.proposed.implants.map((implant) => ({ ...implant, [field]: source }));
      row.proposed.implantApplyToAll = [...new Set([...row.proposed.implantApplyToAll, field])];
      const label = field === "qValue" ? "Q" : field === "formerValue" ? "Former" : "Graft";
      row.warnings = row.warnings.filter((warning) => !warning.startsWith(`${label} is a single source value`));
    }
    if (row.warnings.length === 0 && row.status === "REVIEW_REQUIRED") row.status = "READY";
  }
  for (const row of rows) syncImportPlan(row);
  const summary = {
    ...(batch.summary as Record<string, unknown>),
    ready: rows.filter((row) => row.status === "READY").length,
    reviewRequired: rows.filter((row) => row.status === "REVIEW_REQUIRED").length,
    blocked: rows.filter((row) => row.status === "BLOCKED").length,
    duplicate: rows.filter((row) => row.status === "DUPLICATE").length,
    approvedRows: [...priorApprovals],
  };
  const patchNow = new Date();
  const [updated] = await db.update(importBatchesTable).set({ mappings, normalizedRows: rows, summary, version: batch.version + 1, updatedAt: patchNow }).where(and(
    eq(importBatchesTable.id, batch.id),
    eq(importBatchesTable.tenantId, req.currentTenant!.id),
    eq(importBatchesTable.status, "ANALYZED"),
    eq(importBatchesTable.version, batch.version),
    ...(parsed.data.version ? [eq(importBatchesTable.version, parsed.data.version)] : []),
  )).returning();
  if (!updated) {
    await writeAuditRequired({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: "IMPORT_FAILED",
      entityType: "import_batch", entityId: batch.id, summary: "Stale mapping patch rejected" });
    res.status(409).json({ error: "Import batch changed while mapping; refresh and retry." });
    return;
  }
  for (const mapping of parsed.data.mappings) {
    const destination = lockedCanonicalDestination(mapping.source) ?? mapping.destination;
    await db.insert(importMappingsTable).values({
      tenantId: req.currentTenant!.id,
      sourceKind: "header",
      sourceValue: mapping.source,
      destination,
      confidence: "1",
      approvedBy: req.currentUser!.id,
      approvedAt: new Date(),
    });
  }
  for (const mapping of parsed.data.valueMappings ?? []) {
    await db.insert(importMappingsTable).values({
      tenantId: req.currentTenant!.id,
      sourceKind: "value:implant.system",
      sourceValue: mapping.source,
      destination: mapping.destination,
      confidence: "1",
      approvedBy: req.currentUser!.id,
      approvedAt: new Date(),
    });
  }
  res.json(publicBatch(updated));
});

router.get("/admin/import/universal/current", async (req, res): Promise<void> => {
  const [batch] = await db.select().from(importBatchesTable).where(and(
    eq(importBatchesTable.tenantId, req.currentTenant!.id),
    eq(importBatchesTable.status, "ANALYZED"),
  )).orderBy(desc(importBatchesTable.updatedAt)).limit(1);
  if (!batch) {
    res.status(404).json({ error: "No editable import staging batch was found." });
    return;
  }
  const repaired = await repairStagingMappings(batch, req.currentTenant!.id);
  res.json(publicBatch(repaired));
});

router.get("/admin/import/universal/:id", async (req, res): Promise<void> => {
  const [batch] = await db.select().from(importBatchesTable).where(and(
    eq(importBatchesTable.id, req.params.id),
    eq(importBatchesTable.tenantId, req.currentTenant!.id),
  ));
  if (!batch) {
    res.status(404).json({ error: "Import staging batch not found." });
    return;
  }
  const repaired = await repairStagingMappings(batch, req.currentTenant!.id);
  res.json(publicBatch(repaired));
});

router.post("/admin/import/universal/:id/commit", async (req, res): Promise<void> => {
  const options = universalImportCommitSchema.safeParse(req.body);
  if (!options.success) {
    res.status(400).json({ error: options.error.message });
    return;
  }
  const [batch] = await db.select().from(importBatchesTable).where(and(
    eq(importBatchesTable.id, req.params.id),
    eq(importBatchesTable.tenantId, req.currentTenant!.id),
  ));
  if (!batch) {
    res.status(404).json({ error: "Import staging batch not found." });
    return;
  }
  if (!["ANALYZED", "PILOT_COMMITTED", "PARTIAL_FAILED"].includes(batch.status)) {
    res.status(409).json({ error: "Import staging batch is already committing or finalized." });
    return;
  }
  const rows = batch.normalizedRows as NormalizedRow[];
  const committedRowNumbers = new Set((batch.committedRowNumbers as number[]) ?? []);
  const selected = new Set(options.data.rowNumbers ?? rows.map((row) => row.rowNumber));
  for (const rowNumber of committedRowNumbers) selected.delete(rowNumber);
  const chosen = rows.filter((row) => selected.has(row.rowNumber));
  if (chosen.length === 0) {
    res.status(422).json({ error: "Select at least one row to commit." });
    return;
  }
  const selectedFiles = new Set(chosen.map((row) => row.proposed.patient.fileNumber));
  const missingHistory = rows.filter((row) =>
    row.status === "READY" &&
    selectedFiles.has(row.proposed.patient.fileNumber) &&
    !committedRowNumbers.has(row.rowNumber) &&
    !selected.has(row.rowNumber),
  );
  if (missingHistory.length > 0) {
    res.status(422).json({ error: "Select every READY row for each selected patient/file number; partial patient history is not allowed." });
    return;
  }
  if (options.data.pilot && selectedFiles.size > 5) {
    res.status(422).json({ error: "Pilot import is limited to five distinct patients." });
    return;
  }
  if (chosen.some((row) => row.status !== "READY")) {
    res.status(422).json({ error: "Only READY rows can be committed. Resolve review and blocked rows first." });
    return;
  }
  if (chosen.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.proposed.case.procedureDate))) {
    res.status(422).json({ error: "Every selected row requires an explicitly confirmed clinical procedure date." });
    return;
  }
  if (chosen.some((row) => row.proposed.implants.some((implant) => {
    const explicitCustom = /^custom\s*:/i.test(implant.site) || /^مخصص\s*:/u.test(implant.site);
    return !(FDI_SITES as readonly string[]).includes(implant.site) && !explicitCustom;
  }))) {
    res.status(422).json({ error: "Every implant site must be a valid FDI tooth or an explicitly labeled custom site." });
    return;
  }
  if (options.data.mode === "clinical_and_verified_finance") {
    const unresolved = chosen.filter((row) => {
      const f = row.proposed.finance;
      if (!f || !f.isVerified || f.historicalTotalAmount == null || f.historicalPaidAmount == null || f.openingRemainingBalance == null) return true;
      const consistent = f.historicalTotalAmount === f.historicalPaidAmount + f.openingRemainingBalance;
      const statusConsistent =
        (f.historicalPaymentStatus === "UNPAID" && f.historicalPaidAmount === 0) ||
        (f.historicalPaymentStatus === "PAID_IN_FULL" && f.openingRemainingBalance === 0 && f.historicalPaidAmount === f.historicalTotalAmount) ||
        (f.historicalPaymentStatus === "PARTIALLY_PAID" && f.historicalPaidAmount > 0 && f.openingRemainingBalance > 0) ||
        false;
      return !consistent || !statusConsistent;
    });
    if (unresolved.length) {
      res.status(422).json({ error: "Verified finance mode requires corrected, explicit finance for every selected row." });
      return;
    }
  }
  const claimed = await db.update(importBatchesTable).set({
    status: "COMMITTING",
    version: batch.version + 1,
    updatedAt: new Date(),
  }).where(and(
    eq(importBatchesTable.id, batch.id),
    eq(importBatchesTable.tenantId, req.currentTenant!.id),
    or(eq(importBatchesTable.status, "ANALYZED"), eq(importBatchesTable.status, "PILOT_COMMITTED"), eq(importBatchesTable.status, "PARTIAL_FAILED")),
    eq(importBatchesTable.version, batch.version),
    ...(options.data.version ? [eq(importBatchesTable.version, options.data.version)] : []),
  )).returning();
  if (!claimed.length) {
    await writeAuditRequired({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: "IMPORT_FAILED",
      entityType: "import_batch", entityId: batch.id, summary: "Concurrent import claim rejected" });
    res.status(409).json({ error: "Import batch is being changed or committed; refresh and retry." });
    return;
  }
  const createdRecords: CreatedRecord[] = [...(batch.createdRecords as CreatedRecord[])];
  let committedRowCount = 0;
  let committedGroupCount = 0;
  const committedThisRun: number[] = [];
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of chosen) {
    const group = groups.get(row.proposed.patient.fileNumber) ?? [];
    group.push(row);
    groups.set(row.proposed.patient.fileNumber, group);
  }
  try {
    for (const group of groups.values()) {
      const groupRecords: CreatedRecord[] = [];
      await db.transaction(async (tx) => {
        const firstRow = group[0];
        if (!compatiblePatientIdentity(group)) {
          throw new Error(`Conflicting patient identity for file ${firstRow.proposed.patient.fileNumber}.`);
        }
        const patientMatches = await tx.select().from(patientsTable).where(and(
          eq(patientsTable.tenantId, req.currentTenant!.id),
          eq(patientsTable.fileNumber, firstRow.proposed.patient.fileNumber),
        ));
        let patient = patientMatches[0];
        if (patient && patient.fullNameNormalized !== normalizeArabicSearchText(firstRow.proposed.patient.name)) {
          throw new Error(`File number conflict for ${firstRow.proposed.patient.fileNumber}.`);
        }
        if (!patient) {
          const canonicalMobile = canonicalGroupMobile(group);
          [patient] = await tx.insert(patientsTable).values({
            tenantId: req.currentTenant!.id,
            fileNumber: firstRow.proposed.patient.fileNumber,
            fullName: firstRow.proposed.patient.name,
            fullNameNormalized: normalizeArabicSearchText(firstRow.proposed.patient.name),
            mobileNumber: canonicalMobile,
            mobileNormalized: canonicalMobile ? (() => {
              const normalized = normalizeMobile(canonicalMobile);
              return normalized.ok ? normalized.normalized : null;
            })() : null,
            age: firstRow.proposed.patient.age,
            createdBy: req.currentUser!.id,
            updatedBy: req.currentUser!.id,
            administrativeNote: firstRow.proposed.legacyNotes.join("\n") || null,
          }).returning();
          groupRecords.push({
            table: "patients",
            id: patient.id,
            createdAt: patient.createdAt.toISOString(),
            updatedAt: patient.updatedAt.toISOString(),
          });
        }
        for (const row of group) {
          const existingCase = await tx.select().from(implantCasesTable).where(and(
            eq(implantCasesTable.tenantId, req.currentTenant!.id),
            eq(implantCasesTable.patientId, patient.id),
            eq(implantCasesTable.procedureDate, row.proposed.case.procedureDate),
            isNull(implantCasesTable.archivedAt),
          ));
          if (existingCase.length) throw new Error(`Duplicate case for file ${row.proposed.patient.fileNumber} and date ${row.proposed.case.procedureDate}.`);
          const [caseRow] = await tx.insert(implantCasesTable).values({
            tenantId: req.currentTenant!.id,
            patientId: patient.id,
            procedureDate: row.proposed.case.procedureDate,
            treatingDoctor: row.proposed.case.treatingDoctor,
            caseStatus: row.proposed.case.status,
            prosValue: row.proposed.case.prosValue === "2M" || row.proposed.case.prosValue === "3M" ? row.proposed.case.prosValue : null,
            baseTreatmentAmount: "0",
            legacyCostNote: row.proposed.financeCandidate,
            generalNote: [row.proposed.case.clinicalNote, row.proposed.legacyNotes.join("\n")].filter(Boolean).join("\n") || null,
            createdBy: req.currentUser!.id,
            updatedBy: req.currentUser!.id,
          }).returning();
          groupRecords.push({
            table: "implant_cases",
            id: caseRow.id,
            patientId: patient.id,
            createdAt: caseRow.createdAt.toISOString(),
            updatedAt: caseRow.updatedAt.toISOString(),
          });
          if (options.data.mode === "clinical_and_verified_finance") {
            const finance = row.proposed.finance;
            if (finance.historicalTotalAmount != null && finance.historicalPaidAmount != null &&
                finance.openingRemainingBalance != null &&
                finance.historicalTotalAmount !== finance.historicalPaidAmount + finance.openingRemainingBalance) {
              throw new Error("Historical finance total must equal paid plus opening remaining.");
            }
            const [snapshot] = await tx.insert(caseHistoricalFinanceTable).values({
              tenantId: req.currentTenant!.id,
              caseId: caseRow.id,
              importBatchId: batch.id,
              rawSourceText: row.proposed.financeCandidate ?? "",
              historicalTotalAmount: finance.historicalTotalAmount == null ? null : (finance.historicalTotalAmount / 100).toFixed(2),
              historicalPaidAmount: finance.historicalPaidAmount == null ? null : (finance.historicalPaidAmount / 100).toFixed(2),
              openingRemainingBalance: finance.openingRemainingBalance == null ? null : (finance.openingRemainingBalance / 100).toFixed(2),
              historicalPaymentStatus: finance.historicalPaymentStatus,
              isVerified: true,
              verifiedBy: req.currentUser!.id,
              verifiedAt: new Date(),
            }).returning();
            groupRecords.push({
              table: "case_historical_finance",
              id: snapshot.id,
              patientId: patient.id,
              createdAt: snapshot.createdAt.toISOString(),
              updatedAt: snapshot.updatedAt.toISOString(),
            });
          }
          for (const implant of row.proposed.implants) {
            const [implantRow] = await tx.insert(implantsTable).values({
              tenantId: req.currentTenant!.id,
              implantCaseId: caseRow.id,
              site: implant.site,
              isCustomSite: !(FDI_SITES as readonly string[]).includes(implant.site),
              system: implant.system,
              diameter: sizeNumbers(implant.size).diameter,
              length: sizeNumbers(implant.size).length,
              qValue: implant.qValue,
              formerValue: implant.formerValue,
              graftValue: implant.graftValue,
              implantNote: implant.size ? `Legacy size: ${implant.size}` : null,
              createdBy: req.currentUser!.id,
              updatedBy: req.currentUser!.id,
            }).returning();
            groupRecords.push({
              table: "implants",
              id: implantRow.id,
              patientId: patient.id,
              createdAt: implantRow.createdAt.toISOString(),
              updatedAt: implantRow.updatedAt.toISOString(),
            });
          }
        }
      });
      createdRecords.push(...groupRecords);
      committedRowCount += group.length;
      committedGroupCount += 1;
      committedThisRun.push(...group.map((row) => row.rowNumber));
    }
  } catch (error) {
    if (createdRecords.length > 0) {
      await db.update(importBatchesTable).set({
        status: "PARTIAL_FAILED",
        version: batch.version + 2,
        committedRowNumbers: [...committedRowNumbers, ...committedThisRun],
        createdRecords,
        committedAt: new Date(),
        updatedAt: new Date(),
        summary: {
          ...(batch.summary as Record<string, unknown>),
          committedRows: committedRowCount,
          partial: true,
          pilot: options.data.pilot,
        },
      }).where(and(
        eq(importBatchesTable.id, batch.id),
        eq(importBatchesTable.tenantId, req.currentTenant!.id),
        eq(importBatchesTable.status, "COMMITTING"),
        eq(importBatchesTable.version, batch.version + 1),
      ));
      const errorMessage = error instanceof Error ? error.message : "One patient group failed.";
      await writeAuditRequired({
        tenantId: req.currentTenant!.id,
        userId: req.currentUser!.id,
        action: "IMPORT_FAILED",
        entityType: "import_batch",
        entityId: batch.id,
        summary: `Universal import partially failed after ${committedGroupCount} patient groups`,
        details: { committedGroups: committedGroupCount, committedRows: committedRowCount, error: errorMessage },
      });
      const [partialFailed] = await db.select().from(importBatchesTable).where(and(
        eq(importBatchesTable.id, batch.id),
        eq(importBatchesTable.tenantId, req.currentTenant!.id),
      ));
      res.status(422).json(universalImportPartialFailureResponseSchema.parse({
        error: errorMessage,
        committedGroups: committedGroupCount,
        committedRows: committedRowCount,
        batch: publicBatch(partialFailed),
      }));
      return;
    }
    await db.update(importBatchesTable).set({
      status: "ANALYZED",
      version: batch.version + 2,
      updatedAt: new Date(),
    }).where(and(eq(importBatchesTable.id, batch.id), eq(importBatchesTable.tenantId, req.currentTenant!.id),
      eq(importBatchesTable.status, "COMMITTING"), eq(importBatchesTable.version, batch.version + 1)));
    res.status(422).json({ error: error instanceof Error ? error.message : "Import failed; no patient group was committed." });
    return;
  }
  const [updated] = await db.update(importBatchesTable).set({
    status: options.data.pilot ? "PILOT_COMMITTED" : "COMMITTED",
    version: batch.version + 2,
    committedRowNumbers: [...committedRowNumbers, ...committedThisRun],
    createdRecords,
    committedAt: new Date(),
    updatedAt: new Date(),
    summary: { ...(batch.summary as Record<string, unknown>), committedRows: committedRowCount, pilot: options.data.pilot },
  }).where(and(eq(importBatchesTable.id, batch.id), eq(importBatchesTable.tenantId, req.currentTenant!.id),
    eq(importBatchesTable.status, "COMMITTING"), eq(importBatchesTable.version, batch.version + 1))).returning();
  await writeAuditRequired({
    tenantId: req.currentTenant!.id,
    userId: req.currentUser!.id,
    action: "IMPORT_CONFIRMED",
    entityType: "import_batch",
    entityId: batch.id,
    summary: `Universal import confirmed: ${chosen.length} rows`,
    details: { pilot: options.data.pilot, rows: chosen.map((row) => row.rowNumber) },
  });
  await writeAuditRequired({
    tenantId: req.currentTenant!.id,
    userId: req.currentUser!.id,
    action: "IMPORT_COMPLETED",
    entityType: "import_batch",
    entityId: batch.id,
    summary: `Universal import completed: ${chosen.length} rows`,
    details: { createdRecords: createdRecords.length },
  });
  res.json(universalImportCommitResponseSchema.parse({
    batch: publicBatch(updated),
    importedRows: chosen.length,
    createdRecords: createdRecords.length,
  }));
});

router.post("/admin/import/universal/:id/rollback", async (req, res): Promise<void> => {
  const [batch] = await db.select().from(importBatchesTable).where(and(
    eq(importBatchesTable.id, req.params.id),
    eq(importBatchesTable.tenantId, req.currentTenant!.id),
  ));
  if (!batch || !["COMMITTED", "PILOT_COMMITTED", "PARTIAL_FAILED"].includes(batch.status)) {
    res.status(404).json({ error: "Only a committed or partially failed import batch can be rolled back." });
    return;
  }
  const records = batch.createdRecords as CreatedRecord[];
  const [claimedRollback] = await db.update(importBatchesTable).set({
    status: "ROLLING_BACK", version: batch.version + 1, updatedAt: new Date(),
  }).where(and(
    eq(importBatchesTable.id, batch.id), eq(importBatchesTable.tenantId, req.currentTenant!.id),
    or(eq(importBatchesTable.status, "COMMITTED"), eq(importBatchesTable.status, "PILOT_COMMITTED"), eq(importBatchesTable.status, "PARTIAL_FAILED")),
    eq(importBatchesTable.version, batch.version),
  )).returning();
  if (!claimedRollback) {
    await writeAuditRequired({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: "IMPORT_FAILED",
      entityType: "import_batch", entityId: batch.id, summary: "Concurrent rollback claim rejected" });
    res.status(409).json({ error: "Import batch changed while rollback was starting; refresh and retry." });
    return;
  }
  const implantIds = records.filter((record) => record.table === "implants").map((record) => record.id);
  const caseIds = records.filter((record) => record.table === "implant_cases").map((record) => record.id);
  const patientIds = records.filter((record) => record.table === "patients").map((record) => record.id);
  let rolledBackBatch: typeof importBatchesTable.$inferSelect;
  try {
    await db.transaction(async (tx) => {
       // Historical finance is owned by the imported case and is removed by
       // the case's ON DELETE CASCADE; it is intentionally not treated as an
       // independently editable rollback record.
       const rollbackRecords = records.filter((record) => record.table !== "case_historical_finance");
       const [currentImplants, currentCases, currentPatients] = await Promise.all([
        implantIds.length ? tx.select({ id: implantsTable.id, createdAt: implantsTable.createdAt, updatedAt: implantsTable.updatedAt }).from(implantsTable).where(and(eq(implantsTable.tenantId, req.currentTenant!.id), inArray(implantsTable.id, implantIds))) : [],
        caseIds.length ? tx.select({ id: implantCasesTable.id, createdAt: implantCasesTable.createdAt, updatedAt: implantCasesTable.updatedAt }).from(implantCasesTable).where(and(eq(implantCasesTable.tenantId, req.currentTenant!.id), inArray(implantCasesTable.id, caseIds))) : [],
        patientIds.length ? tx.select({ id: patientsTable.id, createdAt: patientsTable.createdAt, updatedAt: patientsTable.updatedAt }).from(patientsTable).where(and(eq(patientsTable.tenantId, req.currentTenant!.id), inArray(patientsTable.id, patientIds))) : [],
      ]);
      const currentById = new Map([...currentImplants, ...currentCases, ...currentPatients].map((record) => [record.id, record]));
       if (rollbackRecords.some((record) => {
        const current = currentById.get(record.id);
        return !current ||
          current.createdAt.toISOString() !== record.createdAt ||
          current.updatedAt.toISOString() !== record.updatedAt;
      })) {
        throw new Error("Rollback blocked: an imported record was modified after import.");
      }
      if (implantIds.length) await tx.delete(implantsTable).where(and(eq(implantsTable.tenantId, req.currentTenant!.id), inArray(implantsTable.id, implantIds)));
      if (caseIds.length) {
        const references = await tx.select({ id: implantCasesTable.id }).from(implantCasesTable).where(and(eq(implantCasesTable.tenantId, req.currentTenant!.id), inArray(implantCasesTable.id, caseIds), isNull(implantCasesTable.archivedAt)));
        if (references.length !== caseIds.length) throw new Error("Rollback blocked: imported cases were archived or changed.");
        await tx.delete(implantCasesTable).where(and(eq(implantCasesTable.tenantId, req.currentTenant!.id), inArray(implantCasesTable.id, caseIds)));
      }
      if (patientIds.length) {
        const references = await tx.select({ id: patientsTable.id }).from(patientsTable).where(and(eq(patientsTable.tenantId, req.currentTenant!.id), inArray(patientsTable.id, patientIds), isNull(patientsTable.archivedAt)));
        if (references.length !== patientIds.length) throw new Error("Rollback blocked: imported patients were archived or changed.");
        await tx.delete(patientsTable).where(and(eq(patientsTable.tenantId, req.currentTenant!.id), inArray(patientsTable.id, patientIds)));
      }
      const [finalBatch] = await tx.update(importBatchesTable).set({
        status: "ROLLED_BACK", version: batch.version + 2, rolledBackAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(importBatchesTable.id, batch.id), eq(importBatchesTable.tenantId, req.currentTenant!.id),
        eq(importBatchesTable.status, "ROLLING_BACK"), eq(importBatchesTable.version, batch.version + 1))).returning();
      if (!finalBatch) throw new Error("Rollback lost its lifecycle claim.");
      rolledBackBatch = finalBatch;
    });
  } catch (error) {
    await db.update(importBatchesTable).set({ status: batch.status, version: batch.version + 2, updatedAt: new Date() }).where(and(
      eq(importBatchesTable.id, batch.id), eq(importBatchesTable.tenantId, req.currentTenant!.id),
      eq(importBatchesTable.status, "ROLLING_BACK"), eq(importBatchesTable.version, batch.version + 1),
    ));
    res.status(409).json({ error: error instanceof Error ? error.message : "Rollback blocked because imported records were changed or used." });
    return;
  }
  await writeAuditRequired({
    tenantId: req.currentTenant!.id,
    userId: req.currentUser!.id,
    action: "IMPORT_ROLLED_BACK",
    entityType: "import_batch",
    entityId: batch.id,
    summary: "Universal import batch rolled back",
  });
  res.json(universalImportRollbackResponseSchema.parse({
    batch: publicBatch(rolledBackBatch!),
    rolledBack: true,
  }));
});

export default router;