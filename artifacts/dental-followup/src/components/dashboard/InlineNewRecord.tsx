import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FDI_SITES,
  CASE_STATUSES,
  IMPLANT_STATUSES,
  FOLLOWUP_TYPES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  DEFAULT_TREATING_DOCTOR,
  normalizeMobile,
  type QuickEntryInput,
} from "@workspace/shared";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import { useImplantOptions } from "@/hooks/use-implant-cases";
import { useAssignableUsers } from "@/hooks/use-followups";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useAppSettings } from "@/hooks/use-settings";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  OperationalDatePicker,
  OperationalDateTimeFields,
} from "./OperationalDatePicker";

/* ------------------------------------------------------------------ */
/* Internal form schema (more permissive than API schema — API validates)
/* ------------------------------------------------------------------ */

const formSchema = z.object({
  // Patient
  fileNumber: z.string().min(1, "رقم الملف مطلوب"),
  fullName: z.string().min(1, "اسم المريض مطلوب"),
  mobileNumber: z.string().optional(),
  age: z.string().optional(),

  // Case (optional)
  includeCase: z.boolean(),
  procedureDate: z.string().optional(),
  treatingDoctor: z.string(),
  caseStatus: z.string(),
  prosValue: z.string().optional(),
  expectedProstheticDate: z.string().optional(),
  generalNote: z.string().optional(),

  // Implants
  implants: z.array(z.object({
    site: z.string().min(1, "الموقع مطلوب"),
    system: z.string().optional(),
    diameter: z.string().optional(),
    length: z.string().optional(),
    qValue: z.string().optional(),
    formerValue: z.string().optional(),
    graftValue: z.string().optional(),
    implantStatus: z.string(),
    implantNote: z.string().optional(),
  })),

  // Finance
  includePayment: z.boolean(),
  baseTreatmentAmount: z.string().optional(),
  paymentAmount: z.string().optional(),
  paymentDate: z.string().optional(),
  paymentLabel: z.string().optional(),
  paymentMethod: z.string().optional(),

  // Follow-up
  includeFollowup: z.boolean(),
  followupType: z.string().optional(),
  followupScheduledAt: z.string().optional(),
  followupNote: z.string().optional(),
  followupAssignedUserId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/* ------------------------------------------------------------------ */
/* Section toggle header                                               */
/* ------------------------------------------------------------------ */

function SectionHeader({
  title,
  open,
  onToggle,
  optional,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  optional?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 px-4 bg-muted/50 hover:bg-muted rounded-lg text-sm font-semibold transition-colors"
    >
      <span>
        {title}
        {optional && <span className="text-muted-foreground font-normal mr-2">(اختياري)</span>}
      </span>
      {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function InlineNewRecord({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const quickEntry = useQuickEntry();
  const { data: implantOptions } = useImplantOptions();
  const { data: assignableUsers } = useAssignableUsers();
  const { settings: appSettings } = useAppSettings();
  const canRecordPayments = user?.role === "ADMIN" || user?.canRecordPayments;
  const canViewFinancials = user?.role === "ADMIN" || user?.canViewFinancials;
  const today = todayIso();

  // Section open states
  const [caseOpen, setCaseOpen] = useState(true);
  const [implantsOpen, setImplantsOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);

  const defaultDoctor =
    appSettings?.defaultTreatingDoctor ?? DEFAULT_TREATING_DOCTOR;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fileNumber: "",
      fullName: "",
      mobileNumber: "",
      age: "",
      includeCase: true,
      procedureDate: "",
      treatingDoctor: defaultDoctor,
      caseStatus: "حالة جديدة",
      prosValue: "",
      expectedProstheticDate: "",
      generalNote: "",
      implants: [],
      includePayment: false,
      baseTreatmentAmount: "",
      paymentAmount: "",
      paymentDate: today,
      paymentLabel: "دفعة أولى",
      paymentMethod: "نقدي",
      includeFollowup: false,
      followupType: "متابعة بعد العملية",
      followupScheduledAt: "",
      followupNote: "",
      followupAssignedUserId: "__none__",
    },
  });

  const { fields: implantFields, append: appendImplant, remove: removeImplant } = useFieldArray({
    control: form.control,
    name: "implants",
  });

  const includeCase = form.watch("includeCase");
  const includePayment = form.watch("includePayment");
  const includeFollowup = form.watch("includeFollowup");

  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ patientId?: string; code: string } | null>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to error banner whenever a server error appears
  useEffect(() => {
    if (serverError && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [serverError]);

  // Scroll to first invalid field when client-side validation fails
  const onInvalid = () => {
    setTimeout(() => {
      const firstInvalid = document.querySelector<HTMLElement>(
        "#qe-form [aria-invalid='true'], #qe-form .text-destructive:not(span)"
      );
      firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setDuplicateInfo(null);

    // Mobile validation
    if (values.mobileNumber) {
      const mobileRes = normalizeMobile(values.mobileNumber);
      if (!mobileRes.ok) {
        form.setError("mobileNumber", { message: mobileRes.message });
        return;
      }
    }

    // Followup date required when section is included
    if (values.includeFollowup && !values.followupScheduledAt) {
      form.setError("followupScheduledAt", { message: "موعد المتابعة مطلوب" });
      setFollowupOpen(true);
      setTimeout(() => {
        document.getElementById("qe-followupScheduledAt")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }

    // Build patient input
    const patientInput: QuickEntryInput["patient"] = {
      fileNumber: values.fileNumber,
      fullName: values.fullName,
      mobileNumber: values.mobileNumber || null,
      age: values.age ? parseInt(values.age, 10) : null,
      administrativeNote: null,
    };

    // Build case input
    const caseInput: QuickEntryInput["case"] = values.includeCase
      ? {
          procedureDate: values.procedureDate || null,
          treatingDoctor: values.treatingDoctor || defaultDoctor,
          referringDoctor: null,
          caseStatus: values.caseStatus as NonNullable<QuickEntryInput["case"]>["caseStatus"],
          prosValue: values.prosValue || null,
          expectedProstheticDate: values.expectedProstheticDate || null,
          generalNote: values.generalNote || null,
          legacyCostNote: null,
          isReimplantation: false,
          reimplantationReason: null,
          sourceCaseId: null,
        }
      : undefined;

    // Build implants
    const implants: QuickEntryInput["implants"] = values.includeCase
      ? values.implants
          .filter((i) => i.site)
          .map((i) => ({
            site: i.site as typeof FDI_SITES[number],
            system: i.system || null,
            diameter: i.diameter ? parseFloat(i.diameter) : null,
            length: i.length ? parseFloat(i.length) : null,
            qValue: i.qValue || null,
            formerValue: i.formerValue || null,
            graftValue: i.graftValue || null,
            graftProcedureType: null,
            graftNote: null,
            implantStatus: (i.implantStatus || "مزروعة") as NonNullable<QuickEntryInput["implants"]>[number]["implantStatus"],
            implantNote: i.implantNote || null,
            procedureTags: [],
          }))
      : [];

    // Build payment
    let initialPayment: QuickEntryInput["initialPayment"] = undefined;
    let baseTreatmentAmount: number | undefined = undefined;
    if (values.includeCase && values.includePayment && canRecordPayments) {
      if (values.baseTreatmentAmount) {
        baseTreatmentAmount = parseFloat(values.baseTreatmentAmount);
      }
      if (values.paymentAmount && parseFloat(values.paymentAmount) > 0) {
        initialPayment = {
          amount: parseFloat(values.paymentAmount),
          paymentDate: values.paymentDate || today,
          paymentLabel: (values.paymentLabel || "دفعة أولى") as NonNullable<QuickEntryInput["initialPayment"]>["paymentLabel"],
          paymentMethod: (values.paymentMethod || "نقدي") as NonNullable<QuickEntryInput["initialPayment"]>["paymentMethod"],
          referenceNumber: null,
          note: null,
        };
      }
    }

    // Build followup
    let followup: QuickEntryInput["followup"] = undefined;
    if (values.includeCase && values.includeFollowup && values.followupScheduledAt) {
      followup = {
        followupType: values.followupType as NonNullable<QuickEntryInput["followup"]>["followupType"],
        scheduledAt: values.followupScheduledAt,
        requiresContact: false,
        contactDueAt: null,
        nextAppointmentAt: null,
        note: values.followupNote || null,
        assignedUserId:
          values.followupAssignedUserId && values.followupAssignedUserId !== "__none__"
            ? values.followupAssignedUserId
            : null,
      };
    }

    const input: QuickEntryInput = {
      patient: patientInput,
      case: caseInput,
      implants,
      baseTreatmentAmount,
      initialPayment,
      followup,
    };

    quickEntry.mutate(input, {
      onSuccess: (res) => {
        toast({ title: "تم حفظ السجل بنجاح" });
        onSuccess();
        setLocation(`/patients/${res.patient.id}`);
      },
      onError: (err) => {
        const apiErr = err instanceof ApiError ? err : undefined;
        if (apiErr?.code === "DUPLICATE_ACTIVE" || apiErr?.code === "DUPLICATE_ARCHIVED") {
          setDuplicateInfo({
            patientId: (apiErr.data as { patientId?: string } | undefined)?.patientId,
            code: apiErr.code,
          });
          setServerError(apiErr.message);
        } else {
          setServerError(apiErr?.message ?? err.message ?? "حدث خطأ أثناء الحفظ.");
        }
      },
    });
  };

  const addImplant = () => {
    appendImplant({
      site: "",
      system: "",
      diameter: "",
      length: "",
      qValue: "",
      formerValue: "",
      graftValue: "",
      implantStatus: "مزروعة",
      implantNote: "",
    });
  };

  return (
    <div className="p-4 md:p-6 bg-card border-b border-border" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">إضافة سجل جديد</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {serverError && (
        <div ref={errorBannerRef} className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {serverError}
          {duplicateInfo?.patientId && (
            <button
              type="button"
              className="mr-2 underline hover:no-underline"
              onClick={() => setLocation(`/patients/${duplicateInfo.patientId}`)}
            >
              فتح الملف
            </button>
          )}
        </div>
      )}

      <form id="qe-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">

        {/* Section 1: بيانات المريض */}
        <div className="space-y-3">
          <SectionHeader title="١. بيانات المريض" open={true} onToggle={() => {}} />
          <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="qe-fileNumber">
                رقم الملف <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qe-fileNumber"
                {...form.register("fileNumber")}
                placeholder="مثال: 1001"
                dir="ltr"
                className="text-right"
                data-testid="qe-fileNumber"
              />
              {form.formState.errors.fileNumber && (
                <p className="text-xs text-destructive">{form.formState.errors.fileNumber.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="qe-fullName">
                اسم المريض <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qe-fullName"
                {...form.register("fullName")}
                placeholder="الاسم الكامل"
                data-testid="qe-fullName"
              />
              {form.formState.errors.fullName && (
                <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="qe-mobile">رقم الجوال (اختياري)</Label>
              <Input
                id="qe-mobile"
                {...form.register("mobileNumber")}
                placeholder="05XXXXXXXX"
                dir="ltr"
                className="text-right"
              />
              {form.formState.errors.mobileNumber && (
                <p className="text-xs text-destructive">{form.formState.errors.mobileNumber.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="qe-age">العمر (اختياري)</Label>
              <Input
                id="qe-age"
                {...form.register("age")}
                type="number"
                placeholder="العمر"
                min={0}
                max={130}
              />
            </div>
          </div>
        </div>

        {/* Section 2: حالة الزراعة (optional) */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <SectionHeader
              title="٢. حالة الزراعة"
              open={caseOpen}
              onToggle={() => setCaseOpen((v) => !v)}
              optional
            />
            <div className="flex items-center gap-2 shrink-0">
              <Checkbox
                id="qe-includeCase"
                checked={includeCase}
                onCheckedChange={(v) => form.setValue("includeCase", !!v)}
              />
              <Label htmlFor="qe-includeCase" className="text-sm cursor-pointer">تضمين</Label>
            </div>
          </div>
          {includeCase && caseOpen && (
            <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>تاريخ العملية</Label>
                <OperationalDatePicker
                  value={form.watch("procedureDate") ?? ""}
                  onChange={(value) => form.setValue("procedureDate", value, { shouldDirty: true, shouldValidate: true })}
                />
              </div>
              <div className="space-y-1">
                <Label>الطبيب المعالج</Label>
                <Input {...form.register("treatingDoctor")} placeholder={defaultDoctor} />
              </div>
              <div className="space-y-1">
                <Label>حالة الحالة</Label>
                <Select
                  dir="rtl"
                  value={form.watch("caseStatus")}
                  onValueChange={(v) => form.setValue("caseStatus", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>مدة التركيب (Pros)</Label>
                <Input {...form.register("prosValue")} placeholder="مثال: 3M" />
              </div>
              <div className="space-y-1">
                <Label>تاريخ التركيب المتوقع</Label>
                <OperationalDatePicker
                  value={form.watch("expectedProstheticDate") ?? ""}
                  onChange={(value) => form.setValue("expectedProstheticDate", value, { shouldDirty: true, shouldValidate: true })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>ملاحظة</Label>
                <Textarea {...form.register("generalNote")} rows={2} className="resize-none" placeholder="ملاحظات عامة..." />
              </div>
            </div>
          )}
        </div>

        {/* Section 3: الزرعات (optional) */}
        {includeCase && (
          <div className="space-y-3">
            <SectionHeader
              title="٣. الزرعات"
              open={implantsOpen}
              onToggle={() => setImplantsOpen((v) => !v)}
              optional
            />
            {implantsOpen && (
              <div className="px-1 space-y-3">
                {implantFields.map((field, index) => (
                  <div key={field.id} className="border border-border rounded-xl p-3 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">زرعة {index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeImplant(index)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">الموقع (FDI) <span className="text-destructive">*</span></Label>
                        <Select
                          dir="ltr"
                          value={form.watch(`implants.${index}.site`)}
                          onValueChange={(v) => form.setValue(`implants.${index}.site`, v)}
                        >
                          <SelectTrigger className="text-right h-8 text-sm">
                            <SelectValue placeholder="اختر" />
                          </SelectTrigger>
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
                        <Label className="text-xs">النظام (System)</Label>
                        <Select
                          dir="rtl"
                          value={form.watch(`implants.${index}.system`) || "__none__"}
                          onValueChange={(v) => form.setValue(`implants.${index}.system`, v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {(implantOptions?.systems ?? []).map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">القطر (Diameter)</Label>
                        <Input
                          className="h-8 text-sm"
                          type="number"
                          step="0.1"
                          placeholder="3.5"
                          {...form.register(`implants.${index}.diameter`)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الطول (Length)</Label>
                        <Input
                          className="h-8 text-sm"
                          type="number"
                          step="0.1"
                          placeholder="10"
                          {...form.register(`implants.${index}.length`)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Q</Label>
                        <Select
                          dir="rtl"
                          value={form.watch(`implants.${index}.qValue`) || "__none__"}
                          onValueChange={(v) => form.setValue(`implants.${index}.qValue`, v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {(implantOptions?.qValues ?? []).map((v) => (
                              <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Former</Label>
                        <Select
                          dir="rtl"
                          value={form.watch(`implants.${index}.formerValue`) || "__none__"}
                          onValueChange={(v) => form.setValue(`implants.${index}.formerValue`, v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {(implantOptions?.formerValues ?? []).map((v) => (
                              <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Graft</Label>
                        <Select
                          dir="rtl"
                          value={form.watch(`implants.${index}.graftValue`) || "__none__"}
                          onValueChange={(v) => form.setValue(`implants.${index}.graftValue`, v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {(implantOptions?.graftValues ?? []).map((v) => (
                              <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الحالة</Label>
                        <Select
                          dir="rtl"
                          value={form.watch(`implants.${index}.implantStatus`)}
                          onValueChange={(v) => form.setValue(`implants.${index}.implantStatus`, v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPLANT_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addImplant}
                  data-testid="qe-add-implant"
                >
                  <Plus className="h-3.5 w-3.5" />
                  إضافة زرعة
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Section 4: المالية
            Visibility rules (per spec):
            - Section is visible when canViewFinancials (includes ADMIN)
            - Base treatment amount: canViewFinancials only
            - Payment fields (amount/date/label/method): canRecordPayments only
        */}
        {includeCase && canViewFinancials && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SectionHeader
                title="٤. المالية"
                open={financeOpen}
                onToggle={() => setFinanceOpen((v) => !v)}
                optional
              />
              {canRecordPayments && (
                <div className="flex items-center gap-2 shrink-0">
                  <Checkbox
                    id="qe-includePayment"
                    checked={includePayment}
                    onCheckedChange={(v) => {
                      form.setValue("includePayment", Boolean(v));
                      if (v) setFinanceOpen(true);
                    }}
                  />
                  <Label htmlFor="qe-includePayment" className="text-sm cursor-pointer">تضمين دفعة</Label>
                </div>
              )}
            </div>
            {financeOpen && (
              <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Base treatment amount — canViewFinancials */}
                <div className="space-y-1">
                  <Label>مبلغ العلاج الأساسي (ر.س)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0"
                    {...form.register("baseTreatmentAmount")}
                  />
                </div>
                {/* Payment fields — canRecordPayments only */}
                {canRecordPayments && includePayment && (
                <div className="space-y-1">
                  <Label>مبلغ الدفعة الأولى (ر.س)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0"
                    {...form.register("paymentAmount")}
                    data-testid="qe-paymentAmount"
                  />
                </div>
                )}
                {canRecordPayments && includePayment && (
                <>
                  <div className="space-y-1">
                    <Label>تاريخ الدفعة</Label>
                    <OperationalDatePicker
                      value={form.watch("paymentDate") ?? ""}
                      onChange={(value) => form.setValue("paymentDate", value, { shouldDirty: true, shouldValidate: true })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>وصف الدفعة</Label>
                    <Select
                      dir="rtl"
                      value={form.watch("paymentLabel") || "دفعة أولى"}
                      onValueChange={(v) => form.setValue("paymentLabel", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_LABELS.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>طريقة الدفع</Label>
                    <Select
                      dir="rtl"
                      value={form.watch("paymentMethod") || "نقدي"}
                      onValueChange={(v) => form.setValue("paymentMethod", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Section 5: المتابعة (optional) */}
        {includeCase && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SectionHeader
                title="٥. المتابعة"
                open={followupOpen}
                onToggle={() => setFollowupOpen((v) => !v)}
                optional
              />
              <div className="flex items-center gap-2 shrink-0">
                <Checkbox
                  id="qe-includeFollowup"
                  checked={includeFollowup}
                  onCheckedChange={(v) => {
                    form.setValue("includeFollowup", Boolean(v));
                    if (v) setFollowupOpen(true);
                  }}
                />
                <Label htmlFor="qe-includeFollowup" className="text-sm cursor-pointer">تضمين</Label>
              </div>
            </div>
            {includeFollowup && followupOpen && (
              <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>نوع المتابعة</Label>
                  <Select
                    dir="rtl"
                    value={form.watch("followupType") || "متابعة بعد العملية"}
                    onValueChange={(v) => form.setValue("followupType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOLLOWUP_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <OperationalDateTimeFields
                  id="qe-followupScheduledAt"
                  required
                  aria-invalid={!!form.formState.errors.followupScheduledAt}
                  value={form.watch("followupScheduledAt") ?? ""}
                  onChange={(value) => form.setValue("followupScheduledAt", value, { shouldDirty: true, shouldValidate: true })}
                />
                {form.formState.errors.followupScheduledAt && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.followupScheduledAt.message}
                  </p>
                )}
                <div className="space-y-1">
                  <Label>المسؤول</Label>
                  <Select
                    dir="rtl"
                    value={form.watch("followupAssignedUserId") || "__none__"}
                    onValueChange={(v) => form.setValue("followupAssignedUserId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="غير محدد" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">غير محدد</SelectItem>
                      {(assignableUsers ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>ملاحظة</Label>
                  <Textarea
                    {...form.register("followupNote")}
                    rows={2}
                    className="resize-none"
                    placeholder="ملاحظات المتابعة..."
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-border/60">
          <Button
            type="submit"
            className="btn-primary"
            disabled={quickEntry.isPending}
            data-testid="qe-submit"
          >
            {quickEntry.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                حفظ السجل
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={quickEntry.isPending}>
            إلغاء
          </Button>
        </div>
      </form>
    </div>
  );
}
