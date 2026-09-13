import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

type PublicBackToHomeProps = {
  className?: string;
};

export function PublicBackToHome({ className = "" }: PublicBackToHomeProps) {
  const { t } = useTranslation("common");

  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 rounded-lg border border-brand-navy/15 bg-white/80 px-3 py-2 text-sm font-medium text-brand-navy shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/30 ${className}`}
      aria-label={t("actions.backToHome")}
      data-testid="link-back-to-home"
    >
      <ArrowLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
      <span>{t("actions.backToHome")}</span>
    </Link>
  );
}