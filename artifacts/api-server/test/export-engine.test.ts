import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { afterAll, describe, expect, it } from "vitest";
import { renderPdf, renderXlsx } from "../src/lib/export";
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
    // Cairo's Arabic font preserves logical Arabic text through pdftotext;
    // the Latin footer proves that English text is selectable as well.
    expect(extracted).toContain("قابل طويل عربي نص هذا");
    expect(extracted).toContain("Ghars • Page");
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
});