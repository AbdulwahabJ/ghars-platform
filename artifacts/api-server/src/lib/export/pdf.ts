import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import {
  formatCellValue,
  formatFilterValue,
  formatRiyadhTimestamp,
  GHARS_LIGHT_NAVY,
  GHARS_NAVY,
  GHARS_PALE_TEAL,
  GHARS_TEAL,
  prepareText,
  resolveReport,
  safeFilename,
} from "./formatting.js";
import type { ExportOptions, ReportColumn, ReportDefinition, ReportRow } from "./types.js";

const require = createRequire(import.meta.url);
const cairoFont = require.resolve("@fontsource/cairo/files/cairo-arabic-400-normal.woff");
const cairoBoldFont = require.resolve("@fontsource/cairo/files/cairo-arabic-700-normal.woff");
const cairoLatinFont = require.resolve("@fontsource/cairo/files/cairo-latin-400-normal.woff");
const cairoLatinBoldFont = require.resolve("@fontsource/cairo/files/cairo-latin-700-normal.woff");
const ARABIC_SCRIPT_RE = /[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff]/u;

function fontForText(value: string, bold = false): string {
  return ARABIC_SCRIPT_RE.test(value)
    ? bold
      ? cairoBoldFont
      : cairoFont
    : bold
      ? cairoLatinBoldFont
      : cairoLatinFont;
}

