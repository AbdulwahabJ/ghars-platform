import { getIntlLocale, getLocale, Locale } from "@/i18n";

export function formatNumber(value: number, locale: Locale = getLocale()): string {
  return new Intl.NumberFormat(getIntlLocale(locale), { numberingSystem: "latn" }).format(value);
}

export function formatMoney(value: number, locale: Locale = getLocale()): string {
  if (locale === "en") {
    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: "currency", currency: "SAR", minimumFractionDigits: 2, maximumFractionDigits: 2,
      numberingSystem: "latn",
    }).format(value);
  }
  return `${new Intl.NumberFormat(getIntlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  }).format(value)} ر.س`;
}

/** A localized percentage with Latin digits (value is expressed as 0..1). */
export function formatPercentage(
  value: number,
  locale: Locale = getLocale(),
  maximumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "percent",
    maximumFractionDigits,
    numberingSystem: "latn",
  }).format(value);
}

/** Today's date (ISO yyyy-mm-dd) in Saudi time. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
  }).format(new Date());
}
