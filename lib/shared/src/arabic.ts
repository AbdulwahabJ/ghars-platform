import { toEnglishDigits } from "./phone";

/**
 * Normalization for Arabic search: strips diacritics/tatweel, unifies hamza
 * and taa-marbuta forms, converts Arabic-Indic digits, collapses whitespace.
 * Used to build `patients.full_name_normalized` and to normalize search input.
 */
export function normalizeArabicSearchText(input: string): string {
  return toEnglishDigits(input ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}
