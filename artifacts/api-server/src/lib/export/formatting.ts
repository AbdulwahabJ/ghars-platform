import type {
  ReportCellValue,
  ReportColumn,
  ReportDefinition,
  ReportDirection,
  ReportLocale,
  ReportRow,
  ReportSection,
  ExportOptions,
} from "./types.js";

export const GHARS_NAVY = "#0D1B3D";
export const GHARS_TEAL = "#178F8B";
export const GHARS_PALE_TEAL = "#E7F4F3";
export const GHARS_LIGHT_NAVY = "#E9EDF5";

export const DEFAULT_RIYADH_TIME_ZONE = "Asia/Riyadh";

/**
 * System-generated numbers are always written with Latin glyphs.  This is
 * deliberately not applied to arbitrary report text: names, notes and
 * messages are user-entered content and must retain their original spelling.
 */
export function normalizeSystemDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Normalize a value only when it is itself a numeric identifier/value. */
export function normalizeSystemNumericText(value: string): string {
  const normalized = normalizeSystemDigits(value);
  return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(normalized) ? normalized : value;
}

/** Remove path separators, control characters and reserved Windows names. */
export function safeFilename(
  value: string | undefined | null,
  extension = "",
): string {
  const requestedExtension = extension
    ? extension.startsWith(".")
      ? extension
      : `.${extension}`
    : "";
  const normalized = (value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 150)
    .replace(/-+$/g, "");
  const stem = normalized || "ghars-report";
  const withoutExtension =
    requestedExtension && stem.toLowerCase().endsWith(requestedExtension.toLowerCase())
      ? stem.slice(0, -requestedExtension.length)
      : stem;
  const safeStem = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(withoutExtension)
    ? `ghars-${withoutExtension}`
    : withoutExtension;
  return `${safeStem || "ghars-report"}${requestedExtension}`;
}

export const sanitizeFilename = safeFilename;

export function toDate(value: ReportCellValue): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

export function formatRiyadhTimestamp(
  value: Date | string = new Date(),
  locale: ReportLocale = "en",
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  void locale;
  // Deliberately use English Gregorian month names for both UI locales.  This
  // is an export format (not UI copy), and must not vary with the machine's
  // Arabic calendar settings.
  const parts = new Intl.DateTimeFormat("en-US-u-nu-latn", {
    numberingSystem: "latn",
    timeZone: DEFAULT_RIYADH_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return normalizeSystemDigits(`${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`);
}

export function formatRiyadhDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US-u-nu-latn", {
    numberingSystem: "latn",
    timeZone: DEFAULT_RIYADH_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return normalizeSystemDigits(`${part("day")} ${part("month")} ${part("year")}`);
}

export function formatFilterValue(value: ReportCellValue, locale: ReportLocale): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return formatRiyadhTimestamp(value, locale);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    return value.includes("T") ? formatRiyadhTimestamp(value, locale) : formatRiyadhDate(value);
  }
  if (typeof value === "boolean") return value ? (locale === "ar" ? "نعم" : "Yes") : locale === "ar" ? "لا" : "No";
  return String(value);
}

export function formatCellValue(
  value: ReportCellValue,
  column: ReportColumn,
  row: ReportRow,
  locale: ReportLocale = "en",
): string {
  if (column.format) {
    const formatted = column.format(value, row);
    return column.systemDigits ? normalizeSystemDigits(formatted) : formatted;
  }
  if (value === null || value === undefined || value === "") return "—";
  if (column.type === "date") {
    if (!(value instanceof Date || typeof value === "string")) return "";
    const date = value instanceof Date ? value : new Date(value);
    // Midnight values conventionally represent a date-only field. Values
    // carrying a time retain the required Riyadh 12-hour timestamp.
    return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0
      ? formatRiyadhDate(date)
      : formatRiyadhTimestamp(date, locale);
  }
  if (column.type === "percentage" && typeof value === "number") {
    return normalizeSystemDigits(`${new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-u-nu-latn", {
      numberingSystem: "latn",
      maximumFractionDigits: 2,
    }).format(value * 100)}%`);
  }
  if (column.type === "currency" && typeof value === "number") {
    const amount = new Intl.NumberFormat("en-US-u-nu-latn", {
      numberingSystem: "latn",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
    return normalizeSystemDigits(locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`);
  }
  if (
    (column.type === "number" || column.type === "currency" || column.type === "percentage") &&
    typeof value === "string"
  ) {
    return normalizeSystemDigits(value);
  }
  if (typeof value === "boolean") return value ? (locale === "ar" ? "نعم" : "Yes") : locale === "ar" ? "لا" : "No";
  return column.systemDigits ? normalizeSystemDigits(String(value)) : String(value);
}

/**
 * Keep logical text intact for PDF text extraction and search. PDFKit's
 * right-aligned text plus Cairo's Arabic glyph coverage provides the
 * direction-aware presentation without corrupting the searchable value.
 */
export function prepareText(value: string, direction: ReportDirection): string {
  // The direction is consumed by renderer alignment; do not reverse the
  // string because that would make text extraction/search return a different
  // value from the report's source row.
  void direction;
  return value;
}

export function resolveReport(
  report: ReportDefinition,
  options: ExportOptions = {},
): {
  direction: ReportDirection;
  locale: ReportLocale;
  orientation: "portrait" | "landscape";
  sections: ReportSection[];
} {
  const sections = report.sections?.length
    ? report.sections
    : [{ columns: report.columns ?? [], rows: report.rows ?? [] }];
  return {
    direction: options.direction ?? report.metadata.direction ?? (report.metadata.locale === "ar" ? "rtl" : "ltr"),
    locale: options.locale ?? report.metadata.locale ?? "en",
    orientation: options.orientation ?? report.metadata.orientation ?? "portrait",
    sections,
  };
}