export interface PdfExport {
  contentType: "application/pdf";
  filename: string;
  data: Buffer;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const HEADER_HEIGHT = 76;
const FOOTER_HEIGHT = 24;

function pdfValue(value: string, direction: "rtl" | "ltr"): string {
  const withoutDirectionControls = value.replace(
    /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,
    "",
  );
  const compatiblePunctuation =
    direction === "rtl" && ARABIC_SCRIPT_RE.test(withoutDirectionControls)
      ? withoutDirectionControls
          .replace(/%/g, "٪")
          .replace(/,/g, "،")
          .replace(/[/:|]/g, " ")
          .replace(/\.(?=\s|$)/g, " ")
      : withoutDirectionControls;
  return prepareText(compatiblePunctuation, direction);
}

function columnWidths(
  columns: ReportColumn[],
  width: number,
  rows: ReportRow[] = [],
  locale: "ar" | "en" | "mixed" = "en",
): number[] {
  const specified = columns.reduce((sum, column) => sum + (column.width ?? 0), 0);
  const unspecifiedColumns = columns.filter((column) => column.width === undefined);
  const remaining = Math.max(0, width - specified);
  if (!unspecifiedColumns.length) return columns.map((column) => column.width ?? 0);
  const estimates = unspecifiedColumns.map((column) => {
    const longest = Math.max(
      column.header.length,
      ...rows.slice(0, 100).map((row) => formatCellValue(row[column.key], column, row, locale).length),
    );
    const typeMinimum = column.type === "text" ? 72 : column.type === "date" ? 62 : column.type === "boolean" ? 42 : 52;
    return Math.min(240, Math.max(typeMinimum, longest * 4.2 + 14));
  });
  const totalEstimate = estimates.reduce((sum, value) => sum + value, 0);
  const scale = totalEstimate > remaining && remaining > 0 ? remaining / totalEstimate : 1;
  const computed = estimates.map((value) => Math.max(38, value * scale));
  const computedTotal = computed.reduce((sum, value) => sum + value, 0);
  const correction = computedTotal > remaining ? remaining / computedTotal : 1;
  let next = 0;
  return columns.map((column) => column.width ?? (computed[next++] * correction));
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function renderPdf(
  report: ReportDefinition,
  options: ExportOptions = {},
): Promise<PdfExport> {
  const resolved = resolveReport(report, options);
  const pdfOptions = {
    size: "A4",
    layout: resolved.orientation,
    margins: { top: MARGIN + HEADER_HEIGHT, bottom: MARGIN + FOOTER_HEIGHT, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: report.metadata.title,
      Author: "Ghars",
      Subject: report.metadata.subtitle ?? "Ghars report",
      Creator: "Ghars export engine",
      Keywords: "Ghars, report",
    },
  };
  const doc = new PDFDocument(pdfOptions);
  const pageWidth = resolved.orientation === "landscape" ? PAGE_HEIGHT : PAGE_WIDTH;
  const pageHeight = resolved.orientation === "landscape" ? PAGE_WIDTH : PAGE_HEIGHT;
  const contentWidth = pageWidth - MARGIN * 2;
  const direction = resolved.direction;

  const drawBrandHeader = (sectionTitle?: string) => {
    const top = 22;
    doc.save();
    doc.fillColor(GHARS_NAVY).rect(MARGIN, top, contentWidth, 3).fill();
    doc.fillColor(GHARS_NAVY).font(cairoLatinBoldFont).fontSize(17);
    const brand = resolved.locale === "ar" ? "غرس" : "Ghars";
    doc.font(resolved.locale === "ar" ? cairoBoldFont : cairoLatinBoldFont)
      .text(brand, MARGIN, top + 10, { width: contentWidth / 2, align: "left", lineBreak: false });
    doc.fillColor(GHARS_TEAL).fontSize(8).font(cairoLatinFont);
      doc.text(resolved.locale === "ar" ? "غرس" : "Ghars Dental Care", MARGIN, top + 33, {
        width: contentWidth / 2, align: "left", lineBreak: false,
      });
    if (report.metadata.clinicName) {
      doc.fillColor("#536078").fontSize(8).font(fontForText(report.metadata.clinicName));
      doc.text(pdfValue(report.metadata.clinicName, direction), MARGIN + contentWidth / 2, top + 33, {
        width: contentWidth / 2,
        align: direction === "rtl" ? "right" : "right",
        lineBreak: false,
      });
    }
    doc.restore();
    doc.fillColor(GHARS_NAVY).font(fontForText(report.metadata.title, true)).fontSize(16);
    doc.text(pdfValue(report.metadata.title, direction), MARGIN, MARGIN + 26, {
      width: contentWidth,
      align: direction === "rtl" ? "right" : "left",
      lineBreak: false,
    });
    if (report.metadata.subtitle) {
      doc.fillColor("#536078").font(fontForText(report.metadata.subtitle)).fontSize(9);
      doc.text(pdfValue(report.metadata.subtitle, direction), MARGIN, MARGIN + 48, {
        width: contentWidth,
        align: direction === "rtl" ? "right" : "left",
        lineBreak: false,
      });
    }
    if (sectionTitle) {
      doc.fillColor(GHARS_TEAL).font(fontForText(sectionTitle, true)).fontSize(10);
      doc.text(pdfValue(sectionTitle, direction), MARGIN, MARGIN + 62, {
        width: contentWidth,
        align: direction === "rtl" ? "right" : "left",
        lineBreak: false,
      });
    }
    doc.fillColor("#18243d").font(cairoFont).fontSize(9);
  };

  drawBrandHeader();
  let y = MARGIN + HEADER_HEIGHT;
  const newPage = (sectionTitle?: string) => {
    doc.addPage();
    drawBrandHeader(sectionTitle);
    y = MARGIN + HEADER_HEIGHT;
  };
  const ensureSpace = (needed: number, sectionTitle?: string) => {
    if (y + needed > pageHeight - MARGIN - FOOTER_HEIGHT) newPage(sectionTitle);
  };

  // Filters are metadata, not table data, and remain searchable/selectable.
  const generatedLabel = resolved.locale === "ar" ? "تاريخ الإنشاء" : "Generated";
  const generatedByLabel = resolved.locale === "ar" ? "بواسطة" : "By";
  const filterParts = [
    `${generatedLabel}: ${formatRiyadhTimestamp(report.metadata.generatedAt ?? new Date(), resolved.locale)}`,
    report.metadata.generatedBy ? `${generatedByLabel}: ${report.metadata.generatedBy}` : "",
    ...Object.entries(report.metadata.filters ?? {}).map(
      ([key, value]) => `${key}: ${formatFilterValue(value, resolved.locale)}`,
    ),
  ].filter(Boolean);
  const filterText = filterParts.join(resolved.locale === "ar" ? "،  " : "  •  ");
  doc.font(fontForText(filterText)).fontSize(8);
  const filterHeight = doc.heightOfString(filterText, { width: contentWidth });
  ensureSpace(filterHeight + 12);
  doc.fillColor("#536078").font(fontForText(filterText)).fontSize(8).text(pdfValue(filterText, direction), MARGIN, y, {
    width: contentWidth,
    align: direction === "rtl" ? "right" : "left",
  });
  y += filterHeight + 12;

  for (const section of resolved.sections) {
    if (section.title && y > MARGIN + HEADER_HEIGHT) {
      ensureSpace(24, section.title);
      doc.fillColor(GHARS_TEAL).font(fontForText(section.title, true)).fontSize(11).text(pdfValue(section.title, direction), MARGIN, y, {
        width: contentWidth,
        align: direction === "rtl" ? "right" : "left",
      });
      y += 22;
    }
    const displayColumns =
      direction === "rtl" ? [...section.columns].reverse() : section.columns;
    const widths = columnWidths(displayColumns, contentWidth, section.rows, resolved.locale);
    const headerHeight = Math.max(25, ...displayColumns.map((column, index) => {
      doc.font(fontForText(column.header, true)).fontSize(8);
      return doc.heightOfString(pdfValue(column.header, direction), {
        width: Math.max(1, widths[index] - 10),
        lineGap: 1,
      }) + 10;
    }));
    const drawTableHeader = () => {
      ensureSpace(headerHeight + 2, section.title);
      let x = MARGIN;
      doc.fillColor(GHARS_NAVY).rect(MARGIN, y, contentWidth, headerHeight).fill();
      displayColumns.forEach((column, index) => {
        doc.fillColor("#FFFFFF").font(fontForText(column.header, true)).fontSize(8).text(pdfValue(column.header, direction), x + 5, y + 5, {
          width: Math.max(1, widths[index] - 10),
          align: column.align ?? (direction === "rtl" ? "right" : "left"),
          height: headerHeight - 6,
          lineGap: 1,
        });
        x += widths[index];
      });
      y += headerHeight;
    };
    drawTableHeader();
    for (const row of section.rows) {
      const values = displayColumns.map((column) =>
        pdfValue(formatCellValue(row[column.key], column, row, resolved.locale), direction),
      );
      const heights = values.map((value, index) => {
        doc.font(fontForText(value));
        return Math.max(18, doc.heightOfString(value || " ", {
          width: Math.max(1, widths[index] - 10),
          lineGap: 1,
        }) + 8);
      });
      const rowHeight = Math.max(...heights);
      if (y + rowHeight > pageHeight - MARGIN - FOOTER_HEIGHT) {
        newPage(section.title);
        drawTableHeader();
      }
      let x = MARGIN;
      doc.fillColor(y % 2 ? "#FFFFFF" : GHARS_PALE_TEAL).rect(MARGIN, y, contentWidth, rowHeight).fill();
      displayColumns.forEach((column, index) => {
        doc.fillColor("#18243d").font(fontForText(values[index])).fontSize(8).text(values[index], x + 5, y + 4, {
          width: Math.max(1, widths[index] - 10),
          height: rowHeight - 6,
          align: column.align ?? (direction === "rtl" ? "right" : "left"),
          lineGap: 1,
        });
        x += widths[index];
      });
      doc.strokeColor(GHARS_LIGHT_NAVY).lineWidth(0.4).moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + contentWidth, y + rowHeight).stroke();
      y += rowHeight;
    }
    y += 12;
  }

  // bufferPages lets us add an accurate "Page X of Y" after all automatic
  // pagination has completed.
  const pageRange = doc.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    doc.switchToPage(pageRange.start + index);
    const footer = resolved.locale === "ar"
      ? `غرس | صفحة ${index + 1} من ${pageRange.count}`
      : `Ghars | Page ${index + 1} of ${pageRange.count}`;
    doc.fillColor("#536078").font(fontForText(footer)).fontSize(7);
    // Keep the baseline inside PDFKit's bottom margin; otherwise text() can
    // helpfully create an extra page while we are switching buffered pages.
    doc.text(footer, MARGIN, pageHeight - MARGIN - FOOTER_HEIGHT - 15, {
      width: contentWidth,
      align: "center",
      lineBreak: false,
    });
  }
  const data = await collectPdf(doc);
  return {
    contentType: "application/pdf",
    filename: safeFilename(options.filename ?? report.metadata.filename ?? report.metadata.title, ".pdf"),
    data,
  };
}

export const createPdfExport = renderPdf;
export const generatePdf = renderPdf;