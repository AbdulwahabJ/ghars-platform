import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ArrowLeft, HardDriveDownload, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useFeatures } from "@/hooks/use-settings";

const EnabledImportTab = lazy(() =>
  import("./ImportTab").then((module) => ({ default: module.ImportTab })),
);

export function ImportTabGate() {
  const { t } = useTranslation("admin");
  const [, setLocation] = useLocation();
  const { data: features, isLoading } = useFeatures();

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-navy" /></div>;
  }

  if (features?.legacyImportEnabled !== true) {
    return (
      <div className="py-8">
        <Card className="mx-auto max-w-xl shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50">
              <HardDriveDownload className="h-10 w-10 text-brand-navy" />
            </div>
            <div className="space-y-2">
              <Badge variant="secondary">{t("import.comingSoon.badge")}</Badge>
              <h3 className="text-2xl font-bold text-slate-900">{t("import.comingSoon.title")}</h3>
              <p className="text-base text-slate-600 max-w-md mx-auto">{t("import.comingSoon.description")}</p>
              <p className="text-sm font-medium text-slate-600">{t("import.comingSoon.availability")}</p>
              <p className="text-sm text-slate-500 pt-2">{t("import.comingSoon.secondary")}</p>
            </div>
            <div className="flex items-center gap-3 pt-4">
              <Button variant="outline" onClick={() => setLocation("/settings?tab=users")}>
                <ArrowLeft className="me-2 h-4 w-4" />
                {t("import.comingSoon.back")}
              </Button>
              <Button disabled variant="default">{t("import.comingSoon.cta")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-navy" /></div>}>
      <EnabledImportTab />
    </Suspense>
  );
}