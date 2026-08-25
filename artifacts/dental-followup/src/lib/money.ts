import { getLocale } from "@/i18n";

export function formatMoney(value: number): string {
  const locale = getLocale();
  if (locale === "en") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return `${new Intl.NumberFormat("ar-SA-u-nu-latn", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ر.س`;
}

/** Today's date (ISO yyyy-mm-dd) in Saudi time. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
  }).format(new Date());
}
