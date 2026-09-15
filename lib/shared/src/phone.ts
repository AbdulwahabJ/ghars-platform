/**
 * Mobile number normalization.
 *
 * Rules (mandated by the specification):
 * - `mobile_number` (original input) is never overwritten; this module only
 *   produces the separate normalized value stored in `mobile_normalized`.
 * - Saudi formats: 05XXXXXXXX -> 9665XXXXXXXX, +9665XXXXXXXX -> 9665XXXXXXXX,
 *   9665XXXXXXXX kept as-is.
 * - Non-Saudi numbers: only separators/punctuation are normalized. A number is
 *   treated as international ONLY when an explicit country code is present
 *   (leading + or 00). A foreign-looking number without a country code is
 *   rejected with a clear Arabic message. Never guess a country code.
 * - Arabic-Indic digits are converted to Latin digits before validation.
 */

export type MobileNormalizationResult =
  | { ok: true; normalized: string }
  | {
      ok: false;
      code: "EMPTY" | "INVALID" | "NEEDS_COUNTRY_CODE";
      message: string;
    };

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toEnglishDigits(input: string): string {
  return (input ?? "").replace(/[٠-٩۰-۹]/g, (d) => {
    const a = ARABIC_INDIC_DIGITS.indexOf(d);
    if (a >= 0) return String(a);
    const b = EXTENDED_ARABIC_DIGITS.indexOf(d);
    return b >= 0 ? String(b) : d;
  });
}

export const MOBILE_MSG_EMPTY = "يرجى إدخال رقم الجوال.";
export const MOBILE_MSG_INVALID =
  "رقم الجوال غير صحيح. يرجى التحقق من الرقم المدخل.";
export const MOBILE_MSG_NEEDS_COUNTRY_CODE =
  "للأرقام غير السعودية، يرجى إدخال الرقم كاملًا مع رمز الدولة (يبدأ بـ + أو 00). الأرقام السعودية يجب أن تبدأ بـ 05.";

/**
 * Normalize a mobile number for search and WhatsApp use.
 * Returns digits only (no plus sign) on success.
 */
export function normalizeMobile(raw: string): MobileNormalizationResult {
  const cleaned = toEnglishDigits(raw ?? "").replace(/[\s\u00A0\-().]/g, "");
  if (!cleaned) {
    return { ok: false, code: "EMPTY", message: MOBILE_MSG_EMPTY };
  }

  const hasPlus = cleaned.startsWith("+");
  const body = hasPlus ? cleaned.slice(1) : cleaned;

  if (!/^\d+$/.test(body)) {
    return { ok: false, code: "INVALID", message: MOBILE_MSG_INVALID };
  }

  // Explicit international prefix: leading + or leading 00.
  if (hasPlus || body.startsWith("00")) {
    let intl = hasPlus ? body : body.slice(2);
    // Tolerate the common "+966 05XXXXXXXX" typo: drop the redundant 0.
    if (/^9660\d+$/.test(intl)) {
      intl = "966" + intl.slice(4);
    }
    if (intl.startsWith("966")) {
      if (/^9665\d{8}$/.test(intl)) {
        return { ok: true, normalized: intl };
      }
      return { ok: false, code: "INVALID", message: MOBILE_MSG_INVALID };
    }
    if (intl.length >= 8 && intl.length <= 15 && !intl.startsWith("0")) {
      return { ok: true, normalized: intl };
    }
    return { ok: false, code: "INVALID", message: MOBILE_MSG_INVALID };
  }

  // Saudi local format.
  if (/^05\d{8}$/.test(body)) {
    return { ok: true, normalized: "966" + body.slice(1) };
  }
  // Saudi international format without plus.
  if (/^9665\d{8}$/.test(body)) {
    return { ok: true, normalized: body };
  }
  // A 966-prefixed value that is not a valid Saudi mobile.
  if (/^966\d*$/.test(body)) {
    return { ok: false, code: "INVALID", message: MOBILE_MSG_INVALID };
  }

  // Anything else has no explicit country code — never guess one.
  return {
    ok: false,
    code: "NEEDS_COUNTRY_CODE",
    message: MOBILE_MSG_NEEDS_COUNTRY_CODE,
  };
}

import {
  getCountries,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export type InternationalPhoneNormalizationResult =
  | {
      ok: true;
      e164: string;
      digitsOnly: string;
      countryCode: CountryCode;
    }
  | {
      ok: false;
      code: "EMPTY" | "INVALID_COUNTRY" | "INVALID";
      message: string;
    };

export const INTERNATIONAL_PHONE_MSG_EMPTY = "يرجى إدخال رقم الجوال.";
export const INTERNATIONAL_PHONE_MSG_INVALID =
  "رقم الجوال غير صالح للدولة المحددة.";

/**
 * Normalize a registration phone against the selected country. This is
 * intentionally separate from normalizeMobile, whose Saudi-only behavior is
 * used by existing patient features.
 */
export function normalizeInternationalPhone(
  raw: string,
  country: string = "SA",
): InternationalPhoneNormalizationResult {
  const selectedCountry = country.toUpperCase() as CountryCode;
  if (!getCountries().includes(selectedCountry)) {
    return {
      ok: false,
      code: "INVALID_COUNTRY",
      message: INTERNATIONAL_PHONE_MSG_INVALID,
    };
  }
  const input = toEnglishDigits(raw ?? "").trim();
  if (!input) {
    return { ok: false, code: "EMPTY", message: INTERNATIONAL_PHONE_MSG_EMPTY };
  }
  const explicitInternational = input.startsWith("+") || input.startsWith("00");
  const parseInput = input.startsWith("00") ? `+${input.slice(2)}` : input;
  const phone = parsePhoneNumberFromString(parseInput, selectedCountry);
  if (
    !phone ||
    !phone.isValid() ||
    (explicitInternational &&
      phone.country !== selectedCountry)
  ) {
    return { ok: false, code: "INVALID", message: INTERNATIONAL_PHONE_MSG_INVALID };
  }
  return {
    ok: true,
    e164: phone.number,
    digitsOnly: phone.number.slice(1),
    countryCode: phone.country ?? selectedCountry,
  };
}

export function formatInternationalPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const phone = parsePhoneNumberFromString(raw);
  return phone?.isValid() ? phone.formatInternational() : raw;
}
