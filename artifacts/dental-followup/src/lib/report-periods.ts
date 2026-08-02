/**
 * Period presets for Phase 5 statistics and the operational report.
 * All ranges are inclusive Riyadh-calendar dates (YYYY-MM-DD).
 */
export const REPORT_PERIODS = [
  { id: "today", label: "اليوم" },
  { id: "this_week", label: "هذا الأسبوع" },
  { id: "this_month", label: "هذا الشهر" },
  { id: "last_month", label: "الشهر الماضي" },
  { id: "this_year", label: "هذه السنة" },
  { id: "custom", label: "فترة مخصصة" },
] as const;
export type ReportPeriodId = (typeof REPORT_PERIODS)[number]["id"];

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function reportPeriodRange(
  period: ReportPeriodId,
  today: string,
): { from: string; to: string } {
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "this_week": {
      // Saudi work week starts on Sunday.
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      return { from: shiftDays(today, -dow), to: today };
    }
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const lastOfPrev = shiftDays(`${today.slice(0, 7)}-01`, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: today, to: today };
  }
}
