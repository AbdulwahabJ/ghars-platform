import { afterEach, describe, expect, it } from "vitest";
import i18n, { getLocale, setLocale } from "@/i18n";
import { formatMoney, formatNumber, formatPercentage } from "@/lib/money";
import { formatSaudiDate, formatTime } from "@/lib/datetime";

describe("locale-aware system display", () => {
  afterEach(() => {
    setLocale("ar");
  });

  it("translates canonical and legacy finance values without changing them", async () => {
    const canonicalMethod = "نقدي";
    const legacyMethod = "نقدية";
    const legacyLabel = "دفعة علاجية";

    await setLocale("en");

    expect(i18n.t(`enums:paymentMethod.${canonicalMethod}`)).toBe("Cash");
    expect(i18n.t(`enums:paymentMethod.${legacyMethod}`)).toBe("Cash");
    expect(i18n.t(`enums:paymentLabel.${legacyLabel}`)).toBe("Treatment payment");
    expect(canonicalMethod).toBe("نقدي");
    expect(legacyMethod).toBe("نقدية");
    expect(legacyLabel).toBe("دفعة علاجية");
  });

  it("switches finance text and currency in both directions", async () => {
    await setLocale("en");
    expect(getLocale()).toBe("en");
    expect(i18n.t("operations:dashboard.voidPayment")).toBe("Void payment");
    expect(formatMoney(3000)).toBe("SAR 3,000.00");

    await setLocale("ar");
    expect(getLocale()).toBe("ar");
    expect(i18n.t("operations:dashboard.voidPayment")).toBe("إلغاء الدفعة");
    expect(formatMoney(3000)).toBe("3,000.00 ر.س");
  });

  it("forces Latin digits for every system formatter in Arabic", async () => {
    await setLocale("ar");
    expect(formatNumber(1234567.5)).toMatch(/[0-9]/);
    expect(formatNumber(1234567.5)).not.toMatch(/[٠-٩۰-۹]/);
    expect(formatPercentage(0.25)).toBe("25٪");
    expect(formatSaudiDate("2026-01-02T12:00:00Z")).toMatch(/[0-9]/);
    expect(formatSaudiDate("2026-01-02T12:00:00Z")).not.toMatch(/[٠-٩۰-۹]/);
    expect(formatTime("2026-01-02T12:00:00Z")).not.toMatch(/[٠-٩۰-۹]/);
  });
});