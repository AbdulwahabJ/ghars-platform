import { describe, expect, it } from "vitest";
import {
  normalizeMobile,
  normalizeInternationalPhone,
  toEnglishDigits,
} from "../src/phone";
import { normalizeArabicSearchText } from "../src/arabic";

describe("toEnglishDigits", () => {
  it("converts Arabic-Indic and Extended Arabic digits", () => {
    expect(toEnglishDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toEnglishDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(toEnglishDigits("ملف ١٢٣")).toBe("ملف 123");
  });
});

describe("normalizeMobile", () => {
  it("normalizes Saudi local format 05XXXXXXXX", () => {
    expect(normalizeMobile("0501234567")).toEqual({
      ok: true,
      normalized: "966501234567",
    });
  });

  it("normalizes Arabic-digit input", () => {
    expect(normalizeMobile("٠٥٠١٢٣٤٥٦٧")).toEqual({
      ok: true,
      normalized: "966501234567",
    });
  });

  it("accepts +9665XXXXXXXX and 009665XXXXXXXX", () => {
    expect(normalizeMobile("+966501234567")).toEqual({
      ok: true,
      normalized: "966501234567",
    });
    expect(normalizeMobile("00966501234567")).toEqual({
      ok: true,
      normalized: "966501234567",
    });
  });

  it("tolerates the +966 05… typo", () => {
    expect(normalizeMobile("+9660501234567")).toEqual({
      ok: true,
      normalized: "966501234567",
    });
  });

  it("strips separators", () => {
    expect(normalizeMobile("050-123 45.67")).toEqual({
      ok: true,
      normalized: "966501234567",
    });
  });

  it("accepts explicit international numbers", () => {
    expect(normalizeMobile("+14155550123")).toEqual({
      ok: true,
      normalized: "14155550123",
    });
    expect(normalizeMobile("0014155550123")).toEqual({
      ok: true,
      normalized: "14155550123",
    });
  });

  it("never guesses a country code for foreign-looking numbers", () => {
    const res = normalizeMobile("12345678");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NEEDS_COUNTRY_CODE");
  });

  it("rejects malformed Saudi numbers", () => {
    expect(normalizeMobile("05012345").ok).toBe(false); // too short
    expect(normalizeMobile("9661234").ok).toBe(false);
    expect(normalizeMobile("+96612345678").ok).toBe(false); // 966 but not mobile
  });

  it("rejects empty and non-numeric input", () => {
    const empty = normalizeMobile("  ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("EMPTY");
    expect(normalizeMobile("abc").ok).toBe(false);
  });
});

describe("normalizeInternationalPhone", () => {
  it("normalizes Saudi national numbers to E.164", () => {
    expect(normalizeInternationalPhone("0501234567", "SA")).toMatchObject({
      ok: true,
      e164: "+966501234567",
      digitsOnly: "966501234567",
      countryCode: "SA",
    });
  });

  it("normalizes Arabic digits and UAE numbers", () => {
    expect(normalizeInternationalPhone("٥٠١٢٣٤٥٦٧", "AE")).toMatchObject({
      ok: true,
      e164: "+971501234567",
      countryCode: "AE",
    });
  });

  it("validates selected country and rejects invalid numbers", () => {
    expect(normalizeInternationalPhone("05123", "AE").ok).toBe(false);
    expect(normalizeInternationalPhone("123", "SA").ok).toBe(false);
    expect(normalizeInternationalPhone("501234567", "AE").ok).toBe(true);
    expect(normalizeInternationalPhone("+966501234567", "AE").ok).toBe(false);
  });
});

describe("normalizeArabicSearchText", () => {
  it("unifies hamza/alef forms and strips diacritics", () => {
    expect(normalizeArabicSearchText("أحمد")).toBe(
      normalizeArabicSearchText("احمد"),
    );
    expect(normalizeArabicSearchText("مُحَمَّد")).toBe(
      normalizeArabicSearchText("محمد"),
    );
  });
});
