import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { afterAll, describe, expect, it } from "vitest";
import {
  formatCellValue,
  formatFilterValue,
  formatRiyadhDate,
  formatRiyadhTimestamp,
  renderPdf,
  renderXlsx,
} from "../src/lib/export";
import type { ReportDefinition } from "../src/lib/export";

const LONG_ARABIC_TEXT =
  "هذا نص عربي طويل قابل للتحديد والبحث داخل التقرير، مع تفاصيل سريرية وإدارية. " +
  "Selectable English text is preserved alongside the Arabic content for every row. ".repeat(8);

const report: ReportDefinition = {
  metadata: {
    title: "تقرير متابعة المرضى Patient Follow-up Report",
    subtitle: "تقرير متعدد الصفحات مع نص طويل",
    clinicName: "عيادة غرس Ghars Clinic",
    generatedAt: new Date("2026-08-15T12:30:00.000Z"),
    generatedBy: "اختبار Test User",
    filters: { الحالة: "نشط Active" },
    filename: `../CON: quarterly "report"/patient`,
    locale: "ar",
    direction: "rtl",
    orientation: "portrait",
  },
  sections: [
    {
      title: "المرضى Patients",
      columns: [
        { key: "name", header: "اسم المريض Patient", type: "text", width: 145 },
        { key: "visitDate", header: "التاريخ Date", type: "date", width: 88 },
        { key: "amount", header: "المبلغ Amount", type: "currency", width: 88 },
        { key: "completion", header: "النسبة Progress", type: "percentage", width: 88 },
        { key: "notes", header: "الملاحظات Notes", type: "text" },
      ],
      rows: Array.from({ length: 55 }, (_, index) => ({
        name: index === 0 ? "English Patient Body Text" : `مريض ${index + 1} Patient ${index + 1}`,
        visitDate: new Date(`2026-08-${String((index % 28) + 1).padStart(2, "0")}T08:00:00.000Z`),
        amount: 1250.5 + index,
        completion: (index % 10) / 10,
        notes: `${LONG_ARABIC_TEXT} صف ${index + 1}`,
        internalId: `internal-${index}`,
      })),
    },
  ],
};

function pdfText(data: Buffer): string {
  return execFileSync("pdftotext", ["-", "-"], {
    input: data,
    encoding: "utf8",
  });
}

