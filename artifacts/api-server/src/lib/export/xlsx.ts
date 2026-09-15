import ExcelJS from "exceljs";
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
  toDate,
} from "./formatting.js";
import type {
  ExportOptions,
  ReportColumn,
  ReportDefinition,
  ReportRow,
  ReportSection,
} from "./types.js";

export interface XlsxExport {
  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  filename: string;
  data: Buffer;
}

function excelValue(value: ReportRow[string], column: ReportColumn): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return "";
  if (column.type === "date") return toDate(value) ?? String(value);
  if ((column.type === "number" || column.type === "currency" || column.type === "percentage") && typeof value === "number") {
    return value;
  }
  if (column.type === "boolean" && typeof value === "boolean") return value;
  return String(value);
}

function configureSheet(
  worksheet: ExcelJS.Worksheet,
  report: ReportDefinition,
  section: ReportSection,
  options: ReturnType<typeof resolveReport>,
): void {
  const lastColumn = Math.max(1, section.columns.length);
  const lastLetter = worksheet.getColumn(lastColumn).letter;
  worksheet.views = [{ rightToLeft: options.direction === "rtl", state: "frozen", ySplit: 6 }];
  worksheet.mergeCells(`A1:${lastLetter}1`);
  const title = worksheet.getCell("A1");
  title.value = report.metadata.title;
  title.font = { name: "Cairo", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GHARS_NAVY.slice(1) } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 27;

  worksheet.mergeCells(`A2:${lastLetter}2`);
  worksheet.getCell("A2").value = `GHARS | غرس${report.metadata.clinicName ? `  •  ${report.metadata.clinicName}` : ""}`;
  worksheet.getCell("A2").font = { name: "Cairo", size: 10, bold: true, color: { argb: GHARS_TEAL.slice(1) } };
  worksheet.getCell("A2").alignment = { horizontal: options.direction === "rtl" ? "right" : "left" };
  worksheet.mergeCells(`A3:${lastLetter}3`);
  worksheet.getCell("A3").value = `Generated (Riyadh): ${formatRiyadhTimestamp(report.metadata.generatedAt ?? new Date(), options.locale)}`;
  worksheet.getCell("A3").font = { name: "Cairo", size: 9, color: { argb: "FF536078" } };
  worksheet.mergeCells(`A4:${lastLetter}4`);
  const filterText = Object.entries(report.metadata.filters ?? {})
    .map(([key, value]) => `${key}: ${formatFilterValue(value, options.locale)}`)
    .join("  •  ");
  worksheet.getCell("A4").value = filterText || report.metadata.subtitle || "";
  worksheet.getCell("A4").font = { name: "Cairo", size: 9, color: { argb: "FF536078" } };
  if (section.title) {
    worksheet.mergeCells(`A5:${lastLetter}5`);
    worksheet.getCell("A5").value = section.title;
    worksheet.getCell("A5").font = { name: "Cairo", size: 10, bold: true, color: { argb: GHARS_TEAL.slice(1) } };
  }

  const headerRow = worksheet.getRow(6);
  section.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: "Cairo", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GHARS_NAVY.slice(1) } };
    cell.alignment = {
      horizontal: column.align ?? (options.direction === "rtl" ? "right" : "left"),
      vertical: "middle",
      wrapText: true,
    };
  });
  headerRow.height = 25;

  section.rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(rowIndex + 7);
    section.columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      cell.value = excelValue(row[column.key], column);
      cell.font = { name: "Cairo", size: 10, color: { argb: "FF18243D" } };
      cell.alignment = {
        horizontal: column.align ?? (options.direction === "rtl" ? "right" : "left"),
        vertical: "top",
        wrapText: true,
      };
      if (column.type === "date") cell.numFmt = "dd mmm yyyy hh:mm";
      if (column.type === "percentage") cell.numFmt = "0.0%";
      if (column.type === "currency") cell.numFmt = '#,##0.00 "SAR"';
      if (rowIndex % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GHARS_PALE_TEAL.slice(1) } };
      }
      cell.border = { bottom: { style: "thin", color: { argb: GHARS_LIGHT_NAVY.slice(1) } } };
    });
  });

  section.columns.forEach((column, index) => {
    const excelColumn = worksheet.getColumn(index + 1);
    excelColumn.width = Math.min(60, Math.max(column.width ?? 14, 10));
  });
  const lastRow = Math.max(6, section.rows.length + 6);
  worksheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: lastColumn } };
  worksheet.pageSetup.orientation = options.orientation;
  worksheet.pageSetup.paperSize = 9;
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.properties.defaultRowHeight = 20;
  worksheet.headerFooter.oddFooter = "Ghars • Page &P of &N";
}

export async function renderXlsx(
  report: ReportDefinition,
  options: ExportOptions = {},
): Promise<XlsxExport> {
  const resolved = resolveReport(report, options);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ghars";
  workbook.lastModifiedBy = "Ghars";
  workbook.created = new Date(report.metadata.generatedAt ?? new Date());
  workbook.modified = new Date();
  const usedSheetNames = new Set<string>();
  resolved.sections.forEach((section, index) => {
    const baseName = section.title?.replace(/[\\/*?:[\]]/g, "").slice(0, 25) || `Report ${index + 1}`;
    let name = baseName;
    let suffix = 2;
    while (usedSheetNames.has(name)) {
      name = `${baseName.slice(0, 28 - String(suffix).length)} ${suffix}`;
      suffix += 1;
    }
    usedSheetNames.add(name);
    const worksheet = workbook.addWorksheet(name, { properties: { defaultColWidth: 14 } });
    configureSheet(worksheet, report, section, resolved);
  });
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: safeFilename(options.filename ?? report.metadata.filename ?? report.metadata.title, ".xlsx"),
    data: Buffer.from(arrayBuffer),
  };
}

export const createXlsxExport = renderXlsx;
export const generateXlsx = renderXlsx;