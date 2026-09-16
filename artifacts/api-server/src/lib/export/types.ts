/**
 * The format-neutral report contract. Routes should only assemble this
 * structure; the PDF and XLSX renderers intentionally contain no business
 * or database knowledge.
 */

export type ReportDirection = "rtl" | "ltr";
export type ReportOrientation = "portrait" | "landscape";
export type ReportLocale = "ar" | "en" | "mixed";

export type ReportCellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

export type ReportColumnType =
  | "text"
  | "number"
  | "currency"
  | "percentage"
  | "date"
  | "boolean";

export interface ReportColumn {
  /** Stable key used to find a value in a row. */
  key: string;
  /** Human-readable heading. */
  header: string;
  type?: ReportColumnType;
  /** Optional fixed width (in PDF points or Excel character units). */
  width?: number;
  align?: "left" | "center" | "right";
  /** Normalize digits in technical identifiers (file/case numbers). */
  systemDigits?: boolean;
  /** An optional value formatter used by both renderers. */
  format?: (value: ReportCellValue, row: ReportRow) => string;
}

export type ReportRow = Record<string, ReportCellValue>;

export interface ReportSection {
  title?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}

export interface ReportMetadata {
  title: string;
  subtitle?: string;
  /** The clinic is shown as a secondary identity; it never replaces Ghars branding. */
  clinicName?: string;
  generatedAt?: Date | string;
  generatedBy?: string;
  filters?: Record<string, ReportCellValue>;
  filename?: string;
  locale?: ReportLocale;
  direction?: ReportDirection;
  orientation?: ReportOrientation;
}

export interface ReportDefinition {
  metadata: ReportMetadata;
  columns?: ReportColumn[];
  rows?: ReportRow[];
  sections?: ReportSection[];
}

export interface ExportOptions {
  direction?: ReportDirection;
  orientation?: ReportOrientation;
  locale?: ReportLocale;
  filename?: string;
}