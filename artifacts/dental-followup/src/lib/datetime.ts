/**
 * Saudi-timezone display utilities. All user-facing dates and times display
 * in the Asia/Riyadh timezone (mandated). Storage stays UTC (timestamptz).
 */
const SAUDI_TZ = "Asia/Riyadh";

/** Arabic locale with Latin digits for clarity in numbers and dates. */
const LOCALE = "ar-SA-u-nu-latn-ca-gregory";

export function formatSaudiDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: SAUDI_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatSaudiDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: SAUDI_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatSaudiWeekdayDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: SAUDI_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
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
export function saudiGreeting(): string {
  const hour = saudiHourNow();
  return hour >= 4 && hour < 12 ? "صباح الخير" : "مساء الخير";
}
