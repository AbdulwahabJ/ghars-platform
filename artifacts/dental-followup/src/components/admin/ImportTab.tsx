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

// Original legacy components preserved
import { LegacyImport } from "./LegacyImport";
import { useUniversalImportCurrentBatch } from "@/hooks/use-admin";

export function ImportTab() {
  const { t } = useTranslation("admin");
  const [activeTab, setActiveTab] = useState<"universal" | "legacy">("universal");

  // Universal Import state machine
  const [batch, setBatch] = useState<UniversalImportBatch | null>(null);
  const [isMappingConfirmed, setIsMappingConfirmed] = useState(false);
  const [isReviewingPilot, setIsReviewingPilot] = useState(false);
  const [partialError, setPartialError] = useState<string>();
  const currentBatch = useUniversalImportCurrentBatch(!batch);

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
