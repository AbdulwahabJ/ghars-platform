import React, { useState } from "react";
import { Link } from "wouter";
import { Download, Loader2, Plus, Printer, ChevronDown, ChevronUp, ExternalLink, Calendar, Banknote, Stethoscope, Activity, ClipboardList, Pencil, Check, X, Search } from "lucide-react";
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
import { operationalExportUrl } from "@/lib/api";
import { formatSaudiDate, formatSaudiDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type { OperationalReportResponse, OperationalRow, ReportFilters, Patient, ImplantCaseWithImplants, Implant, ImplantStatus, FollowupType } from "@workspace/shared";
import { CASE_STATUSES, IMPLANT_STATUSES, FDI_SITES, FOLLOWUP_TYPES, PAYMENT_LABELS, PAYMENT_METHODS } from "@workspace/shared";
import { followupStatusClasses } from "@/components/followups/followup-utils";
import { usePatient, useUpdatePatient } from "@/hooks/use-patients";
import { useImplantCases, useCreateImplant, useUpdateImplantCase, useUpdateImplant, useImplantOptions } from "@/hooks/use-implant-cases";
import { useFollowups, useCreateFollowup, useAssignableUsers } from "@/hooks/use-followups";
import { useCreatePayment } from "@/hooks/use-finance";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { InlineNewRecord } from "./InlineNewRecord";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PatientGroup {
  patientId: string;
  patientName: string;
  fileNumber: string;
  rows: OperationalRow[];
}

/* ------------------------------------------------------------------ */
/* Group rows by patient                                               */
/* ------------------------------------------------------------------ */

function groupByPatient(rows: OperationalRow[]): PatientGroup[] {
  const map = new Map<string, PatientGroup>();
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

function summaryStatus(rows: OperationalRow[]): string {
  if (rows.length === 1) return rows[0].caseStatus;
  return "متعددة";
}

function summaryDoctor(rows: OperationalRow[]): string {
  const doctors = [...new Set(rows.map((r) => r.treatingDoctor).filter(Boolean))];
  if (doctors.length === 1) return doctors[0]!;
  return doctors.length > 1 ? "متعددة" : "—";
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
  return "متعددة";
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

/* ------------------------------------------------------------------ */
/* Inline edit sub-components                                          */
/* ------------------------------------------------------------------ */

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
        onSuccess: () => { toast({ title: "تم تحديث بيانات المريض" }); onDone(); },
        onError: () => { toast({ title: "فشل التحديث", variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">الاسم *</Label>
          <Input className="h-8 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الجوال</Label>
          <Input className="h-8 text-sm" dir="ltr" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">العمر</Label>
          <Input className="h-8 text-sm" type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">ملاحظة إدارية</Label>
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
        onSuccess: () => { toast({ title: "تم تحديث الحالة" }); onDone(); },
        onError: () => { toast({ title: "فشل التحديث", variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">حالة الحالة</Label>
          <Select dir="rtl" value={caseStatus} onValueChange={setCaseStatus}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CASE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الطبيب المعالج</Label>
          <Input className="h-8 text-sm" value={treatingDoctor} onChange={(e) => setTreatingDoctor(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">تاريخ العملية</Label>
          <Input className="h-8 text-sm" type="date" value={procedureDate} onChange={(e) => setProcedureDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">مدة التركيب (Pros)</Label>
          <Input className="h-8 text-sm" value={prosValue} onChange={(e) => setProsValue(e.target.value)} placeholder="3M" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">تاريخ التركيب المتوقع</Label>
          <Input className="h-8 text-sm" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">ملاحظة</Label>
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
}: {
  imp: Implant;
  patientId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
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
        onSuccess: () => { toast({ title: "تم تحديث الزرعة" }); onDone(); },
        onError: () => { toast({ title: "فشل التحديث", variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">الموقع (FDI)</Label>
          <Select dir="ltr" value={site} onValueChange={(value) => setSite(value as typeof FDI_SITES[number])}>
            <SelectTrigger className="h-7 text-xs text-right"><SelectValue /></SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">الفك العلوي</div>
              {["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">الفك السفلي</div>
              {["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">النظام</Label>
          <Select dir="rtl" value={system || "__none__"} onValueChange={(v) => setSystem(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.systems ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">القطر</Label>
          <Input className="h-7 text-xs" type="number" step="0.1" value={diameter} onChange={(e) => setDiameter(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الطول</Label>
          <Input className="h-7 text-xs" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Q</Label>
          <Select dir="rtl" value={qValue || "__none__"} onValueChange={(v) => setQValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.qValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Former</Label>
          <Select dir="rtl" value={formerValue || "__none__"} onValueChange={(v) => setFormerValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.formerValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Graft</Label>
          <Select dir="rtl" value={graftValue || "__none__"} onValueChange={(v) => setGraftValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.graftValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الحالة</Label>
          <Select dir="rtl" value={implantStatus} onValueChange={(v) => setImplantStatus(v as typeof IMPLANT_STATUSES[number])}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {IMPLANT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
  if (cases.length <= 1) return null;
  return (
    <div className="space-y-1">
      <Label className="text-xs">الحالة *</Label>
      <Select dir="rtl" value={selected} onValueChange={onSelect}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
        <SelectContent>
          {cases.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.caseStatus} — {c.treatingDoctor}
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
          toast({ title: "تمت إضافة الزرعة" });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          onDone();
        },
        onError: () => { toast({ title: "فشل الحفظ", variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-semibold text-muted-foreground">إضافة زرعة</p>
      <CaseSelector cases={cases} selected={caseId} onSelect={setCaseId} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Site */}
        <div className="space-y-1">
          <Label className="text-xs">الموقع (FDI) *</Label>
          <Select dir="ltr" value={site} onValueChange={(value) => setSite(value as typeof FDI_SITES[number])}>
            <SelectTrigger className="h-8 text-sm text-right"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">الفك العلوي</div>
              {["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">الفك السفلي</div>
              {["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* System */}
        <div className="space-y-1">
          <Label className="text-xs">النظام</Label>
          <Select dir="rtl" value={system || "__none__"} onValueChange={(v) => setSystem(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.systems ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Diameter */}
        <div className="space-y-1">
          <Label className="text-xs">القطر</Label>
          <Input className="h-8 text-sm" type="number" step="0.1" min={0} value={diameter} onChange={(e) => setDiameter(e.target.value)} />
        </div>
        {/* Length */}
        <div className="space-y-1">
          <Label className="text-xs">الطول</Label>
          <Input className="h-8 text-sm" type="number" step="0.1" min={0} value={length} onChange={(e) => setLength(e.target.value)} />
        </div>
        {/* Q */}
        <div className="space-y-1">
          <Label className="text-xs">Q</Label>
          <Select dir="rtl" value={qValue || "__none__"} onValueChange={(v) => setQValue(v === "__none__" ? "" : v)}>
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
          <Select dir="rtl" value={formerValue || "__none__"} onValueChange={(v) => setFormerValue(v === "__none__" ? "" : v)}>
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
          <Select dir="rtl" value={graftValue || "__none__"} onValueChange={(v) => setGraftValue(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(implantOptions?.graftValues ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Implant Status */}
        <div className="space-y-1">
          <Label className="text-xs">حالة الزرعة</Label>
          <Select dir="rtl" value={implantStatus} onValueChange={(value) => setImplantStatus(value as ImplantStatus)}>
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
              <Label className="text-xs">نوع إجراء الترقيع</Label>
              <Input className="h-8 text-sm" value={graftProcedureType} onChange={(e) => setGraftProcedureType(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs">ملاحظة الترقيع</Label>
              <Input className="h-8 text-sm" value={graftNote} onChange={(e) => setGraftNote(e.target.value)} />
            </div>
          </>
        )}
        {/* Implant note — full width */}
        <div className="col-span-2 sm:col-span-4 space-y-1">
          <Label className="text-xs">ملاحظة</Label>
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
          paymentLabel,
          paymentMethod,
          paymentDate: paymentDate,
          referenceNumber: referenceNumber || null,
          note: note || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "تم تسجيل الدفعة" });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          onDone();
        },
        onError: () => { toast({ title: "فشل الحفظ", variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-semibold text-muted-foreground">تسجيل دفعة</p>
      <CaseSelector cases={cases} selected={caseId} onSelect={setCaseId} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">المبلغ (ر.س) *</Label>
          <Input className="h-8 text-sm" type="number" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">وصف الدفعة</Label>
          <Select dir="rtl" value={paymentLabel} onValueChange={(value) => setPaymentLabel(value as typeof PAYMENT_LABELS[number])}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">طريقة الدفع</Label>
          <Select dir="rtl" value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof PAYMENT_METHODS[number])}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">تاريخ الدفعة</Label>
          <Input className="h-8 text-sm" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">رقم المرجع</Label>
          <Input className="h-8 text-sm" dir="ltr" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="اختياري" />
        </div>
        <div className="col-span-2 sm:col-span-3 space-y-1">
          <Label className="text-xs">ملاحظة</Label>
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
  const create = useCreateFollowup(patientId);
  const { data: assignableUsers } = useAssignableUsers();
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
  const [assignedUserId, setAssignedUserId] = useState("");
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
          assignedUserId: assignedUserId || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "تمت إضافة المتابعة" });
          void qc.invalidateQueries({ queryKey: ["operational-report"] });
          onDone();
        },
        onError: () => { toast({ title: "فشل الحفظ", variant: "destructive" }); },
      },
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-semibold text-muted-foreground">إضافة متابعة</p>
      <CaseSelector cases={cases} selected={caseId} onSelect={setCaseId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">نوع المتابعة *</Label>
          <Select dir="rtl" value={followupType} onValueChange={(value) => setFollowupType(value as FollowupType)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FOLLOWUP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">التاريخ والوقت *</Label>
          <Input
            className="h-8 text-sm"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        {assignableUsers && assignableUsers.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">المسؤول</Label>
            <Select dir="rtl" value={assignedUserId || "__none__"} onValueChange={(v) => setAssignedUserId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">الموعد القادم</Label>
          <Input
            className="h-8 text-sm"
            type="datetime-local"
            value={nextAppointmentAt}
            onChange={(e) => setNextAppointmentAt(e.target.value)}
          />
        </div>
        <div className="col-span-1 sm:col-span-2 flex items-center gap-2 pt-1">
          <Checkbox
            id="qe-requires-contact"
            checked={requiresContact}
            onCheckedChange={(v) => setRequiresContact(!!v)}
          />
          <Label htmlFor="qe-requires-contact" className="text-xs cursor-pointer">يتطلب تواصلًا</Label>
        </div>
        {requiresContact && (
          <div className="space-y-1">
            <Label className="text-xs">تاريخ التواصل</Label>
            <Input className="h-8 text-sm" type="date" value={contactDueAt} onChange={(e) => setContactDueAt(e.target.value)} />
          </div>
        )}
        <div className="col-span-1 sm:col-span-2 space-y-1">
          <Label className="text-xs">ملاحظة</Label>
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
  const { user } = useAuth();
  const canRecordPayments = user?.role === "ADMIN" || user?.canRecordPayments;

  const patient = usePatient(group.patientId);
  const casesQuery = useImplantCases(group.patientId);
  const followupsQuery = useFollowups(group.patientId);

  // Inline edit state — one section at a time
  const [editingPatient, setEditingPatient] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingImplantId, setEditingImplantId] = useState<string | null>(null);
  // Inline quick-action state — one form open at a time
  type QuickAction = "implant" | "payment" | "followup";
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null);
  const [now] = useState(() => Date.now());

  const startEditPatient = () => { setEditingPatient(true); setEditingCaseId(null); setEditingImplantId(null); };
  const startEditCase = (id: string) => { setEditingCaseId(id); setEditingPatient(false); setEditingImplantId(null); };
  const startEditImplant = (id: string) => { setEditingImplantId(id); setEditingPatient(false); setEditingCaseId(null); };

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
  const displayedFollowups = [...allFollowups].sort((a, b) => {
    const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    const aPriority = a.followupStatus === "مجدولة"
      ? (aTime >= now ? 0 : 1)
      : 2;
    const bPriority = b.followupStatus === "مجدولة"
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
              بيانات المريض
            </h4>
            {!editingPatient && (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground" onClick={startEditPatient}>
                <Pencil className="h-3 w-3" /> تعديل
              </Button>
            )}
          </div>
          {editingPatient && p ? (
            <InlinePatientEdit p={p} patientId={group.patientId} onDone={() => setEditingPatient(false)} />
          ) : (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الاسم</span>
                <span className="font-medium notranslate">{p?.fullName ?? group.patientName}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">رقم الملف</span>
                <span dir="ltr">{group.fileNumber}</span>
              </div>
              {p?.mobileNumber && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">الجوال</span>
                  <span dir="ltr" className="notranslate">{p.mobileNumber}</span>
                </div>
              )}
              {p?.age != null && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">العمر</span>
                  <span>{p.age}</span>
                </div>
              )}
              {p?.createdAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">تاريخ الإضافة</span>
                  <span>{formatSaudiDate(p.createdAt)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* E — المتابعة */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            المتابعة
          </h4>
          {allFollowups.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد متابعات مسجلة.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {allFollowups.length} {allFollowups.length === 1 ? "متابعة" : "متابعات"}
              </p>
              {displayedFollowups.map((followup) => (
                <div key={followup.id} className="rounded-lg border border-border/70 p-2.5 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium notranslate">{followup.followupType}</span>
                    <Badge variant="outline" className={followupStatusClasses(followup.followupStatus)}>
                      <span className="notranslate">{followup.followupStatus}</span>
                    </Badge>
                  </div>
                  {followup.scheduledAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">الموعد</span>
                      <span>{formatSaudiDateTime(followup.scheduledAt)}</span>
                    </div>
                  )}
                  {followup.assignedUserName && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">المسؤول</span>
                      <span>{followup.assignedUserName}</span>
                    </div>
                  )}
                  {followup.contactDueAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">موعد التواصل</span>
                      <span>{formatSaudiDate(followup.contactDueAt)}</span>
                    </div>
                  )}
                  {followup.nextAppointmentAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">الموعد التالي</span>
                      <span>{formatSaudiDateTime(followup.nextAppointmentAt)}</span>
                    </div>
                  )}
                  {followup.result && (
                    <p>
                      <span className="text-muted-foreground">النتيجة: </span>
                      {followup.result}
                    </p>
                  )}
                  {followup.note && (
                    <p>
                      <span className="text-muted-foreground">الملاحظة: </span>
                      {followup.note}
                    </p>
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
              المالية
            </h4>
            {group.rows.map((row) =>
              row.finance ? (
                <div key={row.caseId} className="space-y-1 text-sm">
                  {group.rows.length > 1 && (
                    <p className="text-xs font-medium text-muted-foreground">
                      الحالة: {row.caseStatus}
                    </p>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">الإجمالي</span>
                    <span className="tabular-nums">{formatMoney(row.finance.finalTotal)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">المتبقي</span>
                    <span className="tabular-nums font-medium">{formatMoney(row.finance.remaining)}</span>
                  </div>
                  <Badge className={`text-[10px] ${paymentStatusClass(row.finance.paymentStatus)}`}>
                    {row.finance.paymentStatus}
                  </Badge>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>

      {/* B — حالات الزراعة */}
      {activeCases.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" />
            حالات الزراعة
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
                        <Badge variant="outline" className="text-[11px] notranslate">{c.caseStatus}</Badge>
                        {c.prosValue && (
                          <Badge variant="secondary" className="text-[11px] notranslate">Pros: {c.prosValue}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground notranslate">
                        {c.treatingDoctor}
                        {c.procedureDate ? ` — ${formatSaudiDate(c.procedureDate)}` : ""}
                        {c.expectedProstheticDate ? ` — تركيب: ${formatSaudiDate(c.expectedProstheticDate)}` : ""}
                      </p>
                      {c.generalNote && <p className="text-xs text-muted-foreground">{c.generalNote}</p>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground shrink-0" onClick={() => startEditCase(c.id)}>
                      <Pencil className="h-3 w-3" /> تعديل
                    </Button>
                  </div>
                )}

                {/* C — الزرعات (hide during case edit to keep UI clean) */}
                {editingCaseId !== c.id && c.implants.filter((i) => i.status === "active").length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      الزرعات ({c.implants.filter((i) => i.status === "active").length})
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {c.implants
                        .filter((i) => i.status === "active")
                        .map((imp) => (
                          <div
                            key={imp.id}
                            className={`bg-muted/50 rounded-lg text-xs transition-all ${
                              editingImplantId === imp.id
                                ? "col-span-2 sm:col-span-3 lg:col-span-4 p-3"
                                : "px-3 py-2 space-y-0.5"
                            }`}
                          >
                            {editingImplantId === imp.id ? (
                              <InlineImplantEdit imp={imp} patientId={group.patientId} onDone={() => setEditingImplantId(null)} />
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-1">
                                  <p className="font-semibold" dir="ltr">{imp.site}</p>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5"
                                    onClick={() => startEditImplant(imp.id)}
                                    title="تعديل الزرعة"
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                                {imp.system && <p className="text-muted-foreground notranslate">{imp.system}</p>}
                                {(imp.diameter || imp.length) && (
                                  <p className="text-muted-foreground" dir="ltr">
                                    {imp.diameter ? `Ø${imp.diameter}` : ""}
                                    {imp.diameter && imp.length ? " × " : ""}
                                    {imp.length ? `L${imp.length}` : ""}
                                  </p>
                                )}
                                {imp.qValue && <p className="text-muted-foreground">Q: {imp.qValue}</p>}
                                {imp.formerValue && <p className="text-muted-foreground">Former: {imp.formerValue}</p>}
                                {imp.graftValue && <p className="text-muted-foreground">Graft: {imp.graftValue}</p>}
                                <Badge variant="outline" className="text-[9px] notranslate mt-1">
                                  {imp.implantStatus}
                                </Badge>
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
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
            إضافة زرعة
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
              تسجيل دفعة
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
            إضافة متابعة
          </Button>

          {/* Secondary — navigate only */}
          <Button asChild size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground gap-1 mr-auto">
            <Link href={`/patients/${group.patientId}`}>
              <ExternalLink className="h-3 w-3" />
              الملف الكامل ↗
            </Link>
          </Button>
        </div>

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
            لا توجد حالات نشطة. أضف حالة زراعة أولًا عبر الملف الكامل.
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
                <Badge variant="destructive" className="text-[10px]">متأخرة</Badge>
              )}
              {ready && (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">
                  جاهزة للتركيب
                </Badge>
              )}
            </div>
          </div>
          <span className="text-muted-foreground mr-auto shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm" dir="ltr">{group.fileNumber}</td>
      <td className="px-4 py-3 text-sm notranslate">{summaryStatus(group.rows)}</td>
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
                {payStatus}
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
        className={`w-full text-right p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors ${expanded ? "bg-muted/30" : "bg-card"}`}
        onClick={onToggle}
        data-testid={`report-card-${group.patientId}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold notranslate">{group.patientName}</p>
            <p className="text-xs text-muted-foreground shrink-0" dir="ltr">{group.fileNumber}</p>
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {overdue && <Badge variant="destructive" className="text-[10px]">متأخرة</Badge>}
            {ready && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">جاهزة للتركيب</Badge>}
            <Badge variant="outline" className="text-[10px] notranslate">{summaryStatus(group.rows)}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
            <span>{summaryImplantCount(group.rows)} زرعة</span>
            {summaryNextFollowup(group.rows) && (
              <span>متابعة: {formatSaudiDate(summaryNextFollowup(group.rows)!)}</span>
            )}
            {remaining !== null && (
              <span className="font-medium text-foreground">{formatMoney(remaining)} متبقي</span>
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
}: {
  data: OperationalReportResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  filters: ReportFilters;
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  const showFinance = Boolean(data?.financialsIncluded);
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [showNewRecord, setShowNewRecord] = useState(false);

  const groups = data ? groupByPatient(data.rows) : [];
  const visibleExpandedPatientId = groups.some(
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
    }
    onSearchChange(value);
  };

  const colSpan = showFinance ? 9 : 7;

  return (
    <Card data-testid="card-operational-report">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">
          التقرير التشغيلي ({groups.length} مريض)
        </CardTitle>
        <div className="flex gap-2 print:hidden flex-wrap">
          <Button
            variant="default"
            size="sm"
            className="btn-primary"
            onClick={() => setShowNewRecord((v) => !v)}
            data-testid="button-add-new-record"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة سجل</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() => window.open(operationalExportUrl(filters), "_blank")}
            data-testid="button-export-operational"
          >
            <Download className="h-4 w-4" />
            <span>تصدير CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() => window.print()}
            data-testid="button-print-operational"
          >
            <Printer className="h-4 w-4" />
            <span>طباعة</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-3 print:hidden">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="ابحث باسم المريض، رقم الملف أو رقم الجوال..."
              aria-label="البحث في التقرير التشغيلي"
              data-testid="input-operational-search"
              className="h-10 w-full pr-10 pl-10"
            />
            {searchValue && (
              isFetching ? (
                <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onSearchChange("")}
                  aria-label="مسح البحث"
                  data-testid="button-clear-operational-search"
                  className="absolute left-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
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
            تعذر تحميل التقرير التشغيلي. حاول تحديث الصفحة.
          </p>
        ) : (
          <>
            {/* Inline new record form */}
            {showNewRecord && (
              <div className="border-b border-border">
                <InlineNewRecord
                  onClose={() => setShowNewRecord(false)}
                  onSuccess={() => setShowNewRecord(false)}
                />
              </div>
            )}

            {!data || groups.length === 0 ? (
              !showNewRecord && (
                <p className="text-sm text-muted-foreground px-6 pb-5 pt-4">
                  {searchValue.trim()
                    ? "لا توجد نتائج مطابقة للبحث."
                    : "لا توجد حالات مطابقة للفلاتر المحددة."}
                </p>
              )
            ) : (
              <>
                {/* Desktop table (hidden on mobile) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-3 font-medium text-muted-foreground">المريض</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">رقم الملف</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">حالة الحالة</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">الطبيب المعالج</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">الزرعات</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">الأنظمة</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">المتابعة القادمة</th>
                        {showFinance && (
                          <>
                            <th className="px-4 py-3 font-medium text-muted-foreground">المتبقي</th>
                            <th className="px-4 py-3 font-medium text-muted-foreground">حالة السداد</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group) => (
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
                  {groups.map((group) => (
                    <PatientCard
                      key={group.patientId}
                      group={group}
                      showFinance={showFinance}
                      expanded={expandedPatientId === group.patientId}
                      onToggle={() => handleToggle(group.patientId)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
