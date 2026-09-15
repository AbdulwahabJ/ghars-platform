import React, { useState } from "react";
import { Link } from "wouter";
import { Loader2, Plus, Printer, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Calendar, CalendarCheck2, Banknote, Stethoscope, Activity, ClipboardList, Pencil, Check, X, Search, Trash2, AlertCircle, CreditCard, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { operationalExportUrl } from "@/lib/api";
import { ExportMenu } from "@/components/exports/ExportMenu";
import { formatSaudiDate, formatSaudiDateTime } from "@/lib/datetime";
import { formatMoney, todayIso } from "@/lib/money";
import type { OperationalReportResponse, OperationalRow, ReportFilters, Patient, ImplantCaseWithImplants, Implant, ImplantStatus, Followup, FollowupType, Payment, ProstheticEventType, BoneGraftProcedure } from "@workspace/shared";
import { CASE_STATUSES, IMPLANT_STATUSES, FDI_SITES, FOLLOWUP_TYPES, PAYMENT_LABELS, PAYMENT_METHODS, PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS } from "@workspace/shared";
import { followupStatusClasses } from "@/components/followups/followup-utils";
import { useArchivePatient, usePatient, useUpdatePatient } from "@/hooks/use-patients";
import { useImplantCases, useCreateImplant, useUpdateImplantCase, useUpdateImplant, useArchiveImplant, useArchiveProstheticEvent, useArchiveBoneGraftProcedure, useImplantOptions } from "@/hooks/use-implant-cases";
import { useFollowups, useCreateFollowup, useUpdateFollowup, useAssignableUsers } from "@/hooks/use-followups";
import { useCreatePayment, useUpdatePayment, useVoidPayment, useCaseFinance } from "@/hooks/use-finance";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { InlineNewRecord } from "./InlineNewRecord";
import { ProstheticEventDialog } from "@/components/implants/ProstheticEventDialog";
import { BoneGraftProcedureDialog } from "@/components/implants/BoneGraftProcedureDialog";
import { ExpectedProstheticDateField } from "@/components/implants/ExpectedProstheticDateField";
import { FinalTotalDialog } from "@/components/finance/FinalTotalDialog";
import { OutcomeDialog } from "@/components/followups/OutcomeDialog";
import { CancelFollowupDialog } from "@/components/followups/CancelFollowupDialog";
import {
  OperationalDatePicker,
  OperationalDateTimeFields,
} from "./OperationalDatePicker";
import {
  ReportFiltersBar,
  type ReportFilterState,
} from "./ReportFiltersBar";
import { useTranslation } from "react-i18next";
import { useEnumTranslation } from "@/i18n/use-enum-translation";
import i18n from "@/i18n";
import { localizeErrorMessage } from "@/lib/localize-error";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PatientGroup {
  patientId: string;
  patientName: string;
  fileNumber: string;
  rows: OperationalRow[];
}

interface ProstheticEventContext {
  caseItem: ImplantCaseWithImplants;
  initialImplantId?: string;
  initialEventType?: ProstheticEventType;
  lockInitialEventType?: boolean;
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;
const SHOW_PROSTHETIC_EVENT_LOG = false;
const dashboardText = (key: string, options?: Record<string, unknown>) => {
  const operationalKey = `operations:dashboard.${key}`;
  return i18n.exists(operationalKey)
    ? i18n.t(operationalKey, options)
    : i18n.t(`guidance:dashboard.${key}`, options);
};
const NORMAL_IMPLANT_STATUS_PROGRESSION: readonly ImplantStatus[] = [
  "مزروعة",
  "مرحلة الالتئام",
  "جاهزة للتركيب",
  "تم تركيب مؤقت",
  "تم التركيب",
];
const IMPLANT_STATUS_PRIORITY: Record<string, number> = {
  "فاشلة": 1,
  "تحتاج إعادة": 2,
  "جاهزة للتركيب": 3,
  "مرحلة الالتئام": 4,
  "مزروعة": 5,
  "تم تركيب مؤقت": 6,
  "تم التركيب": 7,
  "تمت إعادة الزراعة": 8,
};

/* ------------------------------------------------------------------ */
/* Group rows by patient (preserves SQL order: newest case first)     */
/* ------------------------------------------------------------------ */

function groupByPatient(rows: OperationalRow[]): PatientGroup[] {
  const map = new Map<string, PatientGroup>();
  // rows already ordered by ic.created_at DESC from the server
  for (const row of rows) {
    let group = map.get(row.patientId);
    if (!group) {
      group = { patientId: row.patientId, patientName: row.patientName, fileNumber: row.fileNumber, rows: [] };
      map.set(row.patientId, group);
    }
    group.rows.push(row);
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* Summary helpers                                                     */
/* ------------------------------------------------------------------ */

function summaryImplantStatuses(rows: OperationalRow[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const status of rows[0]?.implantStatuses ?? []) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    ([a], [b]) =>
      (IMPLANT_STATUS_PRIORITY[a] ?? Number.MAX_SAFE_INTEGER) -
      (IMPLANT_STATUS_PRIORITY[b] ?? Number.MAX_SAFE_INTEGER),
  );
}

function summaryAdjunctProcedureTypes(rows: OperationalRow[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const procedureType of rows[0]?.adjunctProcedureTypes ?? []) {
    counts.set(procedureType, (counts.get(procedureType) ?? 0) + 1);
  }
  return [...counts.entries()];
}

function summaryDoctor(rows: OperationalRow[]): string {
  const doctors = [...new Set(rows.map((r) => r.treatingDoctor).filter(Boolean))];
  if (doctors.length === 1) return doctors[0]!;
  return doctors.length > 1 ? dashboardText("multiple") : "—";
}

function summaryImplantCount(rows: OperationalRow[]): number {
  return rows.reduce((s, r) => s + r.implantCount, 0);
}

function summarySystems(rows: OperationalRow[]): string[] {
  const all = rows.flatMap((r) => r.implantSystems);
  return [...new Set(all)];
}

function summaryNextFollowup(rows: OperationalRow[]): string | null {
  const dates = rows.map((r) => r.nextFollowupAt).filter(Boolean) as string[];
  if (dates.length === 0) return null;
  return dates.sort()[0] ?? null;
}

function summaryRemaining(rows: OperationalRow[]): number | null {
  if (!rows.some((r) => r.finance)) return null;
  return rows.reduce((s, r) => s + (r.finance?.remaining ?? 0), 0);
}

function summaryPaymentStatus(rows: OperationalRow[]): string | null {
  const statuses = [...new Set(rows.map((r) => r.finance?.paymentStatus).filter(Boolean))];
  if (statuses.length === 0) return null;
  if (statuses.length === 1) return statuses[0] ?? null;
  return dashboardText("multiple");
}

function hasOverdue(rows: OperationalRow[]): boolean {
  return rows.some((r) => r.isOverdue);
}
function hasReady(rows: OperationalRow[]): boolean {
  return rows.some((r) => r.isReady);
}

/* ------------------------------------------------------------------ */
/* Payment status badge colors                                         */
/* ------------------------------------------------------------------ */

function paymentStatusClass(status: string): string {
  if (status === "مدفوع بالكامل") return "bg-emerald-100 text-emerald-800";
  if (status === "لم يدفع") return "bg-red-100 text-red-800";
  if (status === "مدفوع جزئيًا") return "bg-amber-100 text-amber-800";
  if (status === "رصيد زائد") return "bg-blue-100 text-blue-800";
  return "bg-muted text-muted-foreground";
}

function installmentStatusClass(status: string): string {
  if (status === "مدفوع") return "bg-emerald-100 text-emerald-800";
  if (status === "مدفوع جزئيًا") return "bg-amber-100 text-amber-800";
  if (status === "متأخر") return "bg-red-100 text-red-800";
  if (status === "مستحق اليوم") return "bg-sky-100 text-sky-800";
  return "bg-muted text-muted-foreground";
}

function implantStatusClass(status: ImplantStatus): string {
  switch (status) {
    case "فاشلة":
    case "تحتاج إعادة":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "جاهزة للتركيب":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "مرحلة الالتئام":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "مزروعة":
      return "bg-teal-100 text-teal-800 border-teal-200";
    case "تم تركيب مؤقت":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "تم التركيب":
    case "تمت إعادة الزراعة":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function adjunctProcedureClass(procedureType: string): string {
  switch (procedureType) {
    case "زراعة عظم":
      return "bg-violet-100 text-violet-800 border-violet-200";
    case "رفع الجيب الفكي":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "إبعاد / نقل العصب السنخي السفلي":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function ClinicalSummaryBadges({ rows }: { rows: OperationalRow[] }) {
  const statuses = summaryImplantStatuses(rows);
  const adjunctProcedures = summaryAdjunctProcedureTypes(rows);
  if (statuses.length === 0 && adjunctProcedures.length === 0) return <>—</>;

  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map(([status, count]) => (
        <Badge
          key={status}
          className={`text-[10px] ${implantStatusClass(status as ImplantStatus)}`}
          title={count > 1 ? `${status} — ${count} زرعات` : status}
        >
          <span className="notranslate">
            {status}
            {count > 1 ? ` ×${count}` : ""}
          </span>
        </Badge>
      ))}
      {adjunctProcedures.map(([procedureType, count]) => (
        <Badge
          key={procedureType}
          className={`text-[10px] ${adjunctProcedureClass(procedureType)}`}
          title={count > 1 ? `${procedureType} — ${count} إجراءات` : procedureType}
        >
          <span className="notranslate">
            {procedureType}
            {count > 1 ? ` ×${count}` : ""}
          </span>
        </Badge>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline edit sub-components                                          */
/* ------------------------------------------------------------------ */

function ImplantStatusStepper({
  implant,
  patientId,
  onRequestProstheticDocumentation,
}: {
  implant: Implant;
  patientId: string;
  onRequestProstheticDocumentation: (eventType: ProstheticEventType) => void;
}) {
  const { t } = useTranslation("guidance");
  const { enumLabel } = useEnumTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const update = useUpdateImplant();
  const currentIndex = NORMAL_IMPLANT_STATUS_PROGRESSION.indexOf(
    implant.implantStatus,
  );
  const isInstallationStatus = Boolean(
    PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS[
      implant.implantStatus as keyof typeof PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS
    ],
  );
  const previousStatus =
    currentIndex > 0 && !isInstallationStatus
      ? NORMAL_IMPLANT_STATUS_PROGRESSION[currentIndex - 1]
      : undefined;
  const nextStatus =
    currentIndex >= 0 && currentIndex < NORMAL_IMPLANT_STATUS_PROGRESSION.length - 1
      ? NORMAL_IMPLANT_STATUS_PROGRESSION[currentIndex + 1]
      : undefined;

  const requestStatusChange = (next: ImplantStatus) => {
    if (next === implant.implantStatus || update.isPending) return;

    const eventType = PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS[
      next as keyof typeof PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS
    ];
    if (eventType) {
      onRequestProstheticDocumentation(eventType);
      return;
    }

    update.mutate(
      {
        id: implant.id,
        patientId,
        data: { implantStatus: next },
      },
      {
        onSuccess: () => {
          toast({ title: dashboardText("implantStatusUpdated") });
          void queryClient.invalidateQueries({
            queryKey: ["operational-report"],
          });
          void queryClient.invalidateQueries({ queryKey: ["statistics"] });
        },
        onError: (error) => {
          toast({
            title: t("dashboard.updateImplantStatusFailed"),
            description: localizeErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const explainProtectedPreviousStep = () => {
    toast({
      title: t("dashboard.protectedStatusTitle"),
      description: t("dashboard.protectedStatusDescription"),
      variant: "destructive",
    });
  };

  const busy = update.isPending;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`implant-status-stepper-${implant.id}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={dashboardText("previousStep")}
              disabled={busy || (!previousStatus && !isInstallationStatus)}
              onClick={() => {
                if (isInstallationStatus) {
                  explainProtectedPreviousStep();
                  return;
                }
                if (previousStatus) requestStatusChange(previousStatus);
              }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{dashboardText("previousStep")}</TooltipContent>
      </Tooltip>

      <Badge
        variant="outline"
        className={`h-7 max-w-[150px] truncate px-2 text-[10px] ${implantStatusClass(implant.implantStatus)}`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : enumLabel("implantStatus", implant.implantStatus)}
      </Badge>

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={dashboardText("nextStep")}
              disabled={busy || !nextStatus}
              onClick={() => nextStatus && requestStatusChange(nextStatus)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{dashboardText("nextStep")}</TooltipContent>
      </Tooltip>

    </div>
  );
}

function InlinePatientEdit({
  p,
  patientId,
  onDone,
}: {
  p: Patient;
  patientId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { enumLabel } = useEnumTranslation();
  const update = useUpdatePatient();
  const [fullName, setFullName] = useState(p.fullName);
  const [mobile, setMobile] = useState(p.mobileNumber ?? "");
  const [age, setAge] = useState(p.age != null ? String(p.age) : "");
  const [note, setNote] = useState(p.administrativeNote ?? "");

  const save = () => {
    update.mutate(
      {
        id: patientId,
        data: {
          fullName,
          mobileNumber: mobile || null,
          age: age ? parseInt(age, 10) : null,
          administrativeNote: note || null,
        },
      },
      {
        onSuccess: () => { toast({ title: dashboardText("patientUpdated") }); onDone(); },
        onError: (error) => { toast({ title: dashboardText("updateFailed"), description: localizeErrorMessage(error), variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("nameRequired")}</Label>
          <Input className="h-8 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("mobile")}</Label>
          <Input className="h-8 text-sm" dir="ltr" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("age")}</Label>
          <Input className="h-8 text-sm" type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">{dashboardText("administrativeNote")}</Label>
          <Textarea className="text-sm resize-none" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={update.isPending || !fullName.trim()} className="h-7 text-xs">
          {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={update.isPending} className="h-7 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

function InlineCaseEdit({
  c,
  patientId,
  onDone,
}: {
  c: ImplantCaseWithImplants;
  patientId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { enumLabel } = useEnumTranslation();
  const update = useUpdateImplantCase();
  const [caseStatus, setCaseStatus] = useState<string>(c.caseStatus);
  const [treatingDoctor, setTreatingDoctor] = useState(c.treatingDoctor);
  const [procedureDate, setProcedureDate] = useState(c.procedureDate ?? "");
  const [prosValue, setProsValue] = useState(c.prosValue ?? "");
  const [expectedDate, setExpectedDate] = useState(c.expectedProstheticDate ?? "");
  const [generalNote, setGeneralNote] = useState(c.generalNote ?? "");

  const save = () => {
    update.mutate(
      {
        id: c.id,
        patientId,
        data: {
          caseStatus: caseStatus as typeof CASE_STATUSES[number],
          treatingDoctor,
          procedureDate: procedureDate || null,
          prosValue: prosValue || null,
          expectedProstheticDate: expectedDate || null,
          generalNote: generalNote || null,
        },
      },
      {
        onSuccess: () => { toast({ title: dashboardText("caseUpdated") }); onDone(); },
        onError: (error) => { toast({ title: dashboardText("updateFailed"), description: localizeErrorMessage(error), variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("caseStatus")}</Label>
          <Select value={caseStatus} onValueChange={setCaseStatus}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CASE_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel("caseStatus", s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("treatingDoctor")}</Label>
          <Input className="h-8 text-sm" value={treatingDoctor} onChange={(e) => setTreatingDoctor(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("procedureDate")}</Label>
          <OperationalDatePicker value={procedureDate} onChange={setProcedureDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("prostheticDuration")}</Label>
          <Input className="h-8 text-sm" value={prosValue} onChange={(e) => setProsValue(e.target.value)} placeholder="3M" />
        </div>
        <ExpectedProstheticDateField
          procedureDate={procedureDate}
          expectedDate={expectedDate}
          onExpectedDateChange={setExpectedDate}
          compact
          className="col-span-2"
          idPrefix={`operational-${c.id}`}
        />
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">{dashboardText("note")}</Label>
          <Textarea className="text-sm resize-none" rows={2} value={generalNote} onChange={(e) => setGeneralNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={update.isPending || !treatingDoctor.trim()} className="h-7 text-xs">
          {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={update.isPending} className="h-7 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

function InlineImplantEdit({
  imp,
  patientId,
  onDone,
  onRequestProstheticDocumentation,
}: {
  imp: Implant;
  patientId: string;
  onDone: () => void;
  onRequestProstheticDocumentation: (eventType: ProstheticEventType) => void;
}) {
  const { toast } = useToast();
  const { enumLabel } = useEnumTranslation();
  const update = useUpdateImplant();
  const { data: implantOptions } = useImplantOptions();
  const [site, setSite] = useState(imp.site);
  const [system, setSystem] = useState(imp.system ?? "");
  const [diameter, setDiameter] = useState(imp.diameter != null ? String(imp.diameter) : "");
  const [length, setLength] = useState(imp.length != null ? String(imp.length) : "");
  const [qValue, setQValue] = useState(imp.qValue ?? "");
  const [formerValue, setFormerValue] = useState(imp.formerValue ?? "");
  const [graftValue, setGraftValue] = useState(imp.graftValue ?? "");
  const [implantStatus, setImplantStatus] = useState(imp.implantStatus);

  const handleStatusChange = (nextStatus: ImplantStatus) => {
    const eventType = PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS[
      nextStatus as keyof typeof PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS
    ];
    if (eventType && nextStatus !== imp.implantStatus) {
      setImplantStatus(imp.implantStatus);
      onRequestProstheticDocumentation(eventType);
      return;
    }
    setImplantStatus(nextStatus);
  };

  const save = () => {
    update.mutate(
      {
        id: imp.id,
        patientId,
        data: {
          site: site as typeof FDI_SITES[number],
          system: system || null,
          diameter: diameter ? parseFloat(diameter) : null,
          length: length ? parseFloat(length) : null,
          qValue: qValue || null,
          formerValue: formerValue || null,
          graftValue: graftValue || null,
          implantStatus: implantStatus as typeof IMPLANT_STATUSES[number],
        },
      },
      {
        onSuccess: () => { toast({ title: dashboardText("implantUpdated") }); onDone(); },
        onError: (error) => { toast({ title: dashboardText("updateFailed"), description: localizeErrorMessage(error), variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("siteFdi")}</Label>
          <Select dir="ltr" value={site} onValueChange={(value) => setSite(value as typeof FDI_SITES[number])}>
            <SelectTrigger className="h-7 text-xs text-start"><SelectValue /></SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{dashboardText("upperJaw")}</div>
              {["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{dashboardText("lowerJaw")}</div>
              {["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("system")}</Label>
          <Select value={system || "__none__"} onValueChange={(v) => setSystem(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.systems ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("diameter")}</Label>
          <Input className="h-7 text-xs" type="number" step="0.1" value={diameter} onChange={(e) => setDiameter(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("length")}</Label>
          <Input className="h-7 text-xs" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Q</Label>
          <Select value={qValue || "__none__"} onValueChange={(v) => setQValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.qValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Former</Label>
          <Select value={formerValue || "__none__"} onValueChange={(v) => setFormerValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.formerValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Graft</Label>
          <Select value={graftValue || "__none__"} onValueChange={(v) => setGraftValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.graftValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("status")}</Label>
          <Select value={implantStatus} onValueChange={(v) => handleStatusChange(v as ImplantStatus)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {IMPLANT_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel("implantStatus", s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={update.isPending} className="h-7 text-xs">
          {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={update.isPending} className="h-7 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline Quick-Action Forms                                           */
/* ------------------------------------------------------------------ */

/** Case selector used by payment + followup forms when there are multiple cases */
function CaseSelector({
  cases,
  selected,
  onSelect,
}: {
  cases: ImplantCaseWithImplants[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { enumLabel } = useEnumTranslation();
  if (cases.length <= 1) return null;
  return (
    <div className="space-y-1">
      <Label className="text-xs">{dashboardText("caseRequired")}</Label>
      <Select value={selected} onValueChange={onSelect}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={dashboardText("selectCase")} /></SelectTrigger>
        <SelectContent>
          {cases.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {enumLabel("caseStatus", c.caseStatus)} — {c.treatingDoctor}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InlineAddImplant({
  patientId,
  cases,
  onDone,
}: {
  patientId: string;
  cases: ImplantCaseWithImplants[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateImplant();
  const { data: implantOptions } = useImplantOptions();
  const qc = useQueryClient();

  const defaultCaseId = cases[0]?.id ?? "";
  const [caseId, setCaseId] = useState(defaultCaseId);
  const [site, setSite] = useState<typeof FDI_SITES[number] | "">("");
  const [system, setSystem] = useState("");
  const [diameter, setDiameter] = useState("");
  const [length, setLength] = useState("");
  const [qValue, setQValue] = useState("");
  const [formerValue, setFormerValue] = useState("");
  const [graftValue, setGraftValue] = useState("");
  const [graftProcedureType, setGraftProcedureType] = useState("");
  const [graftNote, setGraftNote] = useState("");
  const [implantStatus, setImplantStatus] = useState<ImplantStatus>("مزروعة");
  const [implantNote, setImplantNote] = useState("");

  const save = () => {
    if (!site || !caseId) return;
    create.mutate(
      {
        caseId,
        patientId,
        data: {
          site: site as typeof FDI_SITES[number],
          system: system || null,
          diameter: diameter ? parseFloat(diameter) : null,
          length: length ? parseFloat(length) : null,
          qValue: qValue || null,
          formerValue: formerValue || null,
          graftValue: graftValue || null,
          graftProcedureType: graftProcedureType || null,
          graftNote: graftNote || null,
          procedureTags: [],
          implantStatus,
          implantNote: implantNote || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: dashboardText("implantAdded") });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          onDone();
        },
        onError: (error) => { toast({ title: dashboardText("saveFailed"), description: localizeErrorMessage(error), variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-semibold text-muted-foreground">{dashboardText("addImplant")}</p>
      <CaseSelector cases={cases} selected={caseId} onSelect={setCaseId} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Site */}
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("siteFdiRequired")}</Label>
          <Select dir="ltr" value={site} onValueChange={(value) => setSite(value as typeof FDI_SITES[number])}>
            <SelectTrigger className="h-8 text-sm text-start"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{dashboardText("upperJaw")}</div>
              {["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{dashboardText("lowerJaw")}</div>
              {["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* System */}
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("system")}</Label>
          <Select value={system || "__none__"} onValueChange={(v) => setSystem(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.systems ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Diameter */}
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("diameter")}</Label>
          <Input className="h-8 text-sm" type="number" step="0.1" min={0} value={diameter} onChange={(e) => setDiameter(e.target.value)} />
        </div>
        {/* Length */}
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("length")}</Label>
          <Input className="h-8 text-sm" type="number" step="0.1" min={0} value={length} onChange={(e) => setLength(e.target.value)} />
        </div>
        {/* Q */}
        <div className="space-y-1">
          <Label className="text-xs">Q</Label>
          <Select value={qValue || "__none__"} onValueChange={(v) => setQValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.qValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Former */}
        <div className="space-y-1">
          <Label className="text-xs">Former</Label>
          <Select value={formerValue || "__none__"} onValueChange={(v) => setFormerValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.formerValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Graft */}
        <div className="space-y-1">
          <Label className="text-xs">Graft</Label>
          <Select value={graftValue || "__none__"} onValueChange={(v) => setGraftValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.graftValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Implant Status */}
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("implantStatus")}</Label>
          <Select value={implantStatus} onValueChange={(value) => setImplantStatus(value as ImplantStatus)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {IMPLANT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Graft procedure type */}
        {graftValue && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">{dashboardText("graftProcedureType")}</Label>
              <Input className="h-8 text-sm" value={graftProcedureType} onChange={(e) => setGraftProcedureType(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs">{dashboardText("graftNote")}</Label>
              <Input className="h-8 text-sm" value={graftNote} onChange={(e) => setGraftNote(e.target.value)} />
            </div>
          </>
        )}
        {/* Implant note — full width */}
        <div className="col-span-2 sm:col-span-4 space-y-1">
          <Label className="text-xs">{dashboardText("note")}</Label>
          <Textarea className="text-sm resize-none" rows={2} value={implantNote} onChange={(e) => setImplantNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={create.isPending || !site || !caseId} className="h-8 text-xs">
          {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ الزرعة
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={create.isPending} className="h-8 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

function InlineRecordPayment({
  cases,
  onDone,
}: {
  cases: ImplantCaseWithImplants[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const create = useCreatePayment();
  const qc = useQueryClient();

  const defaultCaseId = cases[0]?.id ?? "";
  const [caseId, setCaseId] = useState(defaultCaseId);
  const [amount, setAmount] = useState("");
  const [paymentLabel, setPaymentLabel] = useState<typeof PAYMENT_LABELS[number]>(PAYMENT_LABELS[0]);
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>(PAYMENT_METHODS[1]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");

  const save = () => {
    if (!amount || !caseId) return;
    create.mutate(
      {
        caseId,
        data: {
          amount: parseFloat(amount),
          installmentId: null,
          paymentLabel,
          paymentMethod,
          paymentDate: paymentDate,
          referenceNumber: referenceNumber || null,
          note: note || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: dashboardText("paymentRecorded") });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          onDone();
        },
        onError: (error) => { toast({ title: dashboardText("saveFailed"), description: localizeErrorMessage(error), variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-semibold text-muted-foreground">{dashboardText("recordPayment")}</p>
      <CaseSelector cases={cases} selected={caseId} onSelect={setCaseId} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("amountSarRequired")}</Label>
          <Input className="h-8 text-sm" type="number" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("paymentDescription")}</Label>
          <Select value={paymentLabel} onValueChange={(value) => setPaymentLabel(value as typeof PAYMENT_LABELS[number])}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("paymentMethod")}</Label>
          <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof PAYMENT_METHODS[number])}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("paymentDate")}</Label>
          <OperationalDatePicker value={paymentDate} onChange={setPaymentDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("referenceNumber")}</Label>
          <Input className="h-8 text-sm" dir="ltr" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder={dashboardText("optional")} />
        </div>
        <div className="col-span-2 sm:col-span-3 space-y-1">
          <Label className="text-xs">{dashboardText("note")}</Label>
          <Textarea className="text-sm resize-none" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={create.isPending || !amount || !caseId} className="h-8 text-xs">
          {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ الدفعة
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={create.isPending} className="h-8 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

function InlineAddFollowup({
  patientId,
  cases,
  onDone,
}: {
  patientId: string;
  cases: ImplantCaseWithImplants[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { enumLabel } = useEnumTranslation();
  const create = useCreateFollowup(patientId);
  const { user } = useAuth();
  const qc = useQueryClient();

  const defaultCaseId = cases[0]?.id ?? "";
  const [caseId, setCaseId] = useState(defaultCaseId);
  const [followupType, setFollowupType] = useState<FollowupType>(FOLLOWUP_TYPES[0]);
  // datetime-local value: YYYY-MM-DDTHH:MM (no seconds)
  const [scheduledAt, setScheduledAt] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  });
  const [requiresContact, setRequiresContact] = useState(false);
  const [contactDueAt, setContactDueAt] = useState("");
  const [nextAppointmentAt, setNextAppointmentAt] = useState("");
  const [note, setNote] = useState("");

  const save = () => {
    if (!scheduledAt || !caseId) return;
    create.mutate(
      {
        caseId,
        input: {
          followupType,
          scheduledAt,
          requiresContact,
          contactDueAt: requiresContact && contactDueAt ? contactDueAt : null,
          nextAppointmentAt: nextAppointmentAt || null,
          note: note || null,
          assignedUserId: user?.id ?? null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: dashboardText("followupAdded") });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          onDone();
        },
        onError: (error) => { toast({ title: dashboardText("saveFailed"), description: localizeErrorMessage(error), variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-semibold text-muted-foreground">{dashboardText("addFollowup")}</p>
      <CaseSelector cases={cases} selected={caseId} onSelect={setCaseId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("followupTypeRequired")}</Label>
          <Select value={followupType} onValueChange={(value) => setFollowupType(value as FollowupType)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FOLLOWUP_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {enumLabel("followupType", type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <OperationalDateTimeFields
          value={scheduledAt}
          onChange={setScheduledAt}
          required
          label={dashboardText("followupAppointment")}
        />
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("assignee")}</Label>
          <div
            className="flex h-8 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
            data-testid="inline-followup-current-assignee"
          >
            {user?.fullName ?? dashboardText("currentUser")}
          </div>
        </div>
        <OperationalDateTimeFields
          value={nextAppointmentAt}
          onChange={setNextAppointmentAt}
          label={dashboardText("nextAppointment")}
        />
        <div className="col-span-1 sm:col-span-2 flex items-center gap-2 pt-1">
          <Checkbox
            id="qe-requires-contact"
            checked={requiresContact}
            onCheckedChange={(v) => setRequiresContact(!!v)}
          />
          <Label htmlFor="qe-requires-contact" className="text-xs cursor-pointer">{dashboardText("requiresContact")}</Label>
        </div>
        {requiresContact && (
          <div className="space-y-1">
            <Label className="text-xs">{dashboardText("contactDueDate")}</Label>
            <OperationalDatePicker value={contactDueAt} onChange={setContactDueAt} />
          </div>
        )}
        <div className="col-span-1 sm:col-span-2 space-y-1">
          <Label className="text-xs">{dashboardText("note")}</Label>
          <Textarea className="text-sm resize-none" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={create.isPending || !scheduledAt || !caseId} className="h-8 text-xs">
          {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ المتابعة
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={create.isPending} className="h-8 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

function riyadhDateTimeInput(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)).replace(" ", "T");
}

function riyadhDateInput(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function InlineFollowupEdit({
  followup,
  patientId,
  onDone,
}: {
  followup: Followup;
  patientId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { enumLabel } = useEnumTranslation();
  const update = useUpdateFollowup(patientId);
  const { data: assignableUsers } = useAssignableUsers();
  const [followupType, setFollowupType] = useState<FollowupType>(
    followup.followupType as FollowupType,
  );
  const [scheduledAt, setScheduledAt] = useState(() => riyadhDateTimeInput(followup.scheduledAt));
  const [requiresContact, setRequiresContact] = useState(followup.requiresContact);
  const [contactDueAt, setContactDueAt] = useState(() => riyadhDateInput(followup.contactDueAt));
  const [nextAppointmentAt, setNextAppointmentAt] = useState(() => riyadhDateTimeInput(followup.nextAppointmentAt));
  const [assignedUserId, setAssignedUserId] = useState(followup.assignedUserId ?? "");
  const [note, setNote] = useState(followup.note ?? "");

  const save = () => {
    if (!scheduledAt) return;
    update.mutate(
      {
        id: followup.id,
        input: {
          followupType,
          scheduledAt,
          requiresContact,
          contactDueAt: requiresContact && contactDueAt ? contactDueAt : null,
          nextAppointmentAt: nextAppointmentAt || null,
          assignedUserId: assignedUserId || null,
          note: note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: dashboardText("followupUpdated") });
          onDone();
        },
        onError: (error) => {
          toast({
            title: dashboardText("updateFollowupFailed"),
            description: localizeErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("followupType")}</Label>
          <Select value={followupType} onValueChange={(value) => setFollowupType(value as FollowupType)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FOLLOWUP_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {enumLabel("followupType", type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <OperationalDateTimeFields
          value={scheduledAt}
          onChange={setScheduledAt}
        />
        {assignableUsers && assignableUsers.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">{dashboardText("assignee")}</Label>
            <Select value={assignedUserId || "__none__"} onValueChange={(value) => setAssignedUserId(value === "__none__" ? "" : value)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {assignableUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <OperationalDateTimeFields
          value={nextAppointmentAt}
          onChange={setNextAppointmentAt}
        />
        <div className="flex items-center gap-2 pt-5">
          <Checkbox id={`edit-contact-${followup.id}`} checked={requiresContact} onCheckedChange={(value) => setRequiresContact(Boolean(value))} />
          <Label htmlFor={`edit-contact-${followup.id}`} className="text-xs cursor-pointer">{dashboardText("requiresContact")}</Label>
        </div>
        {requiresContact && (
          <div className="space-y-1">
            <Label className="text-xs">{dashboardText("contactDueDate")}</Label>
            <OperationalDatePicker value={contactDueAt} onChange={setContactDueAt} />
          </div>
        )}
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">{dashboardText("note")}</Label>
          <Textarea className="text-sm resize-none" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={update.isPending || !scheduledAt} className="h-8 text-xs">
          {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={update.isPending} className="h-8 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline Payment Edit                                                 */
/* ------------------------------------------------------------------ */

function InlinePaymentEdit({
  payment,
  caseId,
  onDone,
}: {
  payment: Payment;
  caseId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdatePayment();

  const [amount, setAmount] = useState(String(payment.amount));
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate ?? "");
  const [paymentLabel, setPaymentLabel] = useState<typeof PAYMENT_LABELS[number]>(
    (payment.paymentLabel as typeof PAYMENT_LABELS[number]) ?? PAYMENT_LABELS[0],
  );
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>(
    (payment.paymentMethod as typeof PAYMENT_METHODS[number]) ?? PAYMENT_METHODS[0],
  );
  const [referenceNumber, setReferenceNumber] = useState(payment.referenceNumber ?? "");
  const [note, setNote] = useState(payment.note ?? "");

  const save = () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0 || !paymentDate) return;
    update.mutate(
      {
        id: payment.id,
        caseId,
        data: {
          amount: parsed,
          paymentDate,
          paymentLabel,
          paymentMethod,
          referenceNumber: referenceNumber.trim() || null,
          note: note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: dashboardText("paymentUpdated") });
          onDone();
        },
        onError: (error) => {
          toast({
            title: dashboardText("updatePaymentFailed"),
            description: localizeErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("amountSarRequired")}</Label>
          <Input className="h-8 text-sm" type="number" step="0.01" min={0.01} value={amount}
            onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("paymentDateRequired")}</Label>
          <OperationalDatePicker value={paymentDate} onChange={setPaymentDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("paymentDescription")}</Label>
          <Select value={paymentLabel} onValueChange={(v) => setPaymentLabel(v as typeof PAYMENT_LABELS[number])}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("paymentMethod")}</Label>
          <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof PAYMENT_METHODS[number])}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{dashboardText("referenceNumber")}</Label>
          <Input className="h-8 text-sm" value={referenceNumber}
            onChange={(event) => setReferenceNumber(event.target.value)} placeholder={dashboardText("optional")} />
        </div>
        <div className="sm:col-span-3 space-y-1">
          <Label className="text-xs">{dashboardText("note")}</Label>
          <Input className="h-8 text-sm" value={note}
            onChange={(event) => setNote(event.target.value)} placeholder={dashboardText("optional")} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save}
          disabled={update.isPending || !amount || !paymentDate}
          className="h-8 text-xs">
          {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}
          disabled={update.isPending} className="h-8 text-xs">
          إلغاء
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Case Payments Section (per-case payment list with edit/void)        */
/* ------------------------------------------------------------------ */

function CasePaymentsSection({
  caseId,
  canManage,
}: {
  caseId: string;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const financeQuery = useCaseFinance(caseId, true);
  const voidPayment = useVoidPayment();
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const payments = financeQuery.data?.payments ?? [];

  const startVoid = (id: string) => { setVoidingPaymentId(id); setVoidReason(""); setEditingPaymentId(null); };
  const startEdit = (id: string) => { setEditingPaymentId(id); setVoidingPaymentId(null); };

  const confirmVoid = (payment: Payment) => {
    if (!voidReason.trim()) return;
    voidPayment.mutate(
      { id: payment.id, caseId, data: { reason: voidReason.trim() } },
      {
        onSuccess: () => {
          toast({ title: dashboardText("paymentVoided") });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          setVoidingPaymentId(null);
          setVoidReason("");
        },
        onError: (error) => {
          toast({
            title: dashboardText("voidPaymentFailed"),
            description: localizeErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  if (financeQuery.isLoading) {
    return <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> جارٍ التحميل...</div>;
  }
  if (payments.length === 0) {
    return <p className="text-xs text-muted-foreground py-1">{dashboardText("noPayments")}</p>;
  }

  return (
    <div className="space-y-2 mt-2 border-t border-border/60 pt-2">
      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
        <CreditCard className="h-3 w-3" />
        الدفعات ({payments.length})
      </p>
      {payments.map((payment) => (
        <div key={payment.id} className={`rounded-lg border text-xs p-2.5 space-y-2 ${payment.isVoided ? "border-destructive/30 bg-destructive/5 opacity-70" : "border-border/70 bg-background/60"}`}>
          {editingPaymentId === payment.id ? (
            <InlinePaymentEdit payment={payment} caseId={caseId} onDone={() => setEditingPaymentId(null)} />
          ) : voidingPaymentId === payment.id ? (
            <div className="space-y-2">
              <p className="font-medium text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                إلغاء الدفعة — {formatMoney(payment.amount)} ({payment.paymentDate})
              </p>
              <div className="space-y-1">
                <Label className="text-xs">{dashboardText("voidReasonRequired")}</Label>
                <Input className="h-8 text-sm" value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  placeholder={dashboardText("voidReasonPlaceholder")} autoFocus />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="destructive"
                  onClick={() => confirmVoid(payment)}
                  disabled={voidPayment.isPending || !voidReason.trim()}
                  className="h-7 text-xs">
                  {voidPayment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  تأكيد إلغاء الدفعة
                </Button>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setVoidingPaymentId(null)}
                  disabled={voidPayment.isPending}
                  className="h-7 text-xs">{dashboardText("back")}</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">{formatMoney(payment.amount)}</span>
                  {payment.isVoided && (
                    <Badge variant="destructive" className="text-[10px]">{dashboardText("voided")}</Badge>
                  )}
                </div>
                {!payment.isVoided && canManage && (
                  <div className="flex gap-1.5">
                    <Button type="button" variant="ghost" size="sm"
                      className="h-6 px-2 text-[11px] gap-1 text-muted-foreground"
                      onClick={() => startEdit(payment.id)}>
                      <Pencil className="h-3 w-3" /> تعديل
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                      className="h-6 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
                      onClick={() => startVoid(payment.id)}>
                      <X className="h-3 w-3" /> إلغاء الدفعة
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{dashboardText("date")}</span>
                  <span>{formatSaudiDate(payment.paymentDate ?? "")}</span>
                </div>
                {payment.paymentLabel && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{dashboardText("description")}</span>
                    <span>{payment.paymentLabel}</span>
                  </div>
                )}
                {payment.paymentMethod && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{dashboardText("method")}</span>
                    <span>{payment.paymentMethod}</span>
                  </div>
                )}
                {payment.referenceNumber && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{dashboardText("reference")}</span>
                    <span dir="ltr">{payment.referenceNumber}</span>
                  </div>
                )}
                {payment.isVoided && payment.voidReason && (
                  <div className="col-span-2 flex justify-between gap-2">
                    <span className="text-muted-foreground">{dashboardText("voidReason")}</span>
                    <span className="text-destructive">{payment.voidReason}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function OperationalFinanceSummary({
  row,
  canManage,
  canRecord,
}: {
  row: OperationalRow;
  canManage: boolean;
  canRecord: boolean;
}) {
  const { enumLabel } = useEnumTranslation();
  const financeQuery = useCaseFinance(row.caseId, true);
  const [finalTotalOpen, setFinalTotalOpen] = useState(false);
  const summary = financeQuery.data?.summary;
  const installmentPlan = financeQuery.data?.installmentPlan;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/70 bg-muted/35 p-2.5">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[11px] text-muted-foreground">{dashboardText("total")}</p>
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground"
                onClick={() => setFinalTotalOpen(true)}
                disabled={!summary}
                data-testid={`button-edit-final-total-${row.caseId}`}
              >
                <Pencil className="h-3 w-3" />
                تعديل
              </Button>
            )}
          </div>
          <p className="mt-1 text-base font-bold tabular-nums">{formatMoney(row.finance!.finalTotal)}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/35 p-2.5">
          <p className="text-[11px] text-muted-foreground">{dashboardText("paid")}</p>
          <p className="mt-1 text-base font-bold tabular-nums">{formatMoney(row.finance!.paid)}</p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <p className="text-[11px] text-muted-foreground">{dashboardText("remaining")}</p>
          <p className="mt-1 text-base font-bold tabular-nums text-primary">{formatMoney(row.finance!.remaining)}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/35 p-2.5">
          <p className="text-[11px] text-muted-foreground">{dashboardText("paymentStatus")}</p>
          <Badge className={`mt-1 text-[10px] ${paymentStatusClass(row.finance!.paymentStatus)}`}>
            {enumLabel("paymentStatus", row.finance!.paymentStatus)}
          </Badge>
        </div>
      </div>
      {installmentPlan ? (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5" data-testid={`operational-installment-plan-${row.caseId}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{dashboardText("paymentBreakdown")}</p>
            <span className="text-[11px] text-muted-foreground">
              {installmentPlan.installmentCount} دفعات — {formatMoney(installmentPlan.totalAmount)}
            </span>
          </div>
          <div className="space-y-1.5">
            {installmentPlan.installments.map((installment) => (
              <OperationalInstallmentRow
                key={installment.id}
                installment={installment}
                caseId={row.caseId}
                canRecord={canRecord}
              />
            ))}
          </div>
        </div>
      ) : null}
      {summary && finalTotalOpen && (
        <FinalTotalDialog
          open={finalTotalOpen}
          onOpenChange={setFinalTotalOpen}
          caseId={row.caseId}
          currentFinalTotal={summary.finalTotal}
          chargesTotal={summary.chargesTotal}
          discountsTotal={summary.discountsTotal}
        />
      )}
    </>
  );
}

function OperationalInstallmentRow({
  installment,
  caseId,
  canRecord,
}: {
  installment: NonNullable<NonNullable<ReturnType<typeof useCaseFinance>["data"]>["installmentPlan"]>["installments"][number];
  caseId: string;
  canRecord: boolean;
}) {
  const { toast } = useToast();
  const { enumLabel } = useEnumTranslation();
  const createPayment = useCreatePayment();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("شبكة");
  const [error, setError] = useState<string | null>(null);
  const isPaid = installment.outstanding <= 0;

  const openPayment = () => {
    setAmount(String(Math.max(0, installment.outstanding)));
    setPaymentDate(todayIso());
    setPaymentMethod("شبكة");
    setError(null);
    setPaying(true);
  };

  const submitPayment = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > installment.outstanding) {
      setError(dashboardText("installmentAmountInvalid"));
      return;
    }
    createPayment.mutate(
      {
        caseId,
        data: {
          amount: Math.round(value * 100) / 100,
          paymentDate,
          paymentLabel: "دفعة إضافية",
          paymentMethod,
          referenceNumber: null,
          note: `قسط رقم ${installment.sequence}`,
          installmentId: installment.id,
        },
      },
      {
        onSuccess: () => {
          toast({ title: dashboardText("installmentPaymentRecorded") });
          setPaying(false);
        },
        onError: (err) => {
          toast({
            title: dashboardText("saveFailed"),
            description: localizeErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div
      className="rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[11px]"
      data-testid={`operational-installment-${installment.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
          {installment.sequence}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{formatSaudiDate(installment.dueDate)}</p>
          <p className="text-muted-foreground">
            مجدول {formatMoney(installment.amount)} — مسدد {formatMoney(installment.paidAmount)}
          </p>
        </div>
        <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] ${installmentStatusClass(installment.status)}`}>
          {enumLabel("installmentStatus", installment.status)}
        </span>
        {!isPaid && canRecord ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px] gap-1"
            onClick={openPayment}
            data-testid={`button-pay-operational-installment-${installment.id}`}
          >
            <Check className="h-3 w-3" />
            تم الدفع
          </Button>
        ) : isPaid ? (
          <Check className="h-4 w-4 text-emerald-600" aria-label={dashboardText("paid")} />
        ) : null}
      </div>
      {paying ? (
        <div className="mt-2 grid items-end gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-4" data-testid={`form-pay-operational-installment-${installment.id}`}>
          <div className="space-y-1">
            <Label className="text-[10px]">{dashboardText("amount")}</Label>
            <Input
              type="number"
              min={0.01}
              max={installment.outstanding}
              step="0.01"
              value={amount}
              onChange={(event) => { setAmount(event.target.value); setError(null); }}
              className="h-7 text-xs"
              data-testid={`input-pay-operational-installment-${installment.id}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">{dashboardText("date")}</Label>
            <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">{dashboardText("method")}</Label>
            <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as (typeof PAYMENT_METHODS)[number])}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{enumLabel("paymentMethod", method)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1">
            <Button type="button" size="sm" className="h-7 text-[10px]" onClick={submitPayment} disabled={createPayment.isPending || !paymentDate}>
              {createPayment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : dashboardText("save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setPaying(false)}>
              إلغاء
            </Button>
          </div>
          {error ? <p className="text-[10px] text-destructive sm:col-span-4">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Expanded Patient Detail                                             */
/* ------------------------------------------------------------------ */

function PatientExpandedRow({
  group,
  showFinance,
}: {
  group: PatientGroup;
  showFinance: boolean;
}) {
  const { t } = useTranslation("operations");
  const { user } = useAuth();
  const { enumLabel } = useEnumTranslation();
  const canRecordPayments = user?.role === "ADMIN" || user?.canRecordPayments;
  const canManageFinancials = user?.role === "ADMIN" || (user?.role === "DOCTOR" && user?.canViewFinancials);
  const canDeleteRows = user?.role === "ADMIN";
  const canArchiveProstheticEvents = user?.role === "ADMIN" || user?.role === "DOCTOR";

  const patient = usePatient(group.patientId);
  const casesQuery = useImplantCases(group.patientId);
  const followupsQuery = useFollowups(group.patientId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const archiveImplant = useArchiveImplant();
  const archiveProstheticEvent = useArchiveProstheticEvent();
  const archiveBoneGraftProcedure = useArchiveBoneGraftProcedure();
  const archivePatient = useArchivePatient();

  // Inline edit state — one section at a time
  const [editingPatient, setEditingPatient] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingImplantId, setEditingImplantId] = useState<string | null>(null);
  const [editingFollowupId, setEditingFollowupId] = useState<string | null>(null);
  // Destructive confirmations
  const [confirmArchiveImplantId, setConfirmArchiveImplantId] = useState<string | null>(null);
  const [confirmArchivePatient, setConfirmArchivePatient] = useState(false);
  const [confirmArchiveProstheticEventId, setConfirmArchiveProstheticEventId] = useState<string | null>(null);
  const [statusFollowup, setStatusFollowup] = useState<Followup | null>(null);
  const [cancelFollowup, setCancelFollowup] = useState<Followup | null>(null);
  // Inline quick-action state — one form open at a time
  type QuickAction = "implant" | "payment" | "followup";
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null);
  const [now] = useState(() => Date.now());
  const [prostheticEventContext, setProstheticEventContext] = useState<ProstheticEventContext | null>(null);
  const [boneGraftContext, setBoneGraftContext] = useState<{ caseItem: ImplantCaseWithImplants; procedure?: BoneGraftProcedure | null } | null>(null);
  const [confirmArchiveBoneGraftProcedureId, setConfirmArchiveBoneGraftProcedureId] = useState<string | null>(null);

  const startEditPatient = () => { setEditingPatient(true); setEditingCaseId(null); setEditingImplantId(null); setEditingFollowupId(null); setConfirmArchiveImplantId(null); setStatusFollowup(null); setCancelFollowup(null); };
  const startEditCase = (id: string) => { setEditingCaseId(id); setEditingPatient(false); setEditingImplantId(null); setEditingFollowupId(null); setConfirmArchiveImplantId(null); setConfirmArchiveProstheticEventId(null); setStatusFollowup(null); setCancelFollowup(null); setProstheticEventContext(null); };
  const startEditImplant = (id: string) => { setEditingImplantId(id); setEditingPatient(false); setEditingCaseId(null); setEditingFollowupId(null); setConfirmArchiveImplantId(null); setStatusFollowup(null); setCancelFollowup(null); };
  const startEditFollowup = (id: string) => { setEditingFollowupId(id); setEditingPatient(false); setEditingCaseId(null); setEditingImplantId(null); setConfirmArchiveImplantId(null); setStatusFollowup(null); setCancelFollowup(null); };

  const doArchiveImplant = (imp: Implant) => {
    archiveImplant.mutate(
      { id: imp.id, patientId: group.patientId },
      {
        onSuccess: () => {
          toast({ title: t("dashboard.implantArchived") });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          setConfirmArchiveImplantId(null);
        },
        onError: (error) => {
          toast({
            title: dashboardText("archiveImplantFailed"),
            description: localizeErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const doArchiveProstheticEvent = (eventId: string) => {
    archiveProstheticEvent.mutate(
      { id: eventId, patientId: group.patientId },
      {
        onSuccess: () => {
          toast({ title: t("dashboard.prostheticEventArchived") });
          setConfirmArchiveProstheticEventId(null);
        },
        onError: (error) => {
          toast({
            title: dashboardText("archiveProstheticFailed"),
            description: localizeErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const doArchiveBoneGraftProcedure = (procedureId: string) => {
    archiveBoneGraftProcedure.mutate(
      { id: procedureId, patientId: group.patientId },
      {
        onSuccess: () => {
          toast({ title: t("dashboard.adjunctProcedureArchived") });
          setConfirmArchiveBoneGraftProcedureId(null);
        },
        onError: (error) =>
          toast({
            title: dashboardText("archiveAdjunctProcedureFailed"),
            description: localizeErrorMessage(error),
            variant: "destructive",
          }),
      },
    );
  };

  const doArchivePatient = () => {
    archivePatient.mutate(group.patientId, {
      onSuccess: () => {
        toast({ title: t("dashboard.patientRowArchived") });
        void qc.invalidateQueries({ queryKey: ["operational-report"] });
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
        void qc.invalidateQueries({ queryKey: ["statistics"] });
        setConfirmArchivePatient(false);
      },
      onError: (error) => {
        toast({
          title: dashboardText("archivePatientFailed"),
          description: localizeErrorMessage(error),
          variant: "destructive",
        });
      },
    });
  };

  const toggleAction = (action: QuickAction) =>
    setActiveAction((prev) => (prev === action ? null : action));

  const allCases = casesQuery.data?.items ?? [];
  const activeCases = allCases.filter((c) => c.status === "active");
  const allFollowups = followupsQuery.data ?? [];

  const isLoading = patient.isLoading || casesQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const p = patient.data?.patient;
  const displayedFollowups = allFollowups.sort((a, b) => {
    const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    const aPriority = a.followupStatus === "ملغاة"
      ? 3
      : a.followupStatus === "مجدولة"
      ? (aTime >= now ? 0 : 1)
      : 2;
    const bPriority = b.followupStatus === "ملغاة"
      ? 3
      : b.followupStatus === "مجدولة"
      ? (bTime >= now ? 0 : 1)
      : 2;
    return aPriority - bPriority || aTime - bTime;
  });

  return (
    <div
      className="p-4 md:p-6 bg-muted/30 border-t border-border space-y-4"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* A — بيانات المريض */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              {t("dashboard.patientInformation")}
            </h4>
            {!editingPatient && (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground" onClick={startEditPatient}>
                <Pencil className="h-3 w-3" /> {t("dashboard.edit")}
              </Button>
            )}
          </div>
          {editingPatient && p ? (
            <InlinePatientEdit p={p} patientId={group.patientId} onDone={() => setEditingPatient(false)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted/45 px-3 py-2">
                <p className="text-[11px] text-muted-foreground mb-0.5">{t("dashboard.name")}</p>
                <p className="font-semibold notranslate truncate">{p?.fullName ?? group.patientName}</p>
              </div>
              <div className="rounded-lg bg-muted/45 px-3 py-2">
                <p className="text-[11px] text-muted-foreground mb-0.5">{t("dashboard.fileNumber")}</p>
                <p dir="ltr" className="font-medium">{group.fileNumber}</p>
              </div>
              {p?.mobileNumber && (
                <div className="rounded-lg bg-muted/45 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground mb-0.5">{t("dashboard.mobile")}</p>
                  <p dir="ltr" className="font-medium notranslate">{p.mobileNumber}</p>
                </div>
              )}
              {p?.age != null && (
                <div className="rounded-lg bg-muted/45 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground mb-0.5">{t("dashboard.age")}</p>
                  <p className="font-medium">{p.age}</p>
                </div>
              )}
              {p?.createdAt && (
                <div className="rounded-lg bg-muted/45 px-3 py-2 sm:col-span-2">
                  <p className="text-[11px] text-muted-foreground mb-0.5">{t("dashboard.createdDate")}</p>
                  <p className="font-medium">{formatSaudiDate(p.createdAt)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* E — المتابعة */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {t("dashboard.followup")}
          </h4>
          {allFollowups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.noFollowups")}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.followupsCount", { count: allFollowups.length })}
              </p>
              {displayedFollowups.map((followup) => (
                <div key={followup.id} className="rounded-lg border border-border/70 bg-background/70 p-2.5 space-y-1.5 text-xs">
                  {editingFollowupId === followup.id ? (
                    <InlineFollowupEdit
                      followup={followup}
                      patientId={group.patientId}
                      onDone={() => setEditingFollowupId(null)}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {enumLabel("followupType", followup.followupType)}
                          </span>
                          <Badge variant="outline" className={followupStatusClasses(followup.followupStatus)}>
                            <span>{enumLabel("followupStatus", followup.followupStatus)}</span>
                          </Badge>
                        </div>
                        {!["تمت", "ملغاة", "مؤجلة"].includes(followup.followupStatus) && (
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-muted-foreground" onClick={() => startEditFollowup(followup.id)}>
                              <Pencil className="h-3 w-3" /> {t("dashboard.edit")}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-muted-foreground" onClick={() => setStatusFollowup(followup)}>
                              <Check className="h-3 w-3" /> {t("dashboard.changeStatus")}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-destructive hover:text-destructive" onClick={() => setCancelFollowup(followup)}>
                              <X className="h-3 w-3" /> {t("dashboard.cancelFollowup")}
                            </Button>
                          </div>
                        )}
                      </div>
                      {followup.scheduledAt && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{t("dashboard.appointment")}</span>
                          <span>{formatSaudiDateTime(followup.scheduledAt)}</span>
                        </div>
                      )}
                      {followup.assignedUserName && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{t("dashboard.assignee")}</span>
                          <span>{followup.assignedUserName}</span>
                        </div>
                      )}
                      {followup.contactDueAt && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{t("dashboard.contactDueDate")}</span>
                          <span>{formatSaudiDate(followup.contactDueAt)}</span>
                        </div>
                      )}
                      {followup.nextAppointmentAt && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{t("dashboard.nextAppointment")}</span>
                          <span>{formatSaudiDateTime(followup.nextAppointmentAt)}</span>
                        </div>
                      )}
                      {followup.result && (
                        <p>
                          <span className="text-muted-foreground">{t("dashboard.result")}: </span>
                          {followup.result}
                        </p>
                      )}
                      {followup.note && (
                        <p>
                          <span className="text-muted-foreground">{t("dashboard.note")}: </span>
                          {followup.note}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* D — المالية (conditional) */}
        {showFinance && (
          <div className="bg-card rounded-xl border border-border p-4 space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" />
              {t("dashboard.financials")}
            </h4>
            {group.rows.map((row) =>
              row.finance ? (
                <div key={row.caseId} className="space-y-2 text-sm">
                  {group.rows.length > 1 && (
                    <p className="text-xs font-medium text-muted-foreground">
                       {t("dashboard.case")}: {enumLabel("caseStatus", row.caseStatus)}
                    </p>
                  )}
                   <OperationalFinanceSummary
                     row={row}
                     canManage={canManageFinancials}
                     canRecord={Boolean(canRecordPayments)}
                   />
                  <CasePaymentsSection caseId={row.caseId} canManage={canManageFinancials} />
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
      <OutcomeDialog
        open={Boolean(statusFollowup)}
        onOpenChange={(open) => !open && setStatusFollowup(null)}
        patientId={group.patientId}
        followup={statusFollowup}
        title={t("dashboard.changeFollowupStatus")}
        successMessage={t("dashboard.followupStatusUpdated")}
      />
      <CancelFollowupDialog
        open={Boolean(cancelFollowup)}
        onOpenChange={(open) => !open && setCancelFollowup(null)}
        patientId={group.patientId}
        followup={cancelFollowup}
      />

      {/* B — حالات الزراعة */}
      {activeCases.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" />
            {t("dashboard.implantCases")}
          </h4>
          <div className="space-y-3">
            {activeCases.map((c) => (
              <div key={c.id} className="bg-card rounded-xl border border-border p-4">
                {editingCaseId === c.id ? (
                  <InlineCaseEdit c={c} patientId={group.patientId} onDone={() => setEditingCaseId(null)} />
                ) : (
                  <div className="flex flex-wrap gap-3 justify-between items-start">
                    <div className="space-y-1 text-sm flex-1">
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[11px]">{enumLabel("caseStatus", c.caseStatus)}</Badge>
                        {c.prosValue && (
                          <Badge variant="secondary" className="text-[11px] notranslate">Pros: {c.prosValue}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground notranslate">
                        {c.treatingDoctor}
                        {c.procedureDate ? ` — ${formatSaudiDate(c.procedureDate)}` : ""}
                         {c.expectedProstheticDate ? ` — ${t("dashboard.prosthetic")}: ${formatSaudiDate(c.expectedProstheticDate)}` : ""}
                      </p>
                      {c.generalNote && <p className="text-xs text-muted-foreground">{c.generalNote}</p>}
                    </div>
                     <div className="flex flex-wrap items-center gap-1 shrink-0">
                       <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground" onClick={() => startEditCase(c.id)}>
                         <Pencil className="h-3 w-3" /> {t("dashboard.edit")}
                       </Button>
                     </div>
                  </div>
                )}

                {/* C — الزرعات (hide during case edit to keep UI clean) */}
                {editingCaseId !== c.id && c.implants.filter((i) => i.status === "active").length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {t("dashboard.implantsCount", { count: c.implants.filter((i) => i.status === "active").length })}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {c.implants
                        .filter((i) => i.status === "active")
                        .map((imp) => (
                          <div
                            key={imp.id}
                            className={`bg-card border border-border/80 rounded-xl text-xs transition-all ${
                              editingImplantId === imp.id
                                ? "col-span-1 sm:col-span-2 xl:col-span-3 p-3"
                                : "p-3 space-y-2"
                            }`}
                          >
                            {editingImplantId === imp.id ? (
                              <InlineImplantEdit
                                imp={imp}
                                patientId={group.patientId}
                                onDone={() => setEditingImplantId(null)}
                                onRequestProstheticDocumentation={(eventType) => {
                                  setProstheticEventContext({
                                    caseItem: c,
                                    initialImplantId: imp.id,
                                    initialEventType: eventType,
                                    lockInitialEventType: true,
                                  });
                                }}
                              />
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary/10 px-2 font-bold text-primary" dir="ltr">{imp.site}</span>
                                    <div>
                                       <p className="font-semibold">{t("dashboard.toothSite")}</p>
                                      <p className="text-[11px] text-muted-foreground" dir="ltr">{imp.site}</p>
                                    </div>
                                  </div>
                                  {user?.role === "ADMIN" && (
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-foreground transition-colors rounded p-1.5 hover:bg-muted"
                                      onClick={() => startEditImplant(imp.id)}
                                       title={t("dashboard.editImplant")}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive transition-colors rounded p-1.5 hover:bg-destructive/10"
                                      onClick={() => setConfirmArchiveImplantId(imp.id)}
                                       title={t("dashboard.archiveImplant")}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/60 pt-2">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">{t("dashboard.system")}</p>
                                    <p className="font-medium notranslate truncate">{imp.system || "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">SIZE</p>
                                    <p className="font-medium" dir="ltr">
                                      {imp.diameter != null || imp.length != null
                                        ? `${imp.diameter != null ? `Ø${imp.diameter}` : "—"}${imp.diameter != null && imp.length != null ? " × " : ""}${imp.length != null ? `L${imp.length}` : ""}`
                                        : "—"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Q</p>
                                    <p className="font-medium">{imp.qValue || "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Former</p>
                                    <p className="font-medium">{imp.formerValue || "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Graft</p>
                                    <p className="font-medium">{imp.graftValue || "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">{t("dashboard.implantStatus")}</p>
                                     {user?.role === "ADMIN" ? (
                                       <ImplantStatusStepper
                                         implant={imp}
                                         patientId={group.patientId}
                                         onRequestProstheticDocumentation={(eventType) => {
                                           setProstheticEventContext({
                                             caseItem: c,
                                             initialImplantId: imp.id,
                                             initialEventType: eventType,
                                             lockInitialEventType: true,
                                           });
                                         }}
                                       />
                                     ) : (
                                       <Badge
                                         variant="outline"
                                          className={`text-[10px] ${implantStatusClass(imp.implantStatus)}`}
                                       >
                                          {enumLabel("implantStatus", imp.implantStatus)}
                                       </Badge>
                                     )}
                                  </div>
                                </div>
                                {imp.graftProcedureType && (
                                  <p className="rounded-md bg-muted/50 px-2 py-1.5">
                                     <span className="text-muted-foreground">{t("dashboard.graftProcedureType")}: </span>
                                    {imp.graftProcedureType}
                                  </p>
                                )}
                                {imp.procedureTags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {imp.procedureTags.map((tag) => (
                                      <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                                    ))}
                                  </div>
                                )}
                                {imp.graftNote && (
                                  <p className="text-muted-foreground">
                                     <span className="font-medium text-foreground">{t("dashboard.graftNote")}: </span>{imp.graftNote}
                                  </p>
                                )}
                                {imp.implantNote && (
                                  <p className="text-muted-foreground">
                                     <span className="font-medium text-foreground">{t("dashboard.note")}: </span>{imp.implantNote}
                                  </p>
                                )}
                                {confirmArchiveImplantId === imp.id && (
                                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 space-y-2 mt-1">
                                    <p className="text-[11px] flex items-start gap-1.5">
                                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                                       {t("dashboard.archiveImplantConfirmation")}
                                    </p>
                                    <div className="flex gap-2">
                                      <Button type="button" size="sm" variant="destructive"
                                        onClick={() => doArchiveImplant(imp)}
                                        disabled={archiveImplant.isPending}
                                        className="h-6 text-[11px]">
                                        {archiveImplant.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                         {t("dashboard.confirmArchive")}
                                      </Button>
                                      <Button type="button" size="sm" variant="outline"
                                        onClick={() => setConfirmArchiveImplantId(null)}
                                        disabled={archiveImplant.isPending}
                                         className="h-6 text-[11px]">{t("dashboard.cancel")}</Button>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                 {SHOW_PROSTHETIC_EVENT_LOG && (
                 <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
                   <div className="flex items-center justify-between gap-2">
                     <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                       <CalendarCheck2 className="h-3 w-3" />
                       سجل التركيبات
                     </p>
                     <div className="flex items-center gap-1">
                       <Badge variant="secondary" className="text-[10px]">
                         {c.prostheticEvents.filter((event) => event.status === "active").length}
                       </Badge>
                       <Button
                         type="button"
                         variant="ghost"
                         size="sm"
                         className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary"
                         onClick={() => setProstheticEventContext({ caseItem: c })}
                       >
                         <Plus className="h-3 w-3" />
                         إضافة تركيب
                       </Button>
                     </div>
                   </div>
                   {c.prostheticEvents.filter((event) => event.status === "active").length > 0 ? (
                     <div className="space-y-2">
                       {c.prostheticEvents
                         .filter((event) => event.status === "active")
                         .map((event) => {
                           const implant = event.implantId
                             ? c.implants.find((item) => item.id === event.implantId)
                             : null;
                           return (
                             <div
                               key={event.id}
                               className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs space-y-1.5"
                             >
                               <div className="flex flex-wrap items-center justify-between gap-2">
                                 <div className="flex flex-wrap items-center gap-2">
                                   <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                      {enumLabel("prostheticEventType", event.eventType)}
                                   </Badge>
                                   <span className="font-medium">{formatSaudiDate(event.eventDate)}</span>
                                   {implant && (
                                     <span className="text-muted-foreground">
                                       السن {implant.site}{implant.system ? ` — ${implant.system}` : ""}
                                     </span>
                                   )}
                                 </div>
                                 {canArchiveProstheticEvents && (
                                   <Button
                                     type="button"
                                     variant="ghost"
                                     size="sm"
                                     className="h-6 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
                                     onClick={() => setConfirmArchiveProstheticEventId(event.id)}
                                   >
                                     <Archive className="h-3 w-3" />
                                     أرشفة
                                   </Button>
                                 )}
                               </div>
                               {event.note && <p className="text-muted-foreground">{event.note}</p>}
                               {confirmArchiveProstheticEventId === event.id && (
                                 <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 space-y-2">
                                   <p className="text-[11px] flex items-start gap-1.5">
                                     <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                                     سيتم استبعاد هذا السجل من ملخص العمل مع الاحتفاظ به في السجل.
                                   </p>
                                   <div className="flex gap-2">
                                     <Button
                                       type="button"
                                       size="sm"
                                       variant="destructive"
                                       className="h-6 text-[11px]"
                                       onClick={() => doArchiveProstheticEvent(event.id)}
                                       disabled={archiveProstheticEvent.isPending}
                                     >
                                       {archiveProstheticEvent.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                                       تأكيد الأرشفة
                                     </Button>
                                     <Button
                                       type="button"
                                       size="sm"
                                       variant="outline"
                                       className="h-6 text-[11px]"
                                       onClick={() => setConfirmArchiveProstheticEventId(null)}
                                       disabled={archiveProstheticEvent.isPending}
                                     >
                                       إلغاء
                                     </Button>
                                   </div>
                                 </div>
                               )}
                             </div>
                           );
                         })}
                     </div>
                   ) : (
                     <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
                       لا توجد تركيبات موثقة لهذه الحالة حتى الآن.
                     </p>
                   )}
                 </div>
                 )}

                 {prostheticEventContext?.caseItem.id === c.id && (
                   <ProstheticEventDialog
                     open
                     onOpenChange={(open) => {
                       if (!open) setProstheticEventContext(null);
                     }}
                     patientId={group.patientId}
                     caseItem={c}
                     initialImplantId={prostheticEventContext.initialImplantId}
                     initialEventType={prostheticEventContext.initialEventType}
                     lockInitialEventType={prostheticEventContext.lockInitialEventType}
                     onSuccess={() => {
                        void qc.invalidateQueries({
                          queryKey: ["operational-report"],
                        });
                        void qc.invalidateQueries({ queryKey: ["statistics"] });
                       if (prostheticEventContext.initialImplantId) {
                         setEditingImplantId(null);
                       }
                     }}
                   />
                 )}
                  <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                          {t("dashboard.adjunctProcedures")}
                      </p>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {(c.boneGraftProcedures ?? []).filter((procedure) => procedure.status === "active").length}
                        </Badge>
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary" onClick={() => setBoneGraftContext({ caseItem: c, procedure: null })}>
                          <Plus className="h-3 w-3" />
                          {t("dashboard.addProcedure")}
                        </Button>
                      </div>
                    </div>
                    {(c.boneGraftProcedures ?? []).filter((procedure) => procedure.status === "active").length > 0 ? (
                      <div className="space-y-2">
                        {(c.boneGraftProcedures ?? []).filter((procedure) => procedure.status === "active").map((procedure) => (
                          <div key={procedure.id} className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{enumLabel("adjunctProcedureCategory", procedure.procedureCategory)}</Badge>
                              <span>{procedure.procedureType}</span>
                              <span className="font-medium">{formatSaudiDate(procedure.procedureDate)}</span>
                              <Badge variant="secondary">{procedure.procedureStatus}</Badge>
                               <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] me-auto" onClick={() => setBoneGraftContext({ caseItem: c, procedure })}><Pencil className="h-3 w-3" />{t("dashboard.edit")}</Button>
                               {canArchiveProstheticEvents && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-destructive hover:text-destructive" onClick={() => setConfirmArchiveBoneGraftProcedureId(procedure.id)}><Archive className="h-3 w-3" />{t("dashboard.archive")}</Button>}
                            </div>
                            {(procedure.procedureSide || procedure.liftType || procedure.material || procedure.membrane || procedure.note) && <p className="text-muted-foreground">{[procedure.procedureSide && `${dashboardText("side")}: ${enumLabel("procedureSide", procedure.procedureSide)}`, procedure.liftType && `${dashboardText("liftType")}: ${enumLabel("sinusLiftType", procedure.liftType)}`, procedure.material && `${dashboardText("material")}: ${procedure.material}`, procedure.membrane && `${dashboardText("membrane")}: ${procedure.membrane}`, procedure.note].filter(Boolean).join(" — ")}</p>}
                            {confirmArchiveBoneGraftProcedureId === procedure.id && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2"><p className="mb-2 text-[11px]">{t("dashboard.archiveProcedureConfirmation")}</p><div className="flex gap-2"><Button type="button" size="sm" variant="destructive" className="h-6 text-[11px]" onClick={() => doArchiveBoneGraftProcedure(procedure.id)} disabled={archiveBoneGraftProcedure.isPending}>{t("dashboard.confirmArchive")}</Button><Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setConfirmArchiveBoneGraftProcedureId(null)}>{t("dashboard.cancel")}</Button></div></div>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{t("dashboard.noAdjunctProcedures")}</p>}
                  </div>
                  {boneGraftContext?.caseItem.id === c.id && (
                    <BoneGraftProcedureDialog
                      key={boneGraftContext.procedure?.id ?? "new"}
                      open
                      onOpenChange={(open) => !open && setBoneGraftContext(null)}
                      patientId={group.patientId}
                      caseItem={c}
                      procedure={boneGraftContext.procedure ?? null}
                    />
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* F — Quick actions toolbar */}
      <div className="pt-2 border-t border-border/60 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary inline actions */}
          <Button
            type="button"
            size="sm"
            variant={activeAction === "implant" ? "default" : "outline"}
            onClick={() => toggleAction("implant")}
            className="h-8 text-xs gap-1"
          >
            {activeAction === "implant" ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
             {t("dashboard.addImplant")}
          </Button>

          {canRecordPayments && (
            <Button
              type="button"
              size="sm"
              variant={activeAction === "payment" ? "default" : "outline"}
              onClick={() => toggleAction("payment")}
              className="h-8 text-xs gap-1"
            >
              {activeAction === "payment" ? <X className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
               {t("dashboard.recordPayment")}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant={activeAction === "followup" ? "default" : "outline"}
            onClick={() => toggleAction("followup")}
            className="h-8 text-xs gap-1"
          >
            {activeAction === "followup" ? <X className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
             {t("dashboard.addFollowup")}
          </Button>

          {/* Secondary — navigate only */}
          <Button asChild size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground gap-1 me-auto">
            <Link href={`/patients/${group.patientId}`}>
              <ExternalLink className="h-3 w-3" />
               {t("dashboard.fullPatientFile")} ↗
            </Link>
          </Button>
          {canDeleteRows && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmArchivePatient(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
               {t("dashboard.archiveRow")}
            </Button>
          )}
        </div>

        {canDeleteRows && confirmArchivePatient && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <p className="text-xs flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
               {t("dashboard.archivePatientConfirmation", { patient: group.patientName })}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={doArchivePatient}
                disabled={archivePatient.isPending}
                className="h-7 text-xs"
              >
                {archivePatient.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                 {t("dashboard.confirmArchiveRow")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmArchivePatient(false)}
                disabled={archivePatient.isPending}
                className="h-7 text-xs"
              >
                 {t("dashboard.cancel")}
              </Button>
            </div>
          </div>
        )}

        {/* Inline form panel — smooth height transition */}
        {activeAction !== null && activeCases.length > 0 && (
          <div className="bg-muted/40 rounded-xl border border-border/60 p-4 transition-all duration-200">
            {activeAction === "implant" && (
              <InlineAddImplant
                patientId={group.patientId}
                cases={activeCases}
                onDone={() => setActiveAction(null)}
              />
            )}
            {activeAction === "payment" && canRecordPayments && (
              <InlineRecordPayment
                cases={activeCases}
                onDone={() => setActiveAction(null)}
              />
            )}
            {activeAction === "followup" && (
              <InlineAddFollowup
                patientId={group.patientId}
                cases={activeCases}
                onDone={() => setActiveAction(null)}
              />
            )}
          </div>
        )}

        {/* No active cases warning */}
        {activeAction !== null && activeCases.length === 0 && (
          <p className="text-sm text-muted-foreground px-1">
             {t("dashboard.noActiveCases")}
          </p>
        )}

      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary row (desktop table row)                                     */
/* ------------------------------------------------------------------ */

function PatientSummaryRow({
  group,
  showFinance,
  expanded,
  onToggle,
}: {
  group: PatientGroup;
  showFinance: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const overdue = hasOverdue(group.rows);
  const ready = hasReady(group.rows);
  const remaining = showFinance ? summaryRemaining(group.rows) : null;
  const payStatus = showFinance ? summaryPaymentStatus(group.rows) : null;
  const systems = summarySystems(group.rows);
  const { enumLabel } = useEnumTranslation();

  return (
    <tr
      className={`cursor-pointer hover:bg-muted/50 transition-colors border-b border-border ${expanded ? "bg-muted/30" : ""}`}
      onClick={onToggle}
      data-testid={`report-row-${group.patientId}`}
    >
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm notranslate leading-tight">{group.patientName}</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {overdue && (
                <Badge variant="destructive" className="text-[10px]">{dashboardText("overdue")}</Badge>
              )}
              {ready && (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">
                  {dashboardText("readyForProsthetic")}
                </Badge>
              )}
            </div>
          </div>
          <span className="text-muted-foreground me-auto shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm" dir="ltr">{group.fileNumber}</td>
      <td className="px-4 py-3 text-sm"><ClinicalSummaryBadges rows={group.rows} /></td>
      <td className="px-4 py-3 text-sm notranslate">{summaryDoctor(group.rows)}</td>
      <td className="px-4 py-3 text-sm tabular-nums">{summaryImplantCount(group.rows)}</td>
      <td className="px-4 py-3 text-sm notranslate">
        {systems.length > 0 ? systems.join("، ") : "—"}
      </td>
      <td className="px-4 py-3 text-sm">
        {summaryNextFollowup(group.rows) ? formatSaudiDate(summaryNextFollowup(group.rows)!) : "—"}
      </td>
      {showFinance && (
        <>
          <td className="px-4 py-3 text-sm tabular-nums">
            {remaining !== null ? formatMoney(remaining) : "—"}
          </td>
          <td className="px-4 py-3 text-sm">
            {payStatus ? (
              <Badge className={`text-[10px] ${paymentStatusClass(payStatus)}`}>
                {enumLabel("paymentStatus", payStatus)}
              </Badge>
            ) : "—"}
          </td>
        </>
      )}
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile patient card                                                 */
/* ------------------------------------------------------------------ */

function PatientCard({
  group,
  showFinance,
  expanded,
  onToggle,
}: {
  group: PatientGroup;
  showFinance: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const overdue = hasOverdue(group.rows);
  const ready = hasReady(group.rows);
  const remaining = showFinance ? summaryRemaining(group.rows) : null;
  const payStatus = showFinance ? summaryPaymentStatus(group.rows) : null;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        className={`w-full text-start p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors ${expanded ? "bg-muted/30" : "bg-card"}`}
        onClick={onToggle}
        data-testid={`report-card-${group.patientId}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold notranslate">{group.patientName}</p>
            <p className="text-xs text-muted-foreground shrink-0" dir="ltr">{group.fileNumber}</p>
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {overdue && <Badge variant="destructive" className="text-[10px]">{dashboardText("overdue")}</Badge>}
            {ready && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">{dashboardText("readyForProsthetic")}</Badge>}
            <ClinicalSummaryBadges rows={group.rows} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
            <span>{dashboardText("implantCount", { count: summaryImplantCount(group.rows) })}</span>
            {summaryNextFollowup(group.rows) && (
              <span>{dashboardText("followupDate", { date: formatSaudiDate(summaryNextFollowup(group.rows)!) })}</span>
            )}
            {remaining !== null && (
              <span className="font-medium text-foreground">{dashboardText("remainingAmount", { amount: formatMoney(remaining) })}</span>
            )}
            {payStatus && (
              <Badge className={`text-[10px] ${paymentStatusClass(payStatus)}`}>{payStatus}</Badge>
            )}
          </div>
        </div>
        <span className="text-muted-foreground shrink-0 mt-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded content */}
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 250ms ease-in-out",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 overflow-hidden">
          {expanded && (
            <PatientExpandedRow group={group} showFinance={showFinance} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated expansion wrapper for table rows                           */
/* ------------------------------------------------------------------ */

function ExpandedRowWrapper({
  group,
  showFinance,
  colSpan,
  expanded,
}: {
  group: PatientGroup;
  showFinance: boolean;
  colSpan: number;
  expanded: boolean;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0" onClick={(event) => event.stopPropagation()}>
        <div
          className="grid overflow-hidden"
          style={{
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transition: "grid-template-rows 250ms ease-in-out",
          }}
        >
          <div className="min-h-0 overflow-hidden">
            {expanded && (
              <PatientExpandedRow group={group} showFinance={showFinance} />
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Main OperationalTable                                               */
/* ------------------------------------------------------------------ */

export function OperationalTable({
  data,
  isLoading,
  isError,
  isFetching,
  filters,
  searchValue,
  onSearchChange,
  filterState,
  onFilterChange,
  doctorOptions,
  systemOptions,
}: {
  data: OperationalReportResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  filters: ReportFilters;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterState: ReportFilterState;
  onFilterChange: (next: ReportFilterState) => void;
  doctorOptions: string[];
  systemOptions: string[];
}) {
  const { t } = useTranslation("guidance");
  const showFinance = Boolean(data?.financialsIncluded);
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [page, setPage] = useState(1);

  const groups = data ? groupByPatient(data.rows) : [];
  const totalGroups = groups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const visibleExpandedPatientId = pagedGroups.some(
    (group) => group.patientId === expandedPatientId,
  )
    ? expandedPatientId
    : null;

  const handleToggle = (patientId: string) => {
    setExpandedPatientId((prev) => (prev === patientId ? null : patientId));
  };

  const handleSearchChange = (value: string) => {
    if (value !== searchValue) {
      setExpandedPatientId(null);
      setPage(1);
    }
    onSearchChange(value);
  };

  const handleFilterChange = (next: ReportFilterState) => {
    setPage(1);
    setExpandedPatientId(null);
    onFilterChange(next);
  };

  const colSpan = showFinance ? 9 : 7;

  return (
    <Card data-testid="card-operational-report">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">
          {t("dashboard.casesPatients", { count: totalGroups })}
        </CardTitle>
        <div className="flex gap-2 print:hidden flex-wrap">
          <Button
            variant="default"
            size="sm"
            className="btn-primary"
            id="tour-new-patient-btn"
            onClick={() => setShowNewRecord((v) => !v)}
            data-testid="button-add-new-record"
          >
            <Plus className="h-4 w-4" />
            <span>{t("dashboard.addRecord")}</span>
          </Button>
          <ExportMenu
            getUrl={(format) => operationalExportUrl(filters, format)}
            formats={["pdf", "xlsx"]}
            disabled={!data || data.rows.length === 0}
            data-testid="button-export-operational"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() => window.print()}
            data-testid="button-print-operational"
          >
            <Printer className="h-4 w-4" />
            <span>{t("dashboard.print")}</span>
          </Button>
        </div>
      </CardHeader>
      <div className="border-t border-border/60 px-4 py-3 print:hidden">
        <ReportFiltersBar
          state={filterState}
          onChange={handleFilterChange}
          doctorOptions={doctorOptions}
          systemOptions={systemOptions}
        />
      </div>
      <CardContent className="p-0">
        <div className="px-4 pb-3 print:hidden">
          <div className="relative">
            <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t("dashboard.searchOperational")}
              aria-label={t("dashboard.searchOperationalLabel")}
              data-testid="input-operational-search"
              className="h-10 w-full pe-10 ps-10"
            />
            {searchValue && (
              isFetching ? (
                <Loader2 className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onSearchChange("")}
                  aria-label={t("dashboard.clearSearch")}
                  data-testid="button-clear-operational-search"
                  className="absolute start-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              )
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive py-6 text-center px-6">
            {t("dashboard.reportLoadError")}
          </p>
        ) : (
          <>
            {/* Inline new record form */}
            {showNewRecord && (
              <div className="border-b border-border">
                <InlineNewRecord
                  onClose={() => setShowNewRecord(false)}
                  onSuccess={() => { setShowNewRecord(false); setPage(1); setExpandedPatientId(null); }}
                />
              </div>
            )}

            {!data || totalGroups === 0 ? (
              !showNewRecord && (
                <p className="text-sm text-muted-foreground px-6 pb-5 pt-4">
                  {searchValue.trim()
                    ? t("dashboard.noOperationalSearchResults")
                    : t("dashboard.noFilteredCases")}
                </p>
              )
            ) : (
              <>
                {/* Desktop table (hidden on mobile) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-start text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.patient")}</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.fileNumber")}</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.caseStatus")}</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.treatingDoctor")}</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.implants")}</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.systems")}</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.nextFollowup")}</th>
                        {showFinance && (
                          <>
                            <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.remaining")}</th>
                            <th className="px-4 py-3 font-medium text-muted-foreground">{t("dashboard.paymentStatus")}</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedGroups.map((group) => (
                        <React.Fragment key={group.patientId}>
                          <PatientSummaryRow
                            group={group}
                            showFinance={showFinance}
                            expanded={visibleExpandedPatientId === group.patientId}
                            onToggle={() => handleToggle(group.patientId)}
                          />
                          <ExpandedRowWrapper
                            group={group}
                            showFinance={showFinance}
                            colSpan={colSpan}
                            expanded={visibleExpandedPatientId === group.patientId}
                          />
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards (hidden on desktop) */}
                <div className="md:hidden p-3 space-y-2">
                  {pagedGroups.map((group) => (
                    <PatientCard
                      key={group.patientId}
                      group={group}
                      showFinance={showFinance}
                      expanded={expandedPatientId === group.patientId}
                      onToggle={() => handleToggle(group.patientId)}
                    />
                  ))}
                </div>

                {/* Pagination footer */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border print:hidden">
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.pagination", { page: safePage, totalPages, count: totalGroups })}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={safePage === 1}
                        onClick={() => { setPage(1); setExpandedPatientId(null); }}
                        title={t("dashboard.firstPage")}
                      >
                        <span className="text-sm leading-none">«</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={safePage === 1}
                        onClick={() => { setPage((p) => Math.max(1, p - 1)); setExpandedPatientId(null); }}
                        title={t("dashboard.previousPage")}
                      >
                        <span className="text-sm leading-none">‹</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={safePage === totalPages}
                        onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setExpandedPatientId(null); }}
                        title={t("dashboard.nextPage")}
                      >
                        <span className="text-sm leading-none">›</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={safePage === totalPages}
                        onClick={() => { setPage(totalPages); setExpandedPatientId(null); }}
                        title={t("dashboard.lastPage")}
                      >
                        <span className="text-sm leading-none">»</span>
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
