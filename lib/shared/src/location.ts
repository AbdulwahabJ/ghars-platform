const CURATED_CITY_ALIASES: Record<string, string> = {
  مكة: "makkah",
  "مكة المكرمة": "makkah",
  makkah: "makkah",
  mecca: "makkah",
  جدة: "jeddah",
  jeddah: "jeddah",
  الرياض: "riyadh",
  riyadh: "riyadh",
  المدينة: "medina",
  "المدينة المنورة": "medina",
  medina: "medina",
  medinah: "medina",
  dubai: "dubai",
  دبي: "dubai",
  amman: "amman",
  "عمّان": "amman",
  cairo: "cairo",
  القاهرة: "cairo",
};

function comparableCityName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Derive the stable analytics value from a submitted display name. The
 * country is deliberately not folded into this value because it is stored in
 * its own indexed column.
 */
export function normalizeCityName(cityDisplayName: string): string {
  const comparable = comparableCityName(cityDisplayName);
  return CURATED_CITY_ALIASES[comparable] ??
    comparable
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "");
}

export function cityDisplayNameFromInput(
  cityDisplayName: string | undefined,
  legacyCity: string | undefined,
): string | undefined {
  const value = cityDisplayName?.trim() || legacyCity?.trim();
  return value || undefined;
}