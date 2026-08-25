import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n";

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { locale, changeLocale } = useLocale();
  const nextLocale: Locale = locale === "ar" ? "en" : "ar";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      dir="ltr"
      className="gap-2 text-muted-foreground hover:text-primary"
      aria-label={t("language.choose")}
      data-testid="language-switcher"
      onClick={() => void changeLocale(nextLocale)}
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span>{locale === "ar" ? t("language.english") : t("language.arabic")}</span>
    </Button>
  );
}