import type { Followup } from "@workspace/shared";
import { classifyFollowup } from "@workspace/shared";

/** Badge styling per follow-up status (exact Arabic statuses from the spec). */
export function followupStatusClasses(status: string): string {
  switch (status) {
    case "مجدولة":
      return "bg-primary/10 text-primary border-primary/20";
    case "تمت":
      return "bg-green-100 text-green-800 border-green-200";
    case "لم يحضر":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "مؤجلة":
      return "bg-muted text-muted-foreground border-border";
    case "لا يوجد رد":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "تحتاج إعادة تواصل":
      return "bg-red-100 text-red-800 border-red-200";
    case "ملغاة":
      return "bg-muted text-muted-foreground border-border line-through";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function communicationResultClasses(result: string | null): string {
  switch (result) {
    case "تم التواصل":
    case "أكد الموعد":
      return "bg-green-100 text-green-800 border-green-200";
    case "لا يوجد رد":
    case "رقم غير صحيح":
      return "bg-red-100 text-red-800 border-red-200";
    case "طلب تغيير الموعد":
    case "سيتم التواصل لاحقًا":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "تم فتح واتساب":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

const RIYADH_TZ = "Asia/Riyadh";

/** ISO timestamp → "YYYY-MM-DDTHH:mm" in Riyadh wall-clock (for datetime-local). */
export function toRiyadhInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** ISO timestamp → "YYYY-MM-DD" in Riyadh (for date inputs). */
export function toRiyadhDateValue(iso: string): string {
  return toRiyadhInputValue(iso).slice(0, 10);
}

/** ISO timestamp → "HH:mm" in Riyadh (for WhatsApp {{time}}). */
export function toRiyadhTimeValue(iso: string): string {
  return toRiyadhInputValue(iso).slice(11);
}

export type FollowupBuckets = {
  overdue: Followup[];
  today: Followup[];
  upcoming: Followup[];
};

/** Split open (مجدولة) follow-ups into overdue / today / upcoming, sorted. */
export function bucketFollowups(followups: Followup[]): FollowupBuckets {
  const now = new Date();
  const buckets: FollowupBuckets = { overdue: [], today: [], upcoming: [] };
  for (const f of followups) {
    const bucket = classifyFollowup(f, now);
    if (bucket) buckets[bucket].push(f);
  }
  const byDate = (a: Followup, b: Followup) =>
    (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "");
  buckets.overdue.sort(byDate);
  buckets.today.sort(byDate);
  buckets.upcoming.sort(byDate);
  return buckets;
}
