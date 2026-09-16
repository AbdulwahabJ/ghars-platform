import { describe, expect, it } from "vitest";
import { resources } from "../src/i18n";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n resource parity", () => {
  it("keeps every registered Arabic and English namespace key in sync", () => {
    const arabic = resources.ar as Record<string, unknown>;
    const english = resources.en as Record<string, unknown>;
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());

    for (const namespace of Object.keys(arabic)) {
      expect(leafKeys(arabic[namespace]).sort(), namespace).toEqual(
        leafKeys(english[namespace]).sort(),
      );
    }
  });
});