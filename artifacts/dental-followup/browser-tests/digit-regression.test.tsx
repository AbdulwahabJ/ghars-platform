import { describe, expect, it } from "vitest";
import i18n, { resources, setLocale } from "@/i18n";
import { formatDate, formatSaudiDate, formatTime } from "@/lib/datetime";
import { formatMoney, formatNumber, formatPercentage } from "@/lib/money";
import {
  isNumericCompatibleField,
  finalizeDecimalInput,
  normalizeDigits,
  normalizeDecimalInput,
  normalizeNumericValues,
  parseImplantDimension,
} from "@/lib/digits";

const FORBIDDEN_DIGITS = /[٠-٩۰-۹]/u;

/**
 * Return only text rendered by system UI. Patient-entered text is deliberately
 * opt-out via data-user-content instead of being treated as system output.
 */
export function renderedSystemUiText(root: ParentNode = document): string {
  const container = root instanceof Document ? root.body : root;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const values: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent?.closest("[data-user-content]")) continue;
    if (parent?.closest("[data-system-ui]")) values.push(node.nodeValue ?? "");
  }
  return values.join(" ");
}

function expectLatinSystemText(value: string): void {
  expect(value).not.toMatch(FORBIDDEN_DIGITS);
}

describe("global Latin-digit regression coverage", () => {
  it("normalizes Arabic-Indic and Persian digits, preserving surrounding text", () => {
    expect(normalizeDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeDigits("المريض ۱۲٣ - A/B")).toBe("المريض 123 - A/B");
    expect(normalizeDigits(normalizeDigits("١٢۳"))).toBe("123");
  });

  it("preserves decimal editing states and normalizes implant dimensions at the boundary", () => {
    expect(normalizeDecimalInput("4.")).toBe("4.");
    expect(normalizeDecimalInput("4,")).toBe("4.");
    expect(normalizeDecimalInput("4٫")).toBe("4.");
    expect(finalizeDecimalInput("4.")).toBe("4");

    expect(parseImplantDimension("4.5")).toBe(4.5);
    expect(parseImplantDimension("3,8")).toBe(3.8);
    expect(parseImplantDimension("4٫5")).toBe(4.5);
    expect(parseImplantDimension("٤٫٥")).toBe(4.5);
    expect(parseImplantDimension("۴٫۵")).toBe(4.5);
    expect(parseImplantDimension("3.75")).toBe(3.75);
    expect(parseImplantDimension("5.0")).toBe(5);
    expect(parseImplantDimension("")).toBeNull();

    for (const invalid of ["4..5", "abc", "-4.5", "4.567", "0", "100"]) {
      expect(Number.isNaN(parseImplantDimension(invalid))).toBe(true);
    }
  });

  it("detects numeric-compatible fields from type, input mode, and names", () => {
    for (const descriptor of [
      { type: "number" },
      { type: "DATE" },
      { inputMode: "decimal" },
      { inputMode: "tel" },
      { name: "patientFileNumber" },
      { id: "installment-amount" },
      { ariaLabel: "phone number" },
    ]) {
      expect(isNumericCompatibleField(descriptor)).toBe(true);
    }
    for (const descriptor of [
      { type: "text", name: "patientName" },
      { type: "text", name: "clinicalNotes" },
      { type: "search", id: "message" },
    ]) {
      expect(isNumericCompatibleField(descriptor)).toBe(false);
    }
    expect(normalizeNumericValues({
      phone: "۰٥٠١",
      notes: "المريض ۱۲",
      nested: { amount: "١٢٥" },
    })).toEqual({
      phone: "0501",
      notes: "المريض ۱۲",
      nested: { amount: "125" },
    });
  });

  it("keeps every system formatter Latin-digit safe in Arabic and English", () => {
    for (const locale of ["ar", "en"] as const) {
      for (const value of [
        formatNumber(1234567.5, locale),
        formatMoney(3250.5, locale),
        formatPercentage(0.2575, locale, 2),
        formatDate("2026-01-02T12:00:00Z", locale),
        formatSaudiDate("2026-01-02T12:00:00Z", locale),
        formatTime("2026-01-02T12:00:00Z", locale),
      ]) {
        expectLatinSystemText(value);
      }
    }
  });

  it("scans translation leaf strings for forbidden literal digits", () => {
    const leaves: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") leaves.push(value);
      else if (value && typeof value === "object") {
        Object.values(value).forEach(visit);
      }
    };
    visit(resources);
    expect(leaves.length).toBeGreaterThan(0);
    leaves.forEach(expectLatinSystemText);
  });

  it("guards rendered system UI while allowing explicitly marked user content", () => {
    document.body.innerHTML = `
      <main data-system-ui>
        <span>إجمالي 1,250</span>
        <span data-user-content>ملاحظات المريض ۱۲۳</span>
      </main>
    `;
    expect(renderedSystemUiText()).toContain("إجمالي 1,250");
    expect(renderedSystemUiText()).not.toMatch(FORBIDDEN_DIGITS);
    document.body.innerHTML = "";
  });

  it("uses the active locale without allowing i18n state to affect safe output", async () => {
    await setLocale("ar");
    expect(i18n.language).toBe("ar");
    expectLatinSystemText(formatNumber(42));
    await setLocale("en");
    expect(i18n.language).toBe("en");
    expectLatinSystemText(formatNumber(42));
  });
});