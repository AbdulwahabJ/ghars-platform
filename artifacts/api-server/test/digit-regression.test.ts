import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "../src/lib/csv.js";
import {
  formatCellValue,
  formatFilterValue,
  formatRiyadhDate,
  formatRiyadhTimestamp,
  normalizeSystemDigits,
} from "../src/lib/export/formatting.js";

const FORBIDDEN_DIGITS = /[٠-٩۰-۹]/u;

function expectLatin(value: string): void {
  expect(value).not.toMatch(FORBIDDEN_DIGITS);
}

describe("Latin digits in exports", () => {
  it("normalizes numeric, identifier, date, amount, percentage, and mixed formatter values", () => {
    const values = [
      normalizeSystemDigits("١٢۳۴۵۶۷۸۹۰"),
      formatRiyadhTimestamp("2026-09-16T13:20:00Z", "ar"),
      formatRiyadhDate("2026-04-09"),
      formatCellValue("معرّف ۱۲۳٤ / زرع ٥", { key: "id", header: "ID", systemDigits: true }, {}, "ar"),
      formatCellValue(3250.5, { key: "amount", header: "المبلغ", type: "currency" }, {}, "ar"),
      formatCellValue(0.2575, { key: "progress", header: "النسبة", type: "percentage" }, {}, "ar"),
    ];
    values.forEach(expectLatin);
    expect(formatFilterValue("رقم الملف ۱۲۳٤", "ar")).toBe("رقم الملف ۱۲۳٤");
    expect(formatCellValue("ملاحظات: ۱۲۳٤، Patient ٥", { key: "notes", header: "Notes" }, {}, "en"))
      .toBe("ملاحظات: ۱۲۳٤، Patient ٥");
  });

  it("preserves free text in generic CSV while typed export values use Latin digits", () => {
    expect(csvEscape("ملاحظة المريض ۱۲۳ Patient ٤")).toBe("ملاحظة المريض ۱۲۳ Patient ٤");
    expect(csvEscape("١٢٣٤٥")).toBe("١٢٣٤٥");
    const csv = toCsv(["amount", "technical ID", "free text"], [["١٢٣٤٥", "IMP-٥", "نص ۱۲۳"]]);
    expect(csv).toContain("١٢٣٤٥");
    expect(csv).toContain("IMP-٥");
    expect(csv).toContain("نص ۱۲۳");
    expectLatin(formatCellValue("١٢٣٤٥", { key: "amount", header: "المبلغ", type: "number" }, {}, "ar"));
    expectLatin(formatCellValue("IMP-٥", { key: "id", header: "ID", systemDigits: true }, {}, "ar"));
  });
});