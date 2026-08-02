import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useImplantCases } from "@/hooks/use-implant-cases";
import { useFollowups, useCommunications } from "@/hooks/use-followups";
import { useCaseFinance } from "@/hooks/use-finance";
import { formatSaudiDate, formatSaudiDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type {
  Followup,
  ImplantCaseWithImplants,
  Patient,
} from "@workspace/shared";
import {
  OPEN_FOLLOWUP_STATUS,
  FOLLOWUP_OUTCOME_STATUSES,
} from "@workspace/shared";

/** Label/value pair used across the summary sections. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium notranslate">{value ?? "—"}</span>
    </div>
  );
}

function CaseFinanceSummaryRow({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseFinance(caseId, true);
  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">جارٍ تحميل الملخص المالي…</p>
    );
  }
  if (!data) return null;
  const s = data.summary;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/40 rounded-lg p-3">
      <Field label="الإجمالي النهائي" value={formatMoney(s.finalTotal)} />
      <Field label="المدفوع" value={formatMoney(s.paidAmount)} />
      <Field label="المتبقي" value={formatMoney(s.outstanding)} />
      <Field label="حالة السداد" value={s.paymentStatus} />
    </div>
  );
}

function CaseSummary({
  implantCase,
  showFinance,
  showArchivedImplants,
  onPrintCase,
}: {
  implantCase: ImplantCaseWithImplants;
  showFinance: boolean;
  showArchivedImplants: boolean;
  onPrintCase: (caseId: string) => void;
}) {
  const c = implantCase;
  const implants = c.implants.filter(
    (i) => showArchivedImplants || i.status === "active",
  );
  return (
    <div className="border border-border rounded-xl p-4 space-y-3 break-inside-avoid">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-bold text-foreground notranslate">
            حالة زراعة — {c.caseStatus}
          </h4>
          {c.status === "archived" && (
            <Badge variant="secondary">مؤرشفة</Badge>
          )}
          {c.isReimplantation && <Badge variant="outline">إعادة زراعة</Badge>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="print:hidden"
          onClick={() => onPrintCase(c.id)}
          data-testid={`button-print-case-${c.id}`}
        >
          <Printer className="h-4 w-4" />
          <span>طباعة الحالة</span>
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Field
          label="تاريخ العملية"
          value={c.procedureDate ? formatSaudiDate(c.procedureDate) : "—"}
        />
        <Field label="الطبيب المعالج" value={c.treatingDoctor} />
        <Field label="الطبيب المحوِّل" value={c.referringDoctor ?? "—"} />
        <Field label="Pros" value={c.prosValue ?? "—"} />
        <Field
          label="تاريخ التركيب المتوقع"
          value={
            c.expectedProstheticDate
              ? formatSaudiDate(c.expectedProstheticDate)
              : "—"
          }
        />
        {c.isReimplantation && (
          <Field label="سبب إعادة الزراعة" value={c.reimplantationReason ?? "—"} />
        )}
      </div>
      {c.generalNote && <Field label="ملاحظة عامة" value={c.generalNote} />}

      {implants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد زرعات مسجلة في هذه الحالة.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-right text-xs text-muted-foreground border-b border-border">
                <th className="py-1.5 px-2 font-medium">الموقع</th>
                <th className="py-1.5 px-2 font-medium">النظام</th>
                <th className="py-1.5 px-2 font-medium">القياس</th>
                <th className="py-1.5 px-2 font-medium">Q</th>
                <th className="py-1.5 px-2 font-medium">Former</th>
                <th className="py-1.5 px-2 font-medium">Graft</th>
                <th className="py-1.5 px-2 font-medium">الإجراءات</th>
                <th className="py-1.5 px-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {implants.map((i) => (
                <tr key={i.id} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 px-2 notranslate" dir="ltr">
                    {i.site}
                  </td>
                  <td className="py-1.5 px-2 notranslate">{i.system ?? "—"}</td>
                  <td className="py-1.5 px-2 notranslate" dir="ltr">
                    {i.diameter != null && i.length != null
                      ? `${i.diameter} × ${i.length}`
                      : i.diameter != null
                        ? String(i.diameter)
                        : i.length != null
                          ? String(i.length)
                          : "—"}
                  </td>
                  <td className="py-1.5 px-2 notranslate">{i.qValue ?? "—"}</td>
                  <td className="py-1.5 px-2 notranslate">
                    {i.formerValue ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 notranslate">
                    {i.graftValue ?? "—"}
                    {i.graftProcedureType ? ` (${i.graftProcedureType})` : ""}
                  </td>
                  <td className="py-1.5 px-2 notranslate">
                    {i.procedureTags.length > 0
                      ? i.procedureTags.join("، ")
                      : "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="notranslate">{i.implantStatus}</span>
                    {i.status === "archived" && (
                      <Badge variant="secondary" className="mr-1 text-[10px]">
                        مؤرشفة
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showFinance && <CaseFinanceSummaryRow caseId={c.id} />}
    </div>
  );
}

/**
 * Patient الملخص tab — composes existing data into a single read-only view
 * with browser printing. Financial summaries render only for users with
 * financial permissions (the backend enforces this regardless).
 */
export function SummaryTab({ patient }: { patient: Patient }) {
  const { user } = useAuth();
  const showFinance = Boolean(
    user?.canViewFinancials || user?.canRecordPayments,
  );
  const [showArchived, setShowArchived] = useState(false);
  const [printCaseId, setPrintCaseId] = useState<string | null>(null);

  const { data: casesData, isLoading: casesLoading } = useImplantCases(
    patient.id,
  );
  const { data: followupsData, isLoading: followupsLoading } = useFollowups(
    patient.id,
  );
  const { data: commsData } = useCommunications(patient.id);

  const allCases = casesData?.items ?? [];
  const cases = allCases.filter(
    (c) => showArchived || c.status === "active",
  );
  const followups: Followup[] = followupsData ?? [];
  const openFollowups = followups.filter(
    (f) => f.followupStatus === OPEN_FOLLOWUP_STATUS,
  );
  const outcomeStatuses = FOLLOWUP_OUTCOME_STATUSES as readonly string[];
  const completedFollowups = followups.filter((f) =>
    outcomeStatuses.includes(f.followupStatus),
  );
  const nextFollowup = openFollowups
    .filter((f) => f.scheduledAt)
    .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))[0];
  const comms = commsData ?? [];

  const handlePrintCase = (caseId: string) => {
    setPrintCaseId(caseId);
    requestAnimationFrame(() => {
      window.print();
      setPrintCaseId(null);
    });
  };

  if (casesLoading || followupsLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6" data-testid="summary-tab">
      {/* Print-only header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">مجمع السن الرقمي الطبي</h1>
        <p className="text-sm mt-1">
          {printCaseId ? "ملخص حالة زراعة" : "ملخص ملف مريض"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          رقم الملف: <span dir="ltr">{patient.fileNumber}</span> — تاريخ
          الإنشاء: {formatSaudiDateTime(new Date())}
        </p>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="flex items-center gap-2">
          <Switch
            id="summary-show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
            data-testid="switch-show-archived"
          />
          <Label htmlFor="summary-show-archived" className="text-sm">
            إظهار العناصر المؤرشفة
          </Label>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          data-testid="button-print-summary"
        >
          <Printer className="h-4 w-4" />
          <span>طباعة الملخص</span>
        </Button>
      </div>

      {/* Patient info */}
      <section className={printCaseId ? "print:hidden" : ""}>
        <h3 className="font-bold text-foreground mb-3">بيانات المريض</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Field label="الاسم الكامل" value={patient.fullName} />
          <Field
            label="رقم الملف"
            value={<span dir="ltr">{patient.fileNumber}</span>}
          />
          <Field
            label="رقم الجوال"
            value={<span dir="ltr">{patient.mobileNumber || "—"}</span>}
          />
          <Field
            label="العمر"
            value={patient.age != null ? `${patient.age} سنة` : "—"}
          />
        </div>
      </section>

      {/* Cases + implants */}
      <section>
        <h3 className={`font-bold text-foreground mb-3 ${printCaseId ? "print:hidden" : ""}`}>
          حالات الزراعة ({cases.length})
        </h3>
        {cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد حالات زراعة مسجلة.
          </p>
        ) : (
          <div className="space-y-4">
            {cases.map((c) => (
              <div
                key={c.id}
                className={
                  printCaseId && printCaseId !== c.id ? "print:hidden" : ""
                }
              >
                <CaseSummary
                  implantCase={c}
                  showFinance={showFinance}
                  showArchivedImplants={showArchived}
                  onPrintCase={handlePrintCase}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Follow-up summary */}
      <section className={printCaseId ? "print:hidden" : ""}>
        <h3 className="font-bold text-foreground mb-3">ملخص المتابعات</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Field label="متابعات مجدولة" value={openFollowups.length} />
          <Field label="متابعات منجزة" value={completedFollowups.length} />
          <Field
            label="المتابعة القادمة"
            value={
              nextFollowup?.scheduledAt
                ? `${nextFollowup.followupType} — ${formatSaudiDateTime(nextFollowup.scheduledAt)}`
                : "—"
            }
          />
          <Field
            label="آخر نتيجة"
            value={
              completedFollowups.length > 0
                ? completedFollowups
                    .slice()
                    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
                    .followupStatus
                : "—"
            }
          />
        </div>
      </section>

      {/* Communications summary */}
      <section className={printCaseId ? "print:hidden" : ""}>
        <h3 className="font-bold text-foreground mb-3">ملخص التواصل</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Field label="عدد مرات التواصل" value={comms.length} />
          <Field
            label="آخر تواصل"
            value={
              comms.length > 0 ? formatSaudiDateTime(comms[0].createdAt) : "—"
            }
          />
          <Field
            label="آخر نتيجة تواصل"
            value={
              comms.find((c: { communicationResult: string | null }) => c.communicationResult)?.communicationResult ??
              "—"
            }
          />
        </div>
      </section>
    </div>
  );
}
