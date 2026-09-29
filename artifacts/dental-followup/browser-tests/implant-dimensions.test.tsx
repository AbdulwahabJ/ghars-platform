import { describe, expect, it } from "vitest";
import { finalizeDecimalInput, parseImplantDimension } from "../src/lib/digits";

describe("implant dimensions", () => {
  it("accepts localized decimal separators and digits without changing partial input", () => {
    for (const value of ["4.5", "4,5", "4٫5", "٤٫٥", "۴٫۵"]) {
      expect(parseImplantDimension(value)).toBe(4.5);
    }
    expect(finalizeDecimalInput("4.")).toBe("4");
    expect(finalizeDecimalInput("4,")).toBe("4");
    expect(finalizeDecimalInput("4٫")).toBe("4");
    for (const value of ["10", "11.5", "12,5"]) {
      expect(parseImplantDimension(value)).toBe(Number(value.replace(",", ".")));
    }
  });

  it("leaves invalid text visible for the form's inline error", () => {
    for (const value of ["4..5", "abc", "-4.5"]) {
      expect(Number.isNaN(parseImplantDimension(value))).toBe(true);
      expect(finalizeDecimalInput(value)).toBe(value);
    }
  });
});