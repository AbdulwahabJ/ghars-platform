import { describe, expect, it } from "vitest";
import {
  buildPatientFollowupsPath,
  buildPatientPath,
  parsePatientDeepLink,
} from "@/lib/patient-links";

describe("patient follow-up deep links", () => {
  it("builds the canonical follow-up section URL", () => {
    expect(buildPatientFollowupsPath("patient-1")).toBe(
      "/patients/patient-1?tab=procedures&section=followups",
    );
  });

  it("includes a specific follow-up when available", () => {
    expect(buildPatientFollowupsPath("patient-1", "followup-9")).toBe(
      "/patients/patient-1?tab=procedures&section=followups&followupId=followup-9",
    );
  });

  it("preserves a procedures deep link across refresh parsing", () => {
    expect(
      parsePatientDeepLink(
        "?tab=procedures&section=followups&followupId=followup-9",
      ),
    ).toEqual({
      tab: "procedures",
      section: "followups",
      followupId: "followup-9",
    });
  });

  it("falls back to the section when a follow-up ID is absent", () => {
    expect(parsePatientDeepLink("?tab=procedures&section=followups")).toEqual({
      tab: "procedures",
      section: "followups",
      followupId: null,
    });
  });

  it("keeps normal patient links on the default patient data tab", () => {
    expect(buildPatientPath("patient-1")).toBe("/patients/patient-1");
    expect(parsePatientDeepLink("")).toEqual({
      tab: "summary",
      section: null,
      followupId: null,
    });
  });

  it("supports legacy follow-up links without creating a second route", () => {
    expect(parsePatientDeepLink("?tab=followup")).toEqual({
      tab: "procedures",
      section: "followups",
      followupId: null,
    });
  });
});