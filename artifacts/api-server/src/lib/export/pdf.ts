import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import { logger } from "../logger.js";
import {
  formatCellValue,
  formatFilterValue,
  formatRiyadhTimestamp,
  GHARS_LIGHT_NAVY,
  GHARS_NAVY,
  GHARS_PALE_TEAL,
  GHARS_TEAL,
  resolveReport,
  safeFilename,
} from "./formatting.js";
import type {
  ExportOptions,
  ReportColumn,
  ReportDefinition,
  ReportRow,
} from "./types.js";

const require = createRequire(import.meta.url);
const moduleDir = resolve(fileURLToPath(import.meta.url), "..");
const cairoFontPath = [
  resolve(moduleDir, "assets/Cairo-Variable.ttf"),
  resolve(moduleDir, "../../assets/Cairo-Variable.ttf"),
  require.resolve("@fontsource/cairo/files/cairo-arabic-400-normal.woff"),
].find(existsSync);
if (!cairoFontPath) throw new Error("Cairo PDF font asset is missing from the API server build");
const cairoFontData = `data:font/ttf;base64,${readFileSync(cairoFontPath).toString("base64")}`;

let browserPromise: Promise<Browser> | undefined;

export interface PdfExport {
  contentType: "application/pdf";
  filename: string;
  data: Buffer;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function valueDirection(value: string, column: ReportColumn, documentDirection: "rtl" | "ltr"): "rtl" | "ltr" | "auto" {
  if (column.type === "number" || column.type === "currency" || column.type === "percentage" ||
      column.type === "date" || column.type === "boolean" || column.systemDigits ||
      /^[+\d][\d\s()./-]*$/u.test(value) ||
      /^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)+$/u.test(value)) return "ltr";
  void documentDirection;
  return "auto";
}

function columnStyle(column: ReportColumn): string {
  return column.width === undefined
    ? ""
    : `width:${Math.max(72, column.width)}pt;min-width:72pt;`;
}

function renderMetadata(report: ReportDefinition, locale: "ar" | "en" | "mixed"): string {
  const arabic = locale === "ar";
  const generatedLabel = arabic ? "تاريخ الإنشاء" : "Generated";
  const byLabel = arabic ? "بواسطة" : "By";
  const filters = Object.entries(report.metadata.filters ?? {})
    .map(([key, value]) => `<div class="meta-item"><span class="label">${escapeHtml(key)}</span><span class="value" dir="auto">${escapeHtml(formatFilterValue(value, locale))}</span></div>`)
    .join("");
  return `<div class="metadata">
    <div class="meta-item"><span class="label">${generatedLabel}</span><span class="value" dir="ltr">${escapeHtml(formatRiyadhTimestamp(report.metadata.generatedAt ?? new Date(), locale))}</span></div>
    ${report.metadata.generatedBy ? `<div class="meta-item"><span class="label">${byLabel}</span><span class="value" dir="auto">${escapeHtml(report.metadata.generatedBy)}</span></div>` : ""}
    ${filters}
  </div>`;
}

function renderCell(value: ReportRow[string], column: ReportColumn, row: ReportRow, locale: "ar" | "en" | "mixed", direction: "rtl" | "ltr"): string {
  const text = formatCellValue(value, column, row, locale);
  const dir = valueDirection(text, column, direction);
  const align = column.align ?? (column.type === "number" || column.type === "currency" || column.type === "percentage" || column.type === "date" || column.type === "boolean"
    ? "center"
    : direction === "rtl" ? "right" : "left");
  const noWrap = column.systemDigits || column.type === "number" || column.type === "currency" ||
    column.type === "percentage" || column.type === "date" || column.type === "boolean";
  return `<td${noWrap ? ' class="no-wrap"' : ""} dir="${dir}" style="${columnStyle(column)}text-align:${align};unicode-bidi:isolate">${escapeHtml(text)}</td>`;
}

function renderSection(section: { title?: string; columns: ReportColumn[]; rows: ReportRow[] }, locale: "ar" | "en" | "mixed", direction: "rtl" | "ltr"): string {
  const headers = section.columns.map((column) => `<th style="${columnStyle(column)}" scope="col">${escapeHtml(column.header)}</th>`).join("");
  const rows = section.rows.map((row) => `<tr>${section.columns.map((column) => renderCell(row[column.key], column, row, locale, direction)).join("")}</tr>`).join("");
  return `<section class="report-section">
    ${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}
    <table><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${Math.max(1, section.columns.length)}" class="empty">—</td></tr>`}</tbody></table>
  </section>`;
}

export function renderReportHtml(report: ReportDefinition, options: ExportOptions = {}): string {
  const resolved = resolveReport(report, options);
  const locale = resolved.locale === "ar" ? "ar" : "en";
  const direction = resolved.direction;
  const sections = resolved.sections.map((section) => renderSection(section, locale, direction)).join("");
  const title = escapeHtml(report.metadata.title);
  const subtitle = report.metadata.subtitle ? `<p class="subtitle">${escapeHtml(report.metadata.subtitle)}</p>` : "";
  const clinic = report.metadata.clinicName ? `<span class="clinic" dir="auto">${escapeHtml(report.metadata.clinicName)}</span>` : "";
  const brand = locale === "ar" ? "غرس" : "Ghars";
  const orientation = resolved.orientation === "landscape" ? "landscape" : "portrait";
  return `<!doctype html><html lang="${locale}" dir="${direction}"><head><meta charset="utf-8"><title>${title}</title>
