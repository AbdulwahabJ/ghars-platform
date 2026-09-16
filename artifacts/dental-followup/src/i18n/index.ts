import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import arCommon from "./locales/ar/common";
import arAuth from "./locales/ar/auth";
import arCommercial from "./locales/ar/commercial";
import arErrors from "./locales/ar/errors";
import arValidation from "./locales/ar/validation";
import arOperations from "./locales/ar/operations";
import arClinical from "./locales/ar/clinical";
import arAdmin from "./locales/ar/admin";
import arGuidance from "./locales/ar/guidance";
import arQuickEntry from "./locales/ar/quickEntry";
import arStatistics from "./locales/ar/statistics";
import arEnums from "./locales/ar/enums";
import enCommon from "./locales/en/common";
import enAuth from "./locales/en/auth";
import enCommercial from "./locales/en/commercial";
import enErrors from "./locales/en/errors";
import enValidation from "./locales/en/validation";
import enOperations from "./locales/en/operations";
import enClinical from "./locales/en/clinical";
import enAdmin from "./locales/en/admin";
import enGuidance from "./locales/en/guidance";
import enQuickEntry from "./locales/en/quickEntry";
import enStatistics from "./locales/en/statistics";
import enEnums from "./locales/en/enums";

export const SUPPORTED_LOCALES = ["ar", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_STORAGE_KEY = "ghars.locale";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "en" ? "en" : DEFAULT_LOCALE;
}

export const resources = {
  ar: {
    common: arCommon,
    auth: arAuth,
    commercial: arCommercial,
    errors: arErrors,
    validation: arValidation,
    operations: arOperations,
    clinical: arClinical,
    admin: arAdmin,
    guidance: arGuidance,
    quickEntry: arQuickEntry,
    statistics: arStatistics,
    enums: arEnums,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    commercial: enCommercial,
    errors: enErrors,
    validation: enValidation,
    operations: enOperations,
    clinical: enClinical,
    admin: enAdmin,
    guidance: enGuidance,
    quickEntry: enQuickEntry,
    statistics: enStatistics,
    enums: enEnums,
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES,
  defaultNS: "common",
  ns: ["common", "auth", "commercial", "errors", "validation", "operations", "clinical", "admin", "guidance", "quickEntry", "statistics", "enums"],
  interpolation: { escapeValue: false },
  returnNull: false,
  missingKeyHandler: (_lngs, _ns, key) => {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation key: ${key}`);
    }
  },
});

export function isLocale(value: unknown): value is Locale {
  return value === "ar" || value === "en";
}

export async function setLocale(locale: Locale): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  await i18n.changeLanguage(locale);
}

export function getLocale(): Locale {
  return isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
}

/** Resolve an explicit locale for formatters without consulting browser defaults. */
export function getIntlLocale(locale: Locale = getLocale()): string {
  // Keep system-generated UI digits Latin in both languages. This explicit
  // extension is intentional: browser/OS Arabic preferences must not change
  // dashboard, report, or form-control display.
  return locale === "en" ? "en-US-u-nu-latn-ca-gregory" : "ar-SA-u-nu-latn-ca-gregory";
}

export function getTranslationKeyForLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA" : "en-US";
}

export default i18n;