import { describe, expect, it } from "vitest";
import { parseHistoricalFinance } from "../src/routes/universal-import";
import { buildSummary } from "../src/routes/finance";

describe("safe historical finance parser", () => {
  it("parses documented total and paid amounts in cents", () => {
    expect(parseHistoricalFinance("Total 8,000 SAR; Paid 5,000 SAR")).toMatchObject({
      historicalTotalAmount: 800000,
      historicalPaidAmount: 500000,
      openingRemainingBalance: 300000,
    });
  });

  it("represents لم تدفع شيء as zero paid but keeps unknown total and remaining", () => {
    expect(parseHistoricalFinance("لم تدفع شيء")).toMatchObject({
      historicalTotalAmount: null,
      historicalPaidAmount: 0,
      openingRemainingBalance: null,
      historicalPaymentStatus: "UNPAID",
    });
  });

  it("does not infer a total from payment candidates", () => {
    const result = parseHistoricalFinance("دفعة أولى 4000\nدفعة ثانية 2000");
    expect(result.historicalTotalAmount).toBeNull();
    expect(result.historicalPaidAmount).toBe(600000);
    expect(result.openingRemainingBalance).toBeNull();
  });

  it("preserves ordinary finance behavior when no opening snapshot exists", () => {
    const summary = buildSummary({
      implantCaseId: "00000000-0000-0000-0000-000000000001",
      caseStatus: "حالة جديدة",
      baseTreatmentAmount: 8000,
      chargesTotal: 500,
      discountsTotal: 250,
      paidAmount: 3000,
    });
    expect(summary.openingRemainingBalance).toBeNull();
    expect(summary.finalTotal).toBe(8250);
    expect(summary.outstanding).toBe(5250);
  });
});