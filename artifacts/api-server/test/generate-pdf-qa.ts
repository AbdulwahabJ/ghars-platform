import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { closePdfBrowser, renderPdf } from "../src/lib/export/pdf.js";
import type { ReportDefinition } from "../src/lib/export/types.js";

const outputDir = process.env.GHARS_PDF_QA_OUTPUT ?? "/tmp/ghars-export-qa";
const arabicTitles = [
  ["patients-ar", "تقرير المرضى"],
  ["implant-cases-ar", "تقرير حالات الزراعة"],
  ["payments-ar", "تقرير الدفعات"],
  ["followups-ar", "تقرير المتابعات"],
  ["communication-ar", "تقرير سجل التواصل"],
  ["operational-ar", "التقرير التشغيلي"],
  ["statistics-ar", "تقرير الإحصائيات"],
] as const;
const englishTitles = [
  ["patients-en", "Patients Report"],
  ["implant-cases-en", "Implant Cases Report"],
  ["payments-en", "Payments Report"],
  ["operational-en", "Operational Report"],
] as const;

function report(
  name: string,
  title: string,
  locale: "ar" | "en",
): ReportDefinition {
  const arabic = locale === "ar";
  const rowCount = name.startsWith("patients-")
    ? 3
    : name.startsWith("operational-")
      ? 100
      : 20;
  const landscape =
    name.startsWith("implant-cases-") ||
    name.startsWith("operational-") ||
    name.startsWith("statistics-");
  return {
    metadata: {
      title,
      subtitle: arabic ? "عينات ضمان الجودة للطباعة" : "Print visual QA samples",
      clinicName: arabic ? "مجمع غرس الطبي Ghars Clinic" : "Ghars Clinic",
      generatedAt: new Date("2026-09-19T13:28:00.000Z"),
      generatedBy: arabic ? "فريق الجودة QA Team" : "QA Team",
      filters: { status: arabic ? "نشط Active" : "Active" },
      locale,
      direction: arabic ? "rtl" : "ltr",
      orientation: landscape ? "landscape" : "portrait",
    },
    sections: [{
      title: arabic ? "البيانات التجريبية" : "Representative data",
      columns: [
        { key: "patient", header: arabic ? "المريض" : "Patient", type: "text", width: 150 },
        { key: "file", header: arabic ? "رقم الملف" : "File Number", type: "text", width: 95, systemDigits: true },
        { key: "system", header: arabic ? "النظام" : "System", type: "text", width: 105 },
        { key: "date", header: arabic ? "التاريخ" : "Date", type: "date", width: 100 },
        { key: "amount", header: arabic ? "المبلغ" : "Amount", type: "currency", width: 95 },
        { key: "active", header: arabic ? "نشط" : "Active", type: "boolean", width: 70 },
        { key: "note", header: arabic ? "الملاحظة" : "Note", type: "text" },
      ],
      rows: Array.from({ length: rowCount }, (_, index) => ({
        patient: index === 0 ? "عبدالله محمد الحربي" : `مريض ${index + 1} Patient ${index + 1}`,
        file: `SS26-${String(index + 21).padStart(3, "0")}`,
        system: index % 2 ? "Neodent" : "Straumann",
        date: new Date(`2026-09-${String((index % 19) + 1).padStart(2, "0")}T13:28:00.000Z`),
        amount: 3250 + index * 10,
        active: index % 3 !== 0,
        note: arabic ? "ملاحظة عربية + English token" : "Arabic name + English token",
      })),
    }],
  };
}

export async function generatePdfQaSamples(): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const samples = [...arabicTitles, ...englishTitles];
  const files: string[] = [];
  try {
    for (const [name, title] of samples) {
      const locale = name.endsWith("-ar") ? "ar" : "en";
      const rendered = await renderPdf(report(name, title, locale));
      const path = join(outputDir, `${name}.pdf`);
      await writeFile(path, rendered.data);
      files.push(path);
    }
    return files;
  } finally {
    await closePdfBrowser();
  }
}

if (process.argv[1]?.endsWith("generate-pdf-qa.ts")) {
  const files = await generatePdfQaSamples();
  process.stdout.write(`${files.join("\n")}\n`);
}