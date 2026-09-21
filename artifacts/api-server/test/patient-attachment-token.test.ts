import { describe, expect, it, vi } from "vitest";
import { createPatientAttachmentToken, verifyPatientAttachmentCancelToken, verifyPatientAttachmentToken } from "../src/lib/patient-attachment-token";

const claims = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  patientId: "00000000-0000-4000-8000-000000000002",
  userId: "00000000-0000-4000-8000-000000000003",
  objectPath: "/objects/patient-attachments-staging/00000000-0000-4000-8000-000000000004",
  name: "report.pdf",
  size: 42,
  contentType: "application/pdf",
} as const;

describe("patient attachment tokens", () => {
  it("binds a valid token to tenant, patient, user and file metadata", () => {
    const token = createPatientAttachmentToken(claims);
    expect(verifyPatientAttachmentToken(token, claims)).toBe(true);
    expect(verifyPatientAttachmentToken(token, { ...claims, patientId: claims.tenantId })).toBe(false);
    const tampered = `${token.slice(0, token.indexOf(".") + 1)}${token.slice(token.indexOf(".") + 1, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifyPatientAttachmentToken(tampered, claims)).toBe(false);
  });

  it("rejects expired upload and cancel tokens", () => {
    const token = createPatientAttachmentToken(claims);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 15 * 60 * 1000 + 1);
    expect(verifyPatientAttachmentToken(token, claims)).toBe(false);
    expect(verifyPatientAttachmentCancelToken(token, claims)).toBe(false);
    vi.restoreAllMocks();
  });

  it("binds staging cancellation to the same patient and user", () => {
    const token = createPatientAttachmentToken(claims);
    expect(verifyPatientAttachmentCancelToken(token, claims)).toBe(true);
    expect(verifyPatientAttachmentCancelToken(token, { ...claims, userId: claims.tenantId })).toBe(false);
  });
});