describe("shared export engine", () => {
  afterAll(() => {
    // Keep the suite explicit about not retaining large generated buffers.
  });

  it("renders a selectable Arabic multi-page PDF with safe filenames", async () => {
    const exported = await renderPdf(report);

    expect(exported.contentType).toBe("application/pdf");
    expect(exported.filename).toBe("-CON-quarterly-report-patient.pdf");
    expect(exported.data.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const metadata = execFileSync("pdfinfo", ["-"], {
      input: exported.data,
      encoding: "utf8",
    });
    const pages = Number(metadata.match(/^Pages:\s+(\d+)/m)?.[1]);
    expect(pages).toBeGreaterThan(1);

    const extracted = pdfText(exported.data);
    // Cairo's Arabic font preserves logical Arabic text through pdftotext.
    expect(extracted).toContain("قابل طويل عربي نص هذا");
    expect(extracted).toContain("غرس");
    expect(extracted).toContain("صفحة");
    expect(extracted).toContain("English Patient Body Text");
  });

  it("renders professional RTL XLSX cells without internal row fields", async () => {
    const exported = await renderXlsx(report, {
      filename: `../CON: quarterly "report"/patient`,
    });

    expect(exported.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(exported.filename).toBe("-CON-quarterly-report-patient.xlsx");
    expect(exported.data.subarray(0, 2).toString("ascii")).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.data);
    expect(workbook.worksheets).toHaveLength(1);
    const worksheet = workbook.worksheets[0];

    expect(worksheet.views[0]).toMatchObject({
      rightToLeft: true,
      state: "frozen",
      ySplit: 6,
    });
    expect(worksheet.autoFilter).toBe("A6:E61");
    expect(worksheet.getCell("A1").font).toMatchObject({
      name: "Cairo",
      bold: true,
      color: { argb: "FFFFFFFF" },
    });
    expect(worksheet.getCell("A1").fill).toMatchObject({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "0D1B3D" },
    });
    expect(worksheet.getCell("A6").fill).toMatchObject({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "0D1B3D" },
    });

    const firstDataRow = worksheet.getRow(7);
    expect(firstDataRow.getCell(2).value).toBeInstanceOf(Date);
    expect(firstDataRow.getCell(3).value).toBe(1250.5);
    expect(firstDataRow.getCell(3).numFmt).toContain("SAR");
    expect(firstDataRow.getCell(4).value).toBe(0);
    expect(firstDataRow.getCell(4).numFmt).toBe("0.0%");
    expect(firstDataRow.getCell(3).font).toMatchObject({ name: "Cairo" });
    expect(firstDataRow.getCell(1).fill).toMatchObject({
      type: "pattern",
      pattern: "solid",
    });

    const serializedCells = worksheet
      .getRows(1, worksheet.rowCount)
      .flatMap((row) => row?.values ?? [])
      .map((value) => String(value));
    expect(serializedCells.join("\n")).not.toContain("internal-0");
    expect(serializedCells.join("\n")).not.toContain("internalId");
    expect(worksheet.columnCount).toBe(5);
  });

  it("uses standardized English Gregorian dates and locale-specific business values", () => {
    const timestamp = new Date("2026-09-16T13:20:00.000Z");
    expect(formatRiyadhTimestamp(timestamp, "ar")).toBe("16 Sep 2026, 04:20 PM");
    expect(formatRiyadhTimestamp(timestamp, "en")).toBe("16 Sep 2026, 04:20 PM");
    expect(formatRiyadhDate("2026-04-09")).toBe("09 Apr 2026");
    expect(formatFilterValue("2026-03-03", "ar")).toBe("03 Mar 2026");
    expect(formatCellValue(3250, { key: "amount", header: "Amount", type: "currency" }, {}, "ar"))
      .toBe("3,250 ر.س");
    expect(formatCellValue(3250, { key: "amount", header: "Amount", type: "currency" }, {}, "en"))
      .toBe("SAR 3,250");
    expect(formatCellValue(null, { key: "value", header: "Value" }, {}, "en")).toBe("—");
  });

  it("localizes XLSX metadata, booleans, missing values, direction, and LCID dates", async () => {
    const localeReport = (locale: "ar" | "en"): ReportDefinition => ({
      metadata: {
        title: locale === "ar" ? "تقرير الاختبار" : "Test report",
        clinicName: locale === "ar" ? "عيادة غرس" : "Ghars Clinic",
        generatedAt: new Date("2026-09-16T13:20:00.000Z"),
        locale,
        direction: locale === "ar" ? "rtl" : "ltr",
      },
      sections: [{
        title: locale === "ar" ? "الملخص" : "Summary",
        columns: [
          { key: "date", header: locale === "ar" ? "التاريخ" : "Date", type: "date" },
          { key: "active", header: locale === "ar" ? "نشط" : "Active", type: "boolean" },
          { key: "empty", header: locale === "ar" ? "فارغ" : "Empty", type: "text" },
        ],
        rows: [{
          date: new Date("2026-09-16T13:20:00.000Z"),
          active: true,
          empty: null,
        }],
      }],
    });

    for (const locale of ["ar", "en"] as const) {
      const exported = await renderXlsx(localeReport(locale));
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(exported.data);
      const sheet = workbook.worksheets[0];
      expect(sheet.views[0].rightToLeft).toBe(locale === "ar");
      expect(sheet.name).toBe(locale === "ar" ? "الملخص" : "Summary");
      expect(sheet.getCell("A2").text).toContain(locale === "ar" ? "غرس" : "Ghars");
      expect(sheet.getCell("A3").text).toContain(
        locale === "ar" ? "تاريخ الإنشاء (الرياض)" : "Generated (Riyadh)",
      );
      expect(sheet.getCell("A7").value).toBeInstanceOf(Date);
      expect(sheet.getCell("A7").numFmt).toBe("[$-409]dd mmm yyyy, hh:mm AM/PM");
      expect(sheet.getCell("B7").value).toBe(locale === "ar" ? "نعم" : "Yes");
      expect(sheet.getCell("C7").value).toBe("—");
      expect(sheet.headerFooter.oddFooter).toBe(
        locale === "ar" ? "غرس | صفحة &P من &N" : "Ghars | Page &P of &N",
      );
      expect(sheet.getColumn(1).width).toBeGreaterThanOrEqual(10);
      expect(sheet.getColumn(1).width).toBeLessThanOrEqual(60);
    }
  });

  it("keeps English PDF content and footer fully LTR", async () => {
    const english: ReportDefinition = {
      metadata: {
        title: "Implant Cases",
        subtitle: "Three-row report",
        clinicName: "Ghars Clinic",
        generatedAt: new Date("2026-09-16T13:20:00.000Z"),
        locale: "en",
        direction: "ltr",
        orientation: "landscape",
      },
      sections: [{
        title: "Implant Cases",
        columns: [
          { key: "patient", header: "Patient", type: "text" },
          { key: "date", header: "Procedure date", type: "date" },
          { key: "active", header: "Active", type: "boolean" },
        ],
        rows: Array.from({ length: 3 }, (_, index) => ({
          patient: `Patient ${index + 1}`,
          date: `2026-09-${String(index + 1).padStart(2, "0")}`,
          active: index % 2 === 0,
        })),
      }],
    };
    const exported = await renderPdf(english);
    const extracted = pdfText(exported.data);
    expect(extracted).toContain("Implant Cases");
    expect(extracted).toContain("Ghars | Page 1 of 1");
    expect(extracted).toContain("16 Sep 2026, 04:20 PM");
  });

  it("generates 10, 100, and 500-row backend exports within safe bounds", async () => {
    for (const count of [10, 100, 500]) {
      const performanceReport: ReportDefinition = {
        metadata: {
          title: `Performance ${count}`,
          locale: "en",
          direction: "ltr",
          orientation: "landscape",
        },
        columns: [
          { key: "file", header: "File number", type: "text" },
          { key: "patient", header: "Patient", type: "text" },
          { key: "date", header: "Procedure date", type: "date" },
          { key: "amount", header: "Amount", type: "currency" },
          { key: "active", header: "Active", type: "boolean" },
        ],
        rows: Array.from({ length: count }, (_, index) => ({
          file: `P-${index + 1}`,
          patient: `Patient ${index + 1}`,
          date: new Date("2026-09-16T00:00:00.000Z"),
          amount: 1000 + index,
          active: index % 2 === 0,
        })),
      };
      const pdfStarted = performance.now();
      const pdf = await renderPdf(performanceReport);
      const pdfMs = performance.now() - pdfStarted;
      const xlsxStarted = performance.now();
      const xlsx = await renderXlsx(performanceReport);
      const xlsxMs = performance.now() - xlsxStarted;
      expect(pdf.data.length).toBeGreaterThan(1_000);
      expect(xlsx.data.length).toBeGreaterThan(1_000);
      expect(pdfMs, `${count}-row PDF took ${pdfMs.toFixed(0)}ms`).toBeLessThan(15_000);
      expect(xlsxMs, `${count}-row XLSX took ${xlsxMs.toFixed(0)}ms`).toBeLessThan(15_000);
      console.info(`export-performance rows=${count} pdfMs=${pdfMs.toFixed(0)} xlsxMs=${xlsxMs.toFixed(0)}`);
    }
  }, 45_000);
});