import { Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useImplantCases } from "@/hooks/use-implant-cases";
import { useFollowups, useCommunications } from "@/hooks/use-followups";
import { useCaseFinance } from "@/hooks/use-finance";
import { formatSaudiDate, formatSaudiDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { bucketFollowups } from "@/components/followups/followup-utils";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import type {
  Followup,
  ImplantCaseWithImplants,
  Patient,
} from "@workspace/shared";
import {
  FOLLOWUP_OUTCOME_STATUSES,
  OPEN_FOLLOWUP_STATUS,
} from "@workspace/shared";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground notranslate">{value ?? "—"}</span>
    </div>
  );
}

function CaseFinanceSummaryRow({ caseId }: { caseId: string }) {
  const { t } = useClinicalTranslation();
  const { data, isLoading } = useCaseFinance(caseId, true);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">{t("summary.loadingFinance")}</p>;
  }

  if (!data) return null;

  const { summary, installmentPlan } = data;
  const paidInstallments = installmentPlan?.installments.filter(
    (installment) => installment.status === "مدفوع",
  ).length ?? 0;
  const dueInstallments = installmentPlan?.installments.filter((installment) =>
    ["مستحق اليوم", "متأخر", "مدفوع جزئيًا"].includes(installment.status),
  ).length ?? 0;
  const scheduledInstallments = installmentPlan?.installments.filter(
    (installment) => installment.status === "مجدول",
  ).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-border/70 py-3 md:grid-cols-4">
        <Field label={t("summary.finalTotal")} value={formatMoney(summary.finalTotal)} />
        <Field label={t("summary.paid")} value={formatMoney(summary.paidAmount)} />
        <Field label={t("summary.remaining")} value={formatMoney(summary.outstanding)} />
        <Field label={t("summary.paymentStatus")} value={summary.paymentStatus} />
      </div>
      {installmentPlan ? (
        <div className="border-s border-border ps-3 text-sm">
          <p className="font-medium text-foreground">{t("summary.installmentPlan")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("summary.installments", { count: installmentPlan.installmentCount })} — {t("summary.paidInstallments", { count: paidInstallments })} — {t("summary.dueInstallments", { count: dueInstallments })} — {t("summary.scheduledInstallments", { count: scheduledInstallments })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ImplantTable({
  implantCase,
  showArchived,
}: {
  implantCase: ImplantCaseWithImplants;
  showArchived: boolean;
}) {
  const { t } = useClinicalTranslation();
  const implants = implantCase.implants.filter(
    (implant) => showArchived || implant.status === "active",
  );

  if (!implants.length) {
    return <p className="text-sm text-muted-foreground">{t("summary.noImplants")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-start text-xs text-muted-foreground">
             <th className="px-2 py-1.5 font-medium">{t("summary.site")}</th>
             <th className="px-2 py-1.5 font-medium">{t("summary.system")}</th>
             <th className="px-2 py-1.5 font-medium">{t("summary.size")}</th>
            <th className="px-2 py-1.5 font-medium">Q</th>
            <th className="px-2 py-1.5 font-medium">Former</th>
            <th className="px-2 py-1.5 font-medium">Graft</th>
             <th className="px-2 py-1.5 font-medium">{t("summary.status")}</th>
          </tr>
        </thead>
        <tbody>
          {implants.map((implant) => (
            <tr key={implant.id} className="border-b border-border/50 last:border-0">
              <td className="px-2 py-1.5 notranslate" dir="ltr">{implant.site}</td>
              <td className="px-2 py-1.5 notranslate">{implant.system ?? "—"}</td>
              <td className="px-2 py-1.5 notranslate" dir="ltr">
                {implant.diameter != null && implant.length != null
                  ? `${implant.diameter} × ${implant.length}`
                  : implant.diameter != null
                    ? String(implant.diameter)
                    : implant.length != null
                      ? String(implant.length)
                      : "—"}
              </td>
              <td className="px-2 py-1.5 notranslate">{implant.qValue ?? "—"}</td>
              <td className="px-2 py-1.5 notranslate">{implant.formerValue ?? "—"}</td>
              <td className="px-2 py-1.5 notranslate">
                {implant.graftValue ?? "—"}
                {implant.graftProcedureType ? ` (${implant.graftProcedureType})` : ""}
              </td>
              <td className="px-2 py-1.5">
                <span className="notranslate">{implant.implantStatus}</span>
                {implant.status === "archived" ? (
                   <Badge variant="secondary" className="ms-1 text-[10px]">{t("summary.archived")}</Badge>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoneGraftSummary({
  implantCase,
  showArchived,
}: {
  implantCase: ImplantCaseWithImplants;
  showArchived: boolean;
}) {
  const { t } = useClinicalTranslation();
  const procedures = implantCase.boneGraftProcedures.filter(
    (procedure) => showArchived || procedure.status === "active",
  );

  if (!procedures.length) return null;

  return (
    <div className="space-y-2">
       <h5 className="text-sm font-bold text-foreground">{t("summary.adjunctProcedures")}</h5>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs text-muted-foreground">
               <th className="px-2 py-1.5 font-medium">{t("summary.date")}</th>
               <th className="px-2 py-1.5 font-medium">{t("summary.site")}</th>
               <th className="px-2 py-1.5 font-medium">{t("summary.categoryDescription")}</th>
               <th className="px-2 py-1.5 font-medium">{t("summary.sideLiftType")}</th>
               <th className="px-2 py-1.5 font-medium">{t("summary.material")}</th>
               <th className="px-2 py-1.5 font-medium">{t("summary.membrane")}</th>
               <th className="px-2 py-1.5 font-medium">{t("summary.status")}</th>
            </tr>
          </thead>
          <tbody>
            {procedures.map((procedure) => (
              <tr key={procedure.id} className="border-b border-border/50 last:border-0">
                <td className="px-2 py-1.5">{formatSaudiDate(procedure.procedureDate)}</td>
                <td className="px-2 py-1.5">{procedure.site ?? "—"}</td>
                <td className="px-2 py-1.5">{procedure.procedureCategory} — {procedure.procedureType}</td>
                <td className="px-2 py-1.5">{[procedure.procedureSide, procedure.liftType].filter(Boolean).join(" — ") || "—"}</td>
                <td className="px-2 py-1.5">{procedure.material ?? "—"}</td>
                <td className="px-2 py-1.5">{procedure.membrane ?? "—"}</td>
                <td className="px-2 py-1.5">
                  {procedure.procedureStatus}
                  {procedure.status === "archived" ? (
                     <Badge variant="secondary" className="ms-1 text-[10px]">{t("summary.archived")}</Badge>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProstheticSummary({
  implantCase,
  showArchived,
}: {
  implantCase: ImplantCaseWithImplants;
  showArchived: boolean;
}) {
  const { t } = useClinicalTranslation();
  const events = implantCase.prostheticEvents.filter(
    (event) => showArchived || event.status === "active",
  );

  if (!events.length) return null;

  return (
    <div className="space-y-2">
       <h5 className="text-sm font-bold text-foreground">{t("summary.prostheticRecord")}</h5>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {events.map((event) => {
          const implant = event.implantId
            ? implantCase.implants.find((item) => item.id === event.implantId)
            : null;
          return (
            <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>{formatSaudiDate(event.eventDate)} | {event.eventType}</span>
              <span className="text-muted-foreground">
                 {implant ? t("implant.tooth", { site: implant.site }) : t("summary.caseLevel")}
                 {event.status === "archived" ? ` — ${t("summary.archived")}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaseSummary({
  implantCase,
  showArchived,
}: {
  implantCase: ImplantCaseWithImplants;
  showArchived: boolean;
}) {
  const { t } = useClinicalTranslation();
  return (
    <article className="space-y-4 border-b border-border pb-6 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
         <h4 className="font-bold text-foreground">{t("summary.implantCase")} — {implantCase.caseStatus}</h4>
         {implantCase.status === "archived" ? <Badge variant="secondary">{t("summary.archived")}</Badge> : null}
         {implantCase.isReimplantation ? <Badge variant="outline">{t("implant.reimplantation")}</Badge> : null}
      </div>
      <div className="grid gap-x-6 gap-y-2 border-y border-border/70 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Field
           label={t("summary.procedureDate")}
          value={implantCase.procedureDate ? formatSaudiDate(implantCase.procedureDate) : "—"}
        />
         <Field label={t("summary.treatingDoctor")} value={implantCase.treatingDoctor} />
        <Field label="Pros" value={implantCase.prosValue ?? "—"} />
        <Field
           label={t("summary.expectedProstheticDate")}
          value={implantCase.expectedProstheticDate ? formatSaudiDate(implantCase.expectedProstheticDate) : "—"}
        />
        {implantCase.referringDoctor ? (
           <Field label={t("implant.referringDoctor")} value={implantCase.referringDoctor} />
        ) : null}
         {implantCase.generalNote ? <Field label={t("summary.generalNote")} value={implantCase.generalNote} /> : null}
      </div>
      <ImplantTable implantCase={implantCase} showArchived={showArchived} />
      <BoneGraftSummary implantCase={implantCase} showArchived={showArchived} />
      <ProstheticSummary implantCase={implantCase} showArchived={showArchived} />
    </article>
  );
}

export function SummaryTab({
  patient,
  showArchived = false,
  onManage,
}: {
  patient: Patient;
  showArchived?: boolean;
  onManage?: () => void;
}) {
  const { t } = useClinicalTranslation();
  const { user } = useAuth();
  const canViewFinancials = Boolean(
    user?.canViewFinancials || user?.canRecordPayments,
  );
  const { data: casesData, isLoading: casesLoading } = useImplantCases(patient.id);
  const { data: followupsData, isLoading: followupsLoading } = useFollowups(patient.id);
  const { data: communicationsData } = useCommunications(patient.id);

  const allCases = casesData?.items ?? [];
  const cases = allCases.filter((implantCase) => showArchived || implantCase.status === "active");
  const followups: Followup[] = followupsData ?? [];
  const openFollowups = followups.filter(
    (followup) => followup.followupStatus === OPEN_FOLLOWUP_STATUS,
  );
  const completedFollowups = followups.filter((followup) =>
    (FOLLOWUP_OUTCOME_STATUSES as readonly string[]).includes(followup.followupStatus),
  );
  const overdueFollowups = bucketFollowups(followups).overdue;
  const nextFollowup = openFollowups
    .filter((followup) => followup.scheduledAt)
    .sort((first, second) => first.scheduledAt!.localeCompare(second.scheduledAt!))[0];
  const communications = communicationsData ?? [];
  const recentCommunications = communications
    .slice()
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  const latestCommunication = recentCommunications[0];
  const latestCommunicationWithResult = recentCommunications.find(
    (communication) => communication.communicationResult,
  );

  if (casesLoading || followupsLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-7" data-testid="summary-tab">
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-brand-navy">غرس | Ghars</h1>
         <p className="mt-1 text-sm">{t("summary.patientFileSummary")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
           {t("summary.fileNumber")}: <span dir="ltr">{patient.fileNumber}</span> — {t("summary.printDate")}: {formatSaudiDateTime(new Date())}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
        <div>
           <h2 className="text-xl font-bold text-foreground">{t("summary.patientData")}</h2>
           <p className="mt-1 text-sm text-muted-foreground">{t("summary.clinicalSummaryDescription")}</p>
        </div>
        <div className="flex items-center gap-2">
          {onManage ? (
            <Button variant="outline" size="sm" onClick={onManage} data-testid="button-manage-patient">
               {t("summary.manageFile")}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-summary">
            <Printer className="ms-1.5 h-4 w-4" />
             {t("summary.printFile")}
          </Button>
        </div>
      </div>

      <section>
         <h3 className="mb-3 font-bold text-foreground">{t("summary.patientData")}</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 border-y border-border/70 py-3 sm:grid-cols-2 lg:grid-cols-3">
           <Field label={t("summary.fullName")} value={patient.fullName} />
           <Field label={t("summary.fileNumber")} value={<span dir="ltr">{patient.fileNumber}</span>} />
           <Field label={t("summary.mobile")} value={<span dir="ltr">{patient.mobileNumber || "—"}</span>} />
           <Field label={t("summary.age")} value={patient.age != null ? t("patient.years", { count: patient.age }) : "—"} />
           <Field label={t("summary.addedAt")} value={formatSaudiDate(patient.createdAt)} />
           <Field label={t("summary.administrativeNote")} value={patient.administrativeNote ?? "—"} />
        </div>
      </section>

      <section>
         <h3 className="mb-3 font-bold text-foreground">{t("summary.implantCases", { count: cases.length })}</h3>
        {cases.length === 0 ? (
           <p className="text-sm text-muted-foreground">{t("summary.noCases")}</p>
        ) : (
          <div className="space-y-6">
            {cases.map((implantCase) => (
              <CaseSummary key={implantCase.id} implantCase={implantCase} showArchived={showArchived} />
            ))}
          </div>
        )}
      </section>

      {canViewFinancials ? (
        <section>
           <h3 className="mb-3 font-bold text-foreground">{t("summary.financialSummary")}</h3>
          {cases.length === 0 ? (
             <p className="text-sm text-muted-foreground">{t("summary.noActiveCasesFinance")}</p>
          ) : (
            <div className="space-y-4">
              {cases.map((implantCase) => (
                <div key={`finance-${implantCase.id}`} className="break-inside-avoid">
                   <p className="mb-2 text-sm font-medium">{t("summary.implantCase")} — {implantCase.caseStatus}</p>
                  <CaseFinanceSummaryRow caseId={implantCase.id} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
         <h3 className="mb-3 font-bold text-foreground">{t("summary.followupSummary")}</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-border/70 py-3 md:grid-cols-5">
           <Field label={t("summary.scheduledFollowups")} value={openFollowups.length} />
           <Field label={t("summary.overdueFollowups")} value={overdueFollowups.length} />
           <Field label={t("summary.completedFollowups")} value={completedFollowups.length} />
          <Field
             label={t("summary.nextFollowup")}
            value={
              nextFollowup?.scheduledAt
                ? `${nextFollowup.followupType} — ${formatSaudiDateTime(nextFollowup.scheduledAt)}`
                : "—"
            }
          />
          <Field
             label={t("summary.latestFollowupResult")}
            value={
              completedFollowups
                .slice()
                .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))[0]
                ?.followupStatus ?? "—"
            }
          />
        </div>
      </section>

      <section>
         <h3 className="mb-3 font-bold text-foreground">{t("summary.communicationSummary")}</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-border/70 py-3 md:grid-cols-3">
           <Field label={t("summary.communicationCount")} value={communications.length} />
          <Field
             label={t("summary.latestCommunication")}
            value={latestCommunication ? formatSaudiDateTime(latestCommunication.createdAt) : "—"}
          />
          <Field
             label={t("summary.latestCommunicationResult")}
            value={latestCommunicationWithResult?.communicationResult ?? "—"}
          />
        </div>
      </section>
    </div>
  );
}