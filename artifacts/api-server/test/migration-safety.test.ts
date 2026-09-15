import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL("../../../lib/db/migrations/0025_registration_location_phone.sql", import.meta.url),
  "utf8",
);

describe("registration location migration safety", () => {
  it("is additive and preserves legacy city and contact phone columns", () => {
    expect(migrationSql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)\b/i);
    expect(migrationSql).not.toMatch(/\bRENAME\s+(TABLE|COLUMN)\b/i);
    expect(migrationSql).not.toMatch(/SET\s+"?(?:city|contact_phone)"?\s*=/i);
    expect(migrationSql).toMatch(/city_display_name.*city/s);
    expect(migrationSql).toMatch(/phone_e164/);
    expect(migrationSql).toMatch(/contact_phone/);
  });
});