<style>
@font-face{font-family:Cairo;src:url("${cairoFontData}") format("truetype");font-weight:100 900;font-style:normal;font-display:block}
@page{size:A4 ${orientation};margin:16mm 12mm 16mm}
:root{font-family:Cairo,"Noto Sans Arabic",Arial,sans-serif;color:#18243d;background:#fff}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
body{direction:${direction};text-align:${direction === "rtl" ? "right" : "left"};font-size:9pt;line-height:1.45}
.document{width:100%}.top-rule{height:3px;background:${GHARS_NAVY};margin-bottom:10px}
.brand-row{display:flex;justify-content:space-between;align-items:center;gap:16px;color:${GHARS_NAVY};font-size:17pt;font-weight:700}
.clinic{font-size:9pt;color:#536078;font-weight:500;max-width:50%;overflow-wrap:anywhere}
h1{font-size:16pt;line-height:1.25;color:${GHARS_NAVY};margin:11px 0 2px;break-after:avoid-page}
.subtitle{font-size:9pt;color:#536078;margin:0 0 9px;break-after:avoid-page}
.metadata{display:flex;flex-wrap:wrap;gap:4px 16px;border-top:1px solid ${GHARS_LIGHT_NAVY};border-bottom:1px solid ${GHARS_LIGHT_NAVY};padding:6px 0;margin:8px 0 14px;color:#536078;font-size:8pt}
.meta-item{display:inline-flex;gap:5px;max-width:100%;unicode-bidi:isolate}.meta-item .label{font-weight:700}.meta-item .value{overflow-wrap:anywhere}
.report-section{margin:0 0 15px;break-inside:auto}.report-section h2{font-size:11pt;color:${GHARS_TEAL};margin:0 0 6px;padding-bottom:3px;border-bottom:2px solid ${GHARS_TEAL};break-after:avoid-page}
table{width:100%;border-collapse:collapse;table-layout:auto;margin:0 0 5px}
thead{display:table-header-group}th{background:${GHARS_NAVY};color:#fff;font-weight:700;text-align:${direction === "rtl" ? "right" : "left"};padding:6px 6px;min-width:72pt;white-space:normal;overflow-wrap:anywhere}
td{padding:5px 6px;vertical-align:top;border-bottom:1px solid ${GHARS_LIGHT_NAVY};overflow-wrap:anywhere;word-break:normal;min-width:72pt}
td.no-wrap{white-space:nowrap;overflow-wrap:normal}
tbody tr:nth-child(even){background:${GHARS_PALE_TEAL}}tr{break-inside:avoid;page-break-inside:avoid}.empty{text-align:center;color:#536078}
@media print{.report-section h2{break-after:avoid-page}.report-section{break-before:auto}table{break-inside:auto}td,th{font-size:8.5pt}}
</style></head><body><main class="document">
<header><div class="top-rule"></div><div class="brand-row"><span>${brand}</span>${clinic}</div><h1>${title}</h1>${subtitle}</header>
${renderMetadata(report, locale)}${sections}</main></body></html>`;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const configured = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
      const local = configured || "/repl/tools/bin/chromium";
      const executablePath = process.env.NODE_ENV === "production"
        ? await chromium.executablePath()
        : existsSync(local) ? local : await chromium.executablePath();
      const browser = await puppeteer.launch({
        executablePath,
        args: process.env.NODE_ENV === "production" ? chromium.args : ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
        defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
      });
      browser.on("disconnected", () => {
        browserPromise = undefined;
      });
      return browser;
    })().catch((error) => {
      browserPromise = undefined;
      logger.error({ err: error }, "Ghars PDF Chromium launch failed");
      throw new Error("Unable to generate the PDF correctly. Please try again.");
    });
  }
  return browserPromise;
}

export async function closePdfBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = undefined;
  if (!pending) return;
  const browser = await pending.catch(() => undefined);
  await browser?.close().catch(() => undefined);
}

export async function renderPdf(report: ReportDefinition, options: ExportOptions = {}): Promise<PdfExport> {
  const resolved = resolveReport(report, options);
  let page: Awaited<ReturnType<Browser["newPage"]>> | undefined;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(renderReportHtml(report, options), { waitUntil: "load" });
    await page.evaluate(async () => {
      const pageDocument = (globalThis as unknown as {
        document: { fonts: { ready: Promise<unknown>; check: (font: string) => boolean } };
      }).document;
      await pageDocument.fonts.ready;
      if (!pageDocument.fonts.check("16px Cairo")) throw new Error("Cairo font failed to load");
    });
    const data = await page.pdf({
      format: "A4",
      landscape: resolved.orientation === "landscape",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-family:Cairo,Arial,sans-serif;width:100%;font-size:8px;color:#536078;text-align:center;direction:${resolved.direction}">${resolved.locale === "ar" ? "غرس | صفحة" : "Ghars | Page"} <span class="pageNumber"></span> ${resolved.locale === "ar" ? "من" : "of"} <span class="totalPages"></span></div>`,
      margin: { top: "16mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });
    return {
      contentType: "application/pdf",
      filename: safeFilename(options.filename ?? report.metadata.filename ?? report.metadata.title, ".pdf"),
      data: Buffer.from(data),
    };
  } catch (error) {
    logger.error({ err: error, reportTitle: report.metadata.title }, "Ghars PDF rendering failed");
    throw new Error(resolved.locale === "ar"
      ? "تعذر إنشاء ملف PDF بشكل صحيح. يرجى المحاولة مرة أخرى."
      : "Unable to generate the PDF correctly. Please try again.");
  } finally {
    await page?.close().catch(() => undefined);
  }
}

export const createPdfExport = renderPdf;
export const generatePdf = renderPdf;