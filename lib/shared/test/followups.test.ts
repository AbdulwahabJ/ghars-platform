import { describe, expect, it } from "vitest";
import {
  buildWhatsappLink,
  classifyFollowup,
  isContactTaskDue,
  renderTemplate,
  riyadhDateOf,
} from "../src/schemas/followups";

/** Fixed reference "now": 2026-08-02 10:00 Riyadh time. */
const NOW = new Date("2026-08-02T10:00:00+03:00");

describe("riyadhDateOf", () => {
  it("returns the Riyadh calendar date regardless of UTC boundary", () => {
    // 23:30 Riyadh on Aug 1 is 20:30 UTC on Aug 1.
    expect(riyadhDateOf("2026-08-01T23:30:00+03:00")).toBe("2026-08-01");
    // 00:15 Riyadh on Aug 2 is 21:15 UTC on Aug 1 — still Aug 2 in Riyadh.
    expect(riyadhDateOf("2026-08-02T00:15:00+03:00")).toBe("2026-08-02");
  });
});

describe("classifyFollowup", () => {
  const open = (scheduledAt: string) => ({
    followupStatus: "مجدولة",
    scheduledAt,
  });

  it("scheduled today (any time) is today's appointment", () => {
    expect(classifyFollowup(open("2026-08-02T00:00:00+03:00"), NOW)).toBe("today");
    expect(classifyFollowup(open("2026-08-02T23:59:00+03:00"), NOW)).toBe("today");
  });

  it("scheduled before today is overdue, even 23:59 yesterday", () => {
    expect(classifyFollowup(open("2026-08-01T23:59:00+03:00"), NOW)).toBe("overdue");
    expect(classifyFollowup(open("2026-07-20T09:00:00+03:00"), NOW)).toBe("overdue");
  });

  it("scheduled after today is upcoming", () => {
    expect(classifyFollowup(open("2026-08-03T09:00:00+03:00"), NOW)).toBe("upcoming");
  });

  it("completed and cancelled follow-ups are never overdue", () => {
    for (const status of ["تمت", "ملغاة", "مؤجلة", "لم يحضر", "لا يوجد رد", "تحتاج إعادة تواصل"]) {
      expect(
        classifyFollowup(
          { followupStatus: status, scheduledAt: "2026-07-01T09:00:00+03:00" },
          NOW,
        ),
      ).toBeNull();
    }
  });

  it("open record without a date is unclassified", () => {
    expect(
      classifyFollowup({ followupStatus: "مجدولة", scheduledAt: null }, NOW),
    ).toBeNull();
  });
});

describe("isContactTaskDue", () => {
  const base = {
    followupStatus: "مجدولة",
    requiresContact: true,
    contactDueAt: "2026-08-01T00:00:00+03:00",
  };

  it("due yesterday or today counts as a contact task", () => {
    expect(isContactTaskDue(base, NOW)).toBe(true);
    expect(
      isContactTaskDue({ ...base, contactDueAt: "2026-08-02T00:00:00+03:00" }, NOW),
    ).toBe(true);
  });

  it("future due date is not yet a task", () => {
    expect(
      isContactTaskDue({ ...base, contactDueAt: "2026-08-05T00:00:00+03:00" }, NOW),
    ).toBe(false);
  });

  it("requires the contact flag and a due date", () => {
    expect(isContactTaskDue({ ...base, requiresContact: false }, NOW)).toBe(false);
    expect(isContactTaskDue({ ...base, contactDueAt: null }, NOW)).toBe(false);
  });

  it("closed records are never contact tasks", () => {
    for (const status of ["تمت", "ملغاة", "مؤجلة"]) {
      expect(isContactTaskDue({ ...base, followupStatus: status }, NOW)).toBe(false);
    }
    // Recorded outcomes that still need contact remain tasks.
    expect(isContactTaskDue({ ...base, followupStatus: "تحتاج إعادة تواصل" }, NOW)).toBe(true);
  });
});

describe("renderTemplate", () => {
  it("replaces all placeholders", () => {
    const body = "أهلًا {{patientName}}، موعدكم يوم {{date}} الساعة {{time}}.";
    expect(
      renderTemplate(body, { patientName: "أحمد", date: "٥ أغسطس", time: "14:30" }),
    ).toBe("أهلًا أحمد، موعدكم يوم ٥ أغسطس الساعة 14:30.");
  });

  it("keeps a visible blank when date/time are unknown", () => {
    expect(
      renderTemplate("يوم {{date}} الساعة {{time}}", { patientName: "x" }),
    ).toBe("يوم ____ الساعة ____");
  });
});

describe("buildWhatsappLink", () => {
  it("builds a wa.me deep link with the normalized number", () => {
    const link = buildWhatsappLink("966501234567", "مرحبا");
    expect(link.startsWith("https://wa.me/966501234567?text=")).toBe(true);
  });

  it("URL-encodes Arabic text, spaces, and line breaks", () => {
    const message = "أهلًا أحمد،\nنذكركم بموعدكم يوم الأحد الساعة 10:00.";
    const link = buildWhatsappLink("966501234567", message);
    expect(link).not.toContain("\n");
    expect(link).not.toContain(" ");
    const encoded = link.split("?text=")[1];
    expect(decodeURIComponent(encoded)).toBe(message);
  });
});
