import { describe, expect, it } from "vitest";
import {
  ADJUNCT_PROCEDURE_CATEGORIES,
  calcPaymentStatus,
  PROSTHETIC_EVENT_TYPES,
  toCents,
} from "@workspace/shared";
import { synchronizedImplantStatus } from "@workspace/db";
import {
  ANCHOR_DATE,
  SEED_BATCH,
  SEED_COUNTS,
  TARGET_DOCTOR_ID,
  TARGET_DATABASE_NAME,
  TARGET_CLUSTER_FINGERPRINT,
  TARGET_TENANT_ID,
  SEEDED_SYSTEM_OPTION_IDS,
  SEEDED_SYSTEM_OPTIONS,
  assertClinicalRowsEmpty,
  assertSeedSystemOptionsAvailable,
  assertSeedSystemOptionsExact,
  assertTargetDatabaseName,
  assertTargetClusterFingerprint,
  buildData,
  seedUuid,
  validatePlannedData,
  validateScreenshotEnvironment,
} from "./screenshot-data";

describe("screenshot dataset plan", () => {
  it("uses stable UUIDs and the requested integrity counts", () => {
    expect(seedUuid("patient", 0)).toBe(seedUuid("patient", 0));
    expect(seedUuid("patient", 0)).not.toBe(seedUuid("patient", 1));
    expect(SEED_BATCH).toBe("ghars-screenshot-2026-09-12-v1");
    expect(ANCHOR_DATE).toBe("2026-09-12");
    expect(SEED_COUNTS.patients).toBeGreaterThanOrEqual(32);
    expect(SEED_COUNTS.patients).toBeLessThanOrEqual(40);
    expect(SEED_COUNTS.cases).toBeGreaterThanOrEqual(38);
    expect(SEED_COUNTS.cases).toBeLessThanOrEqual(48);
    expect(SEED_COUNTS.implants).toBeGreaterThanOrEqual(65);
    expect(SEED_COUNTS.implants).toBeLessThanOrEqual(80);
    expect(SEED_COUNTS.adjunctProcedures).toBeGreaterThanOrEqual(18);
    expect(SEED_COUNTS.adjunctProcedures).toBeLessThanOrEqual(25);
    expect(SEED_COUNTS.prostheticEvents).toBeGreaterThanOrEqual(25);
    expect(SEED_COUNTS.prostheticEvents).toBeLessThanOrEqual(40);
    expect(SEED_COUNTS.followups).toBeGreaterThanOrEqual(70);
    expect(SEED_COUNTS.followups).toBeLessThanOrEqual(100);
    expect(SEED_COUNTS.communications).toBeGreaterThanOrEqual(35);
    expect(SEED_COUNTS.communications).toBeLessThanOrEqual(55);
    expect(SEED_COUNTS.payments).toBeGreaterThanOrEqual(55);
    expect(SEED_COUNTS.payments).toBeLessThanOrEqual(80);
  });

  it("uses canonical integer-cent finance status calculation", () => {
    expect(toCents(123.45)).toBe(12345);
    expect(calcPaymentStatus({ finalTotalCents: 10000, paidCents: 0, caseStatus: "حالة جديدة" })).toBe("لم يدفع");
    expect(calcPaymentStatus({ finalTotalCents: 10000, paidCents: 5000, caseStatus: "حالة جديدة" })).toBe("مدفوع جزئيًا");
    expect(calcPaymentStatus({ finalTotalCents: 10000, paidCents: 10000, caseStatus: "حالة جديدة" })).toBe("مدفوع بالكامل");
  });

  it("fails closed for unsafe command environments and accepts only the approved date override", () => {
    const safe = {
      SCREENSHOT_DATA_ENV: "development",
      SCREENSHOT_DATA_CONFIRM: SEED_BATCH,
      REPLIT_DEV_DOMAIN: "clinic.example.test",
      NODE_ENV: "development",
      APP_ENV: "development",
    };
    expect(() => validateScreenshotEnvironment(safe, ANCHOR_DATE)).not.toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, REPLIT_DEPLOYMENT: "true" }, ANCHOR_DATE)).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, REPLIT_DEPLOYMENT: "maybe" }, ANCHOR_DATE)).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, NODE_ENV: undefined }, ANCHOR_DATE)).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, APP_ENV: undefined }, ANCHOR_DATE)).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, SCREENSHOT_DATA_ENV: "sandbox" }, ANCHOR_DATE)).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, APP_ENV: "Production" }, ANCHOR_DATE)).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, NODE_ENV: "staging" }, ANCHOR_DATE)).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, SCREENSHOT_DATA_DATE_OVERRIDE: "2026-09-13" }, "2026-09-13")).toThrow();
    expect(() => validateScreenshotEnvironment({ ...safe, SCREENSHOT_DATA_DATE_OVERRIDE: ANCHOR_DATE }, "2026-09-13")).not.toThrow();
  });

  it("validates the complete deterministic plan, showcase journeys, adjunct chronology, and finance FKs", () => {
    const context = {
      tenantId: "00000000-0000-0000-0000-000000000001",
      doctorId: TARGET_DOCTOR_ID,
      systems: ["ROT / Root", "Bio", "Neodent", "Neoss", "Ora"],
      systemOptionRows: [],
    };
    const data = buildData(context);
    expect(data.adjuncts.filter((row) => !row.implantId)).toHaveLength(3);
    expect(data.adjuncts.filter((row) => row.procedureCategory === ADJUNCT_PROCEDURE_CATEGORIES[1] && row.implantId)).not.toHaveLength(0);
    expect(data.prosthetics.filter((row) => row.eventType === PROSTHETIC_EVENT_TYPES[0])).toHaveLength(SEED_COUNTS.temporaryEvents);
    validatePlannedData(context, data);
  });

  it("uses the canonical prosthetic synchronization mapping and immutable doctor identity", () => {
    expect(TARGET_DOCTOR_ID).toBe("367cfae2-82df-4056-b7ed-3469b0bc4153");
    expect(synchronizedImplantStatus("تركيب مؤقت")).toBe("تم تركيب مؤقت");
    expect(synchronizedImplantStatus("تركيب دائم")).toBe("تم التركيب");
  });

  it("rejects a non-empty target tenant before any seed planning or mutation", () => {
    expect(() => assertClinicalRowsEmpty({
      implantSystems: 0,
      patients: 1,
      cases: 0,
      implants: 0,
      adjuncts: 0,
      prosthetics: 0,
      followups: 0,
      communications: 0,
      payments: 0,
      charges: 0,
      discounts: 0,
      installmentPlans: 0,
      installments: 0,
    })).toThrow(/patients=1/);
    expect(() => assertClinicalRowsEmpty({
      implantSystems: 0,
      patients: 0,
      cases: 0,
      implants: 0,
      adjuncts: 0,
      prosthetics: 0,
      followups: 0,
      communications: 0,
      payments: 0,
      charges: 0,
      discounts: 0,
      installmentPlans: 0,
      installments: 0,
    })).not.toThrow();
  });

  it("pins the target tenant and database fingerprint", () => {
    expect(TARGET_TENANT_ID).toBe("1d3a1ebf-3f78-43a2-a201-3e1b7e35a0bb");
    expect(TARGET_CLUSTER_FINGERPRINT).toBe("38429c9ee06c55f9ec14264a1892f390");
    expect(() => assertTargetClusterFingerprint(TARGET_CLUSTER_FINGERPRINT)).not.toThrow();
    expect(() => assertTargetClusterFingerprint("38429c9ee06c55f9ec14264a1892f391")).toThrow(/cluster fingerprint mismatch/);
    expect(() => assertTargetClusterFingerprint("")).toThrow(/cluster fingerprint mismatch/);
    expect(() => assertTargetDatabaseName(TARGET_DATABASE_NAME)).not.toThrow();
    expect(() => assertTargetDatabaseName("otherdb")).toThrow(/heliumdb/);
  });

  it("allows exactly zero target system rows before seeding and only exact owned rows for cleanup", () => {
    expect(() => assertSeedSystemOptionsAvailable([])).not.toThrow();
    expect(() => assertSeedSystemOptionsAvailable([{
      id: "existing",
      tenantId: TARGET_TENANT_ID,
      name: "ROT / Root",
      isActive: true,
    }])).toThrow(/already has/);
    const exactRows = SEEDED_SYSTEM_OPTIONS.map((name, index) => ({
      id: SEEDED_SYSTEM_OPTION_IDS[index],
      tenantId: TARGET_TENANT_ID,
      name,
      isActive: true,
    }));
    expect(() => assertSeedSystemOptionsExact(exactRows, TARGET_TENANT_ID)).not.toThrow();
    expect(() => assertSeedSystemOptionsExact(
      exactRows.map((row, index) => index === 2 ? { ...row, name: "collision" } : row),
      TARGET_TENANT_ID,
    )).toThrow(/do not exactly match/);
  });
});