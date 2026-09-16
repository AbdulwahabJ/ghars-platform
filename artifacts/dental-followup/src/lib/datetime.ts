import i18n, { getIntlLocale, getLocale, Locale } from "@/i18n";

/**
 * Saudi-timezone display utilities. All user-facing dates and times display
 * in the Asia/Riyadh timezone (mandated). Storage stays UTC (timestamptz).
 */
const SAUDI_TZ = "Asia/Riyadh";

/** Arabic locale with Latin digits for clarity in numbers and dates. */
function getDisplayLocale(locale?: Locale): string {
  return getIntlLocale(locale);
}

export function formatSaudiDate(value: string | Date, locale?: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(getDisplayLocale(locale), {
    timeZone: SAUDI_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    numberingSystem: "latn",
  }).format(date);
}

/**
 * Add whole months to a plain YYYY-MM-DD date, clamping to the end of the
 * target month (e.g. 2026-01-31 + 1 month → 2026-02-28). Used for the
 * suggested (editable) expected prosthetic date.
 */
export function addMonthsToIsoDate(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const target = new Date(y, m - 1 + months, 1);
  const daysInTarget = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(d, daysInTarget));
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${mm}-${dd}`;
}

export function formatSaudiDateTime(value: string | Date, locale?: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(getDisplayLocale(locale), {
    timeZone: SAUDI_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(date);
}

export function formatSaudiWeekdayDate(value: string | Date, locale?: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(getDisplayLocale(locale), {
    timeZone: SAUDI_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    numberingSystem: "latn",
  }).format(date);
}

/** Localized time for system-generated UI (always Latin digits). */
export function formatTime(value: string | Date, locale?: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(getDisplayLocale(locale), {
    timeZone: SAUDI_TZ,
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(date);
}

/** Alias for the standard Saudi-timezone date formatter. */
export function formatDate(value: string | Date, locale?: Locale): string {
  return formatSaudiDate(value, locale);
}

/** Current hour in Saudi time (0-23). */
export function saudiHourNow(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SAUDI_TZ,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
}

/** صباح الخير before noon Saudi time, otherwise مساء الخير. */
export function saudiGreeting(locale: Locale = getLocale()): string {
  const hour = saudiHourNow();
  const key = hour >= 4 && hour < 12 ? "greeting.morning" : "greeting.evening";
  return i18n.t(key, { lng: locale, ns: "common" });
}
