/** Money formatting helpers (Latin digits, Arabic currency label). */

const formatter = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return `${formatter.format(value)} ر.س`;
}

/** Today's date (ISO yyyy-mm-dd) in Saudi time. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
  }).format(new Date());
}
