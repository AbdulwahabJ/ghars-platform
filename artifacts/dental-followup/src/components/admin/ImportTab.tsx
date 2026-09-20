import { useEffect, useState } from "react";
import { UniversalImportBatch } from "@workspace/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import {
  UploadStep,
  MappingStep,
  ReviewStep,
  ResultStep,
} from "./universal-import/UniversalImportSteps";
import { Card, CardContent } from "@/components/ui/card";
import { HardDriveDownload, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

// Original legacy components preserved
import { LegacyImport } from "./LegacyImport";
import { useUniversalImportCurrentBatch } from "@/hooks/use-admin";
import { useFeatures } from "@/hooks/use-settings";

export function ImportTab() {
  const { t } = useTranslation("admin");
  const [, setLocation] = useLocation();
  const { data: features, isLoading: isFeaturesLoading } = useFeatures();
  const [activeTab, setActiveTab] = useState<"universal" | "legacy">("universal");

  // Universal Import state machine
  const [batch, setBatch] = useState<UniversalImportBatch | null>(null);
  const [isMappingConfirmed, setIsMappingConfirmed] = useState(false);
  const [isReviewingPilot, setIsReviewingPilot] = useState(false);
  const [partialError, setPartialError] = useState<string>();
  const currentBatch = useUniversalImportCurrentBatch(
    features?.legacyImportEnabled === true && !batch,
  );

  useEffect(() => {
    if (!batch && currentBatch.data) {
      setBatch(currentBatch.data);
      // Auto-skip mapping step if no mappings require review
      if (currentBatch.data.status === "ANALYZED") {
        const needsReview = currentBatch.data.mappings.some(m => m.requiresReview);
        if (!needsReview) {
          setIsMappingConfirmed(true);
        }
      }
    }
  }, [batch, currentBatch.data]);

  const handleAnalyzed = (b: UniversalImportBatch) => {
    setBatch(b);
    if (b.status === "ANALYZED") {
      const needsReview = b.mappings.some(m => m.requiresReview);
      if (!needsReview) {
        setIsMappingConfirmed(true);
      }
    }
  };

  const reset = () => {
    setBatch(null);
    setIsMappingConfirmed(false);
    setIsReviewingPilot(false);
    setPartialError(undefined);
  };

  if (isFeaturesLoading) {
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
              <h3 className="text-2xl font-bold text-slate-900">
                {t("import.comingSoon.title")}
              </h3>
              <p className="text-base text-slate-600 max-w-md mx-auto">
                {t("import.comingSoon.description")}
              </p>
              <p className="text-sm font-medium text-slate-600">
                {t("import.comingSoon.availability")}
              </p>
              <p className="text-sm text-slate-500 pt-2">
                {t("import.comingSoon.secondary")}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-4">
              <Button variant="outline" onClick={() => setLocation("/settings?tab=users")}>
                <ArrowLeft className="me-2 h-4 w-4" />
                {t("import.comingSoon.back")}
              </Button>
              <Button disabled variant="default">
                {t("import.comingSoon.cta")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="universal">
            {t("import.universal.tab", "Universal Import (Excel/CSV/PDF)")}
          </TabsTrigger>
          <TabsTrigger value="legacy">
            {t("import.legacy.tab", "Legacy Template Import")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="universal" className="mt-6">
          {!batch && (
            <UploadStep onAnalyzed={handleAnalyzed} />
          )}

          {batch && batch.status === "ANALYZED" && !isMappingConfirmed && (
            <MappingStep
              batch={batch}
              onNext={(b) => {
                setBatch(b);
                setIsMappingConfirmed(true);
              }}
              onCancel={reset}
            />
          )}

          {batch && (batch.status === "ANALYZED" || (batch.status === "PILOT_COMMITTED" && isReviewingPilot)) && isMappingConfirmed && (
            <ReviewStep
              batch={batch}
              onNext={(b, err) => {
                setBatch(b);
                setIsReviewingPilot(false);
                if (err) setPartialError(err);
              }}
              onCancel={reset}
            />
          )}

          {batch && ((batch.status === "PILOT_COMMITTED" && !isReviewingPilot) || batch.status === "COMMITTED" || batch.status === "ROLLED_BACK" || batch.status === "PARTIAL_FAILED") && (
            <ResultStep
              batch={batch}
              partialError={partialError}
              onReset={reset}
              onContinue={() => setIsReviewingPilot(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="legacy" className="mt-6">
          <LegacyImport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
