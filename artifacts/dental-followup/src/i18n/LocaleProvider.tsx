import { createContext, PropsWithChildren, useEffect, useMemo, useState, useContext } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/hooks/use-auth";
import { useUpdatePreferences } from "@/hooks/use-preferences";
import {
  DEFAULT_LOCALE,
  getLocale,
  isLocale,
  Locale,
  setLocale,
} from "./index";

export function LocaleProvider({ children }: PropsWithChildren) {
  const { i18n } = useTranslation();
  const { user, preferences } = useAuth();
  const updatePreferences = useUpdatePreferences();
  const [locale, setCurrentLocale] = useState<Locale>(getLocale);

  useEffect(() => {
    const handleLanguageChanged = (next: string) => {
      setCurrentLocale(isLocale(next) ? next : DEFAULT_LOCALE);
    };
    i18n.on("languageChanged", handleLanguageChanged);
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, [i18n]);

  useEffect(() => {
    const preferredLocale = preferences?.locale;
    if (user && isLocale(preferredLocale) && preferredLocale !== locale) {
      void setLocale(preferredLocale);
    }
  }, [locale, preferences?.locale, user]);

  useEffect(() => {
    const direction = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.body.dir = direction;
    document.documentElement.dataset.locale = locale;
    document.title =
      locale === "ar"
        ? "غرس | Ghars"
        : "Ghars | Dental Implant Management";
  }, [locale]);

  const changeLocale = async (next: Locale) => {
    if (next === locale) return;
    await setLocale(next);
    if (user && preferences?.locale !== next) {
      updatePreferences.mutate({ locale: next });
    }
  };

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      changeLocale,
    }),
    [locale, user, preferences?.locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

type LocaleContextValue = {
  locale: Locale;
  direction: "rtl" | "ltr";
  changeLocale: (locale: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return context;
}