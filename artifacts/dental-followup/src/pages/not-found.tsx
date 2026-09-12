import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/LocaleProvider";

export default function NotFound() {
  const { t } = useTranslation("common");
  const { direction } = useLocale();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background" dir={direction}>
      <div className="text-center p-8 bg-card border border-border rounded-2xl shadow-sm max-w-md w-full">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-3">{t("notFound.title")}</h1>
        <p className="text-muted-foreground mb-8">
          {t("notFound.description")}
        </p>
        <Link href="/dashboard" className="btn-primary w-full inline-flex justify-center">
          {t("notFound.returnHome")}
        </Link>
      </div>
    </div>
  );
}
