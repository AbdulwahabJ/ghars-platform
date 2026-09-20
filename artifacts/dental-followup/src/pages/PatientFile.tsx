import { useEffect, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  Archive,
  AlertCircle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { usePatient, useArchivePatient, useRestorePatient, usePermanentDeletePatient } from "@/hooks/use-patients";
import { useToast } from "@/hooks/use-toast";
import { PatientDetailsSection } from "@/components/patients/PatientDetailsSection";
import { ImplantsTab } from "@/components/implants/ImplantsTab";
import { PaymentsTab } from "@/components/finance/PaymentsTab";
import { FollowupsTab } from "@/components/followups/FollowupsTab";
import { SummaryTab } from "@/components/summary/SummaryTab";
import { formatSaudiDate } from "@/lib/datetime";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";
import {
  buildPatientPath,
  parsePatientDeepLink,
  type PatientFileTab,
} from "@/lib/patient-links";

export default function PatientFile() {
  const { t } = useClinicalTranslation();
  const { t: commonT } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = usePatient(id ?? "");
  const archivePatient = useArchivePatient();
  const restorePatient = useRestorePatient();
  const permanentDeletePatient = usePermanentDeletePatient();
  const [showArchived, setShowArchived] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [deleteState, setDeleteState] = useState<{ open: boolean; impact?: any; importBatchContext?: string[]; confirmed: boolean }>({ open: false, confirmed: false });
  const deepLink = parsePatientDeepLink(search);
  const [activeTab, setActiveTab] = useState<PatientFileTab>(deepLink.tab);

  const patient = data?.patient;
  const canArchive = user?.role === "ADMIN";

  useEffect(() => {
    setActiveTab(parsePatientDeepLink(search).tab);
  }, [search]);

  const selectTab = (tab: PatientFileTab) => {
    setActiveTab(tab);
    if (id) setLocation(buildPatientPath(id, { tab }));
  };

  const handleArchive = () => {
    if (!id) return;
    archivePatient.mutate(id, {
      onSuccess: () => {
        toast({ title: t("patient.archiveSuccess") });
        setShowArchiveConfirm(false);
      },
      onError: (error: Error) =>
        toast({ variant: "destructive", title: t("patient.archiveFailed"), description: localizeErrorMessage(error) }),
    });
  };

  const handleRestore = () => {
    if (!id) return;
    restorePatient.mutate(id, {
      onSuccess: () => toast({ title: t("patient.restoreSuccess") }),
      onError: (error: Error) =>
        toast({ variant: "destructive", title: t("patient.restoreFailed"), description: localizeErrorMessage(error) }),
    });
  };

  const handlePermanentDeletePreview = () => {
    if (!id) return;
    setDeleteState({ open: true, confirmed: false });
    permanentDeletePatient.mutate(
      { id, input: { preview: true } },
      {
        onSuccess: (res: any) => {
          setDeleteState((prev) => ({ ...prev, impact: res.impact, importBatchContext: res.importBatchContext }));
        },
        onError: (error: Error) => {
          toast({ variant: "destructive", title: commonT("errors.actionFailed", { defaultValue: "Error" }), description: localizeErrorMessage(error) });
          setDeleteState({ open: false, confirmed: false });
        },
      }
    );
  };

  const handlePermanentDeleteConfirm = () => {
    if (!id) return;
    permanentDeletePatient.mutate(
      { id, input: { preview: false, confirmed: true } },
      {
        onSuccess: () => {
          toast({ title: t("operations:dashboard.deleteSuccess", { defaultValue: "Deleted successfully" }) });
          setDeleteState({ open: false, confirmed: false });
          setLocation("/patients");
        },
        onError: (error: Error) =>
          toast({ variant: "destructive", title: commonT("errors.actionFailed", { defaultValue: "Error" }), description: localizeErrorMessage(error) }),
      }
    );
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-4 text-xl font-bold">
            {commonT("errors.sectionLoadFailed")}
          </h2>
          <Button onClick={() => void refetch()} variant="outline">
            {commonT("actions.retry")}
          </Button>
        </div>
      </Shell>
    );
  }

  if (!patient) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
           <h2 className="mb-2 text-xl font-bold">{t("patient.notFound")}</h2>
          <Button onClick={() => setLocation("/patients")} variant="outline" className="mt-4">
             {t("patient.backToList")}
          </Button>
        </div>
      </Shell>
    );
  }

  const isArchived = patient.status === "archived";

  return (
    <Shell>
      <main className="animate-in fade-in duration-500 pb-20" id="tour-patient-workspace">
        <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" onClick={() => setLocation("/patients")} className="-ms-4 gap-2 text-muted-foreground hover:text-foreground">
             <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
             {t("patient.back")}
          </Button>
        </div>

        <header className="border-b border-border pb-5 print:hidden">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="min-w-0">
               <p className="text-xs text-muted-foreground">{t("patient.fullName")}</p>
              <p className="truncate font-bold text-foreground">{patient.fullName}</p>
            </div>
            <div>
               <p className="text-xs text-muted-foreground">{t("patient.fileNumber")}</p>
              <p className="font-semibold text-foreground notranslate" dir="ltr">{patient.fileNumber}</p>
            </div>
            <div>
               <p className="text-xs text-muted-foreground">{t("patient.mobile")}</p>
              <p className="font-semibold text-foreground notranslate" dir="ltr">{patient.mobileNumber || "—"}</p>
            </div>
            <div>
               <p className="text-xs text-muted-foreground">{t("patient.age")}</p>
               <p className="font-semibold text-foreground">{patient.age != null ? t("patient.years", { count: patient.age }) : "—"}</p>
            </div>
            <div>
               <p className="text-xs text-muted-foreground">{t("patient.addedAt")}</p>
              <p className="font-semibold text-foreground">{formatSaudiDate(patient.createdAt)}</p>
            </div>
          </div>
        </header>

        {isArchived ? (
          <Alert className="mt-5 print:hidden">
            <Archive className="h-4 w-4" />
             <AlertDescription>{t("patient.archivedNotice")}</AlertDescription>
          </Alert>
        ) : null}

        <nav
           aria-label={t("patient.tabs")}
          className="sticky top-0 z-10 -mx-2 mt-5 overflow-x-auto border-y border-border bg-background/95 px-2 py-2 shadow-sm backdrop-blur print:hidden"
        >
          <div className="grid min-w-[280px] grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/35 p-1 sm:min-w-0">
            <Button
              variant="ghost"
              aria-selected={activeTab === "summary"}
              data-testid="patient-tab-summary"
              className={`rounded-lg px-4 py-2.5 transition-all ${
                activeTab === "summary"
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
              onClick={() => selectTab("summary")}
            >
               {t("patient.data")}
            </Button>
            <Button
              variant="ghost"
              aria-selected={activeTab === "procedures"}
              data-testid="patient-tab-procedures"
              className={`rounded-lg px-4 py-2.5 transition-all ${
                activeTab === "procedures"
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
              onClick={() => selectTab("procedures")}
            >
               {t("patient.procedures")}
            </Button>
          </div>
        </nav>

        <div className="pt-5">
          {activeTab === "summary" ? (
            <SummaryTab
              patient={patient}
              showArchived={showArchived}
              onManage={() => selectTab("procedures")}
            />
          ) : (
            <div className="space-y-5 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 p-4 print:hidden">
                <div>
                   <h2 className="font-bold text-foreground">{t("patient.procedures")}</h2>
                   <p className="text-sm text-muted-foreground">{t("patient.workspace")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="patient-show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
                  <Label htmlFor="patient-show-archived" className="cursor-pointer text-sm text-muted-foreground">
                     {t("patient.showArchived")}
                  </Label>
                </div>
              </div>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <PatientDetailsSection
                  patient={patient}
                  canArchive={canArchive}
                  onArchive={() => setShowArchiveConfirm(true)}
                  onRestore={handleRestore}
                  isRestoring={restorePatient.isPending}
                  onPermanentDelete={canArchive ? handlePermanentDeletePreview : undefined}
                />
              </section>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <ImplantsTab patient={patient} showArchived={showArchived} />
              </section>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h2 className="text-lg font-bold text-foreground">{t("patient.finance")}</h2>
                  <p className="text-sm text-muted-foreground">{t("patient.financeDescription")}</p>
                </div>
                <PaymentsTab patient={patient} />
              </section>
              <section
                id="patient-followups"
                className="scroll-mt-32 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6"
              >
                <div className="mb-5">
                  <h2 className="text-lg font-bold text-foreground">{t("patient.followups")}</h2>
                  <p className="text-sm text-muted-foreground">{t("patient.followupsDescription")}</p>
                </div>
                <FollowupsTab
                  patient={patient}
                  focusSection={deepLink.section === "followups"}
                  targetFollowupId={deepLink.followupId}
                />
              </section>
            </div>
          )}
        </div>
      </main>

      <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
           <DialogContent className="text-start sm:max-w-md" dir={document.documentElement.dir}>
          <DialogHeader>
             <DialogTitle className="text-xl font-bold text-destructive">{t("patient.archiveTitle")}</DialogTitle>
            <DialogDescription className="mt-4 text-base leading-relaxed text-foreground">
               {t("patient.archiveDescription", { name: patient.fullName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5 flex-row gap-3 sm:justify-start">
            <Button onClick={handleArchive} disabled={archivePatient.isPending} variant="destructive">
               {archivePatient.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("patient.archive")}
            </Button>
             <Button variant="outline" onClick={() => setShowArchiveConfirm(false)}>{t("patient.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteState.open} onOpenChange={(open) => setDeleteState(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="text-start sm:max-w-md" dir={document.documentElement.dir}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-destructive">{t("operations:dashboard.confirmBulkDeleteTitle", { defaultValue: "Permanent Delete" })}</AlertDialogTitle>
            <AlertDialogDescription className="mt-4 text-base leading-relaxed text-foreground">
              {t("operations:dashboard.confirmPatientDeleteDescription", { defaultValue: "This action will permanently delete the patient and all related data. This action cannot be undone." })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            {!deleteState.impact ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm space-y-1 font-medium">
                  {deleteState.impact.cases > 0 && <p>{t("operations:dashboard.impactCases")}: {deleteState.impact.cases.toLocaleString("en-US")}</p>}
                  {deleteState.impact.implants > 0 && <p>{t("operations:dashboard.impactImplants")}: {deleteState.impact.implants.toLocaleString("en-US")}</p>}
                  {deleteState.impact.boneGraftProcedures > 0 && <p>{t("operations:dashboard.impactBoneGraftProcedures")}: {deleteState.impact.boneGraftProcedures.toLocaleString("en-US")}</p>}
                  {deleteState.impact.prostheticEvents > 0 && <p>{t("operations:dashboard.impactProstheticEvents")}: {deleteState.impact.prostheticEvents.toLocaleString("en-US")}</p>}
                  {deleteState.impact.followups > 0 && <p>{t("operations:dashboard.impactFollowups")}: {deleteState.impact.followups.toLocaleString("en-US")}</p>}
                  {deleteState.impact.communications > 0 && <p>{t("operations:dashboard.impactCommunications")}: {deleteState.impact.communications.toLocaleString("en-US")}</p>}
                  {deleteState.impact.payments > 0 && <p>{t("operations:dashboard.impactPayments")}: {deleteState.impact.payments.toLocaleString("en-US")}</p>}
                  {deleteState.impact.charges > 0 && <p>{t("operations:dashboard.impactCharges")}: {deleteState.impact.charges.toLocaleString("en-US")}</p>}
                  {deleteState.impact.discounts > 0 && <p>{t("operations:dashboard.impactDiscounts")}: {deleteState.impact.discounts.toLocaleString("en-US")}</p>}
                  {deleteState.impact.installmentPlans > 0 && <p>{t("operations:dashboard.impactInstallmentPlans")}: {deleteState.impact.installmentPlans.toLocaleString("en-US")}</p>}
                  {deleteState.impact.installments > 0 && <p>{t("operations:dashboard.impactInstallments")}: {deleteState.impact.installments.toLocaleString("en-US")}</p>}
                  {deleteState.impact.historicalFinance > 0 && <p>{t("operations:dashboard.impactHistoricalFinance")}: {deleteState.impact.historicalFinance.toLocaleString("en-US")}</p>}
                  {deleteState.impact.importedCases > 0 && <p>{t("operations:dashboard.impactImportedCases")}: {deleteState.impact.importedCases.toLocaleString("en-US")}</p>}
                  {deleteState.impact.patients > 0 && <p>{t("operations:dashboard.impactPatients")}: {deleteState.impact.patients.toLocaleString("en-US")}</p>}
                  {deleteState.importBatchContext && deleteState.importBatchContext.length > 0 && (
                    <p>{t("operations:dashboard.impactImportBatchContext")}: {deleteState.importBatchContext.length.toLocaleString("en-US")}</p>
                  )}
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="confirm-delete"
                    checked={deleteState.confirmed}
                    onCheckedChange={(checked) => setDeleteState(prev => ({ ...prev, confirmed: checked === true }))}
                  />
                  <Label htmlFor="confirm-delete" className="text-sm font-semibold cursor-pointer">
                    {t("operations:dashboard.deleteAcknowledgment", { defaultValue: "I fully understand that this deletion is permanent and cannot be undone." })}
                  </Label>
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter className="mt-5 flex-row gap-3 sm:justify-start">
            <Button
              onClick={handlePermanentDeleteConfirm}
              disabled={!deleteState.impact || !deleteState.confirmed || permanentDeletePatient.isPending}
              variant="destructive"
            >
              {permanentDeletePatient.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("operations:dashboard.deletePatientPermanently", { defaultValue: "Delete Patient Permanently" })}
            </Button>
            <AlertDialogCancel asChild>
              <Button variant="outline" onClick={() => setDeleteState(prev => ({ ...prev, open: false }))}>
                {t("patient.cancel")}
              </Button>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}