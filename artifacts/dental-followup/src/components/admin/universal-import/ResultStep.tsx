import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Undo2, ArrowRight, Loader2 } from "lucide-react";
import { UniversalImportBatch } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useUniversalImportRollbackBatch } from "@/hooks/use-admin";
import { localizeErrorMessage } from "@/lib/localize-error";

export function ResultStep({
  batch,
  partialError,
  onReset,
  onContinue,
}: {
  batch: UniversalImportBatch;
  partialError?: string;
  onReset: () => void;
  onContinue?: () => void;
}) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const rollback = useUniversalImportRollbackBatch();

  const handleRollback = () => {
    rollback.mutate(batch.id, {
      onSuccess: () => {
        toast({
          title: t("import.universal.rollbackSuccessTitle", "Rollback Successful"),
          description: t("import.universal.rollbackSuccessDesc", "All imported records have been safely removed."),
        });
        onReset();
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: t("import.universal.rollbackFailed", "Rollback Failed"),
          description: localizeErrorMessage(err),
        });
      }
    });
  };

  const isRolledBack = batch.status === "ROLLED_BACK";
  const isPartial = batch.status === "PARTIAL_FAILED";
  const isPilotCommitted = batch.status === "PILOT_COMMITTED";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isRolledBack
            ? t("import.universal.rolledBackTitle", "Import Rolled Back")
            : isPartial
              ? t("import.universal.partialTitle", "Step 4: Import Partially Failed")
              : isPilotCommitted
                ? t("import.universal.pilotCommittedTitle", "Step 4: Pilot Verification")
                : t("import.universal.resultTitle", "Step 4: Import Complete")}
        </CardTitle>
        <CardDescription>
          {isRolledBack
            ? t("import.universal.rolledBackDesc", "The import was successfully reversed.")
            : isPartial
              ? t("import.universal.partialDesc", "Some records failed to import. See details below.")
              : isPilotCommitted
                ? t("import.universal.pilotCommittedDesc", "Please verify the pilot import before continuing.")
                : t("import.universal.resultDesc", "Your data has been imported successfully.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        <Alert variant={isRolledBack ? "destructive" : isPartial ? "destructive" : "default"} className={!isRolledBack && !isPartial ? "bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-100 dark:border-green-900" : ""}>
          {isRolledBack ? <Undo2 className="h-5 w-5" /> : isPartial ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          <AlertTitle>
            {isRolledBack
              ? t("import.universal.statusRolledBack", "Data removed")
              : isPartial
                ? t("import.universal.statusPartial", "Import Halted")
                : isPilotCommitted
                  ? t("import.universal.statusPilotSuccess", "Pilot Successful")
                  : t("import.universal.statusSuccess", "Import Successful")}
          </AlertTitle>
          <AlertDescription>
            {batch.summary.pilot && <span className="font-bold me-1">({t("import.universal.pilotMode", "Pilot Mode")})</span>}
            {isPartial
              ? t("import.universal.summaryMsgPartial", {
                  count: batch.summary.committedRows || 0,
                })
              : isPilotCommitted
                ? t("import.universal.summaryMsgPilot", {
                    count: batch.summary.committedRows || 0,
                  })
                : t("import.universal.summaryMsg", {
                    count: batch.summary.committedRows || 0,
                    patients: batch.summary.patients,
                    implants: batch.summary.implants,
                  })}
            {isPartial && (
              <div className="mt-2 text-sm space-y-1">
                <div>
                  <span className="font-medium">{t("import.universal.errorPrefix", "Error:")}</span> {partialError ?? t("import.universal.partialHint", "A patient group failed processing. You can safely rollback the rows that did import.")}
                </div>
                {!partialError && (
                  <div>{t("import.universal.partialHint", "A patient group failed processing. You can safely rollback the rows that did import.")}</div>
                )}
                {partialError && (
                  <div>{t("import.universal.partialHint2", "You can safely rollback the rows that did import successfully.")}</div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>

        {!isRolledBack && (
          <div className="flex gap-4 p-4 border rounded-lg bg-muted/30 items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm">{t("import.universal.safeRollback", "Safe Rollback")}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {t("import.universal.rollbackExpl", "If you noticed an issue, you can safely undo this import. This will delete the inserted patients, cases, and implants as long as they haven't been modified yet.")}
              </p>
            </div>
            <Button variant="destructive" onClick={handleRollback} disabled={rollback.isPending}>
              {rollback.isPending && <Loader2 className="h-4 w-4 animate-spin ms-2" />}
              <Undo2 className="h-4 w-4 ms-2" />
              {t("import.universal.undoImport", "Undo Import")}
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          {isPilotCommitted && onContinue && (
            <Button onClick={onContinue} variant="default">
              {t("import.universal.continueImport", "Continue Import")}
              <ArrowRight className="h-4 w-4 ms-2" />
            </Button>
          )}
          <Button onClick={onReset} variant={isPilotCommitted ? "outline" : "default"}>
            {t("import.universal.startNew", "Start New Import")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}