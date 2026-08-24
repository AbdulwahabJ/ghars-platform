import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
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
  addCalendarMonths,
  normalizeMobile,
  splitInstallmentAmount,
  type QuickEntryInput,
} from "@workspace/shared";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import { useImplantOptions } from "@/hooks/use-implant-cases";
import { useAssignableUsers } from "@/hooks/use-followups";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useAppSettings } from "@/hooks/use-settings";
import { ApiError } from "@/lib/api";
import { formatMoney, todayIso } from "@/lib/money";
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
import { ExpectedProstheticDateField } from "@/components/implants/ExpectedProstheticDateField";

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
  boneGraftProcedures: z.array(z.object({
    procedureDate: z.string().optional(),
    procedureType: z.string().optional(),
    implantIndex: z.string().optional(),
    site: z.string().optional(),
    material: z.string().optional(),
    membrane: z.string().optional(),
    procedureStatus: z.string().optional(),
    note: z.string().optional(),
  })),

  // Finance
  includePayment: z.boolean(),
  baseTreatmentAmount: z.string().optional(),
  includeInstallmentPlan: z.boolean(),
  installmentTotalAmount: z.string().optional(),
  installmentCount: z.string().optional(),
  installmentFirstDueDate: z.string().optional(),
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

type FormErrorDetail = {
  path: string;
  label: string;
  message: string;
};

const FIELD_LABELS: Record<string, string> = {
  fileNumber: "رقم الملف",
  fullName: "اسم المريض",
  mobileNumber: "رقم الجوال",
  age: "العمر",
  procedureDate: "تاريخ العملية",
  treatingDoctor: "الطبيب المعالج",
  caseStatus: "حالة الحالة",
  prosValue: "مدة التركيب",
  expectedProstheticDate: "تاريخ التركيب المتوقع",
  generalNote: "ملاحظة الحالة",
  baseTreatmentAmount: "مبلغ العلاج الأساسي",
  installmentTotalAmount: "مبلغ التقسيط",
  installmentCount: "عدد الدفعات",
  installmentFirstDueDate: "أول استحقاق",
  paymentAmount: "مبلغ الدفعة الأولى",
  paymentDate: "تاريخ الدفعة",
  paymentLabel: "وصف الدفعة",
  paymentMethod: "طريقة الدفع",
  followupType: "نوع المتابعة",
  followupScheduledAt: "موعد المتابعة (التاريخ والوقت)",
  followupAssignedUserId: "مسؤول المتابعة",
  followupNote: "ملاحظة المتابعة",
  site: "موقع الزرعة (FDI)",
  system: "نظام الزرعة",
  diameter: "قطر الزرعة",
  length: "طول الزرعة",
  qValue: "قيمة Q",
  formerValue: "قيمة Former",
  graftValue: "قيمة Graft",
  implantStatus: "حالة الزرعة",
  implantNote: "ملاحظة الزرعة",
};

function fieldLabel(path: string): string {
  const implantPath = /^implants\.(\d+)\.(.+)$/.exec(path);
  if (implantPath) {
    const field = FIELD_LABELS[implantPath[2]] ?? implantPath[2];
    return `الزرعة ${Number(implantPath[1]) + 1}: ${field}`;
  }
  const apiPathAliases: Record<string, string> = {
    "patient.fileNumber": "رقم الملف",
    "patient.fullName": "اسم المريض",
    "patient.mobileNumber": "رقم الجوال",
    "patient.age": "العمر",
    "case.procedureDate": "تاريخ العملية",
    "case.treatingDoctor": "الطبيب المعالج",
    "case.caseStatus": "حالة الحالة",
    "initialPayment.amount": "مبلغ الدفعة الأولى",
    "initialPayment.paymentDate": "تاريخ الدفعة",
    "initialPayment.paymentLabel": "وصف الدفعة",
    "initialPayment.paymentMethod": "طريقة الدفع",
    "followup.followupType": "نوع المتابعة",
    "followup.scheduledAt": "موعد المتابعة (التاريخ والوقت)",
    "followup.assignedUserId": "مسؤول المتابعة",
  };
  return apiPathAliases[path] ?? FIELD_LABELS[path] ?? (path || "البيانات العامة");
}

function collectFormErrors(node: unknown, path = ""): FormErrorDetail[] {
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  if (typeof record.message === "string") {
    return [{ path, label: fieldLabel(path), message: record.message }];
  }

  return Object.entries(record).flatMap(([key, value]) => {
    if (key === "ref" || key === "types") return [];
    return collectFormErrors(value, path ? `${path}.${key}` : key);
  });
}

function collectApiErrors(error: ApiError | undefined): FormErrorDetail[] {
  if (!error || !error.data || typeof error.data !== "object") return [];
  const details = (error.data as { details?: unknown }).details;
  if (!Array.isArray(details)) return [];

  return details.flatMap((detail) => {
    if (!detail || typeof detail !== "object") return [];
    const item = detail as { path?: unknown; message?: unknown };
    if (typeof item.message !== "string") return [];
    const path = Array.isArray(item.path)
      ? item.path.map(String).join(".")
      : typeof item.path === "string"
        ? item.path
        : "";
    return [{ path, label: fieldLabel(path), message: item.message }];
  });
}

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
      boneGraftProcedures: [],
      includePayment: false,
      baseTreatmentAmount: "",
      includeInstallmentPlan: false,
      installmentTotalAmount: "",
      installmentCount: "3",
      installmentFirstDueDate: today,
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
  const {
    fields: boneGraftProcedureFields,
    append: appendBoneGraftProcedure,
    remove: removeBoneGraftProcedure,
  } = useFieldArray({
    control: form.control,
    name: "boneGraftProcedures",
  });

  const includeCase = form.watch("includeCase");
  const includePayment = form.watch("includePayment");
  const includeInstallmentPlan = form.watch("includeInstallmentPlan");
  const baseTreatmentAmountValue = form.watch("baseTreatmentAmount");
  const installmentTotalAmount = form.watch("installmentTotalAmount");
  const installmentCount = form.watch("installmentCount");
  const installmentFirstDueDate = form.watch("installmentFirstDueDate");
  const includeFollowup = form.watch("includeFollowup");

  const scheduledInstallmentAmount = Number(
    installmentTotalAmount || baseTreatmentAmountValue,
  );
  const scheduledInstallmentCount = Number(installmentCount);
  const installmentPreview =
    includeInstallmentPlan &&
    Number.isFinite(scheduledInstallmentAmount) &&
    scheduledInstallmentAmount > 0 &&
    Number.isInteger(scheduledInstallmentCount) &&
    scheduledInstallmentCount >= 1 &&
    scheduledInstallmentCount <= 60
      ? splitInstallmentAmount(scheduledInstallmentAmount, scheduledInstallmentCount).map(
          (amount, index) => ({
            amount,
            date: addCalendarMonths(installmentFirstDueDate || today, index),
          }),
        )
      : [];

  const [serverError, setServerError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<FormErrorDetail[]>([]);
  const [duplicateInfo, setDuplicateInfo] = useState<{ patientId?: string; code: string } | null>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to error banner whenever a server error appears
  useEffect(() => {
    if (serverError && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [serverError]);

  // Scroll to first invalid field when client-side validation fails
  const onInvalid = (errors: FieldErrors<FormValues>) => {
    const details = collectFormErrors(errors);
    setServerError("تعذر حفظ السجل. راجع الحقول المحددة أدناه.");
    setValidationErrors(details);
    setTimeout(() => {
      const firstInvalid = document.querySelector<HTMLElement>(
        "#qe-form [aria-invalid='true'], #qe-form .text-destructive:not(span)"
      );
      firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setValidationErrors([]);
    setDuplicateInfo(null);

    // Mobile validation
    if (values.mobileNumber) {
      const mobileRes = normalizeMobile(values.mobileNumber);
      if (!mobileRes.ok) {
        form.setError("mobileNumber", { message: mobileRes.message });
        setServerError("تعذر حفظ السجل. يوجد خطأ في الحقل التالي:");
        setValidationErrors([{
          path: "mobileNumber",
          label: fieldLabel("mobileNumber"),
          message: mobileRes.message,
        }]);
        return;
      }
    }

    // Followup date required when section is included
    if (values.includeFollowup && !values.followupScheduledAt) {
      form.setError("followupScheduledAt", { message: "موعد المتابعة مطلوب" });
      setServerError("تعذر حفظ السجل. يوجد حقل مطلوب لم يتم تعبئته:");
      setValidationErrors([{
        path: "followupScheduledAt",
        label: fieldLabel("followupScheduledAt"),
        message: "موعد المتابعة مطلوب",
      }]);
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

    const boneGraftProcedures: QuickEntryInput["boneGraftProcedures"] =
      values.includeCase
        ? values.boneGraftProcedures
            .filter((procedure) => procedure.procedureType?.trim())
            .map((procedure) => ({
              procedureDate: procedure.procedureDate || today,
              procedureType: procedure.procedureType!.trim(),
              implantIndex: procedure.implantIndex ? Number(procedure.implantIndex) : undefined,
              site: procedure.site || null,
              material: procedure.material || null,
              membrane: procedure.membrane || null,
              quantity: null,
              size: null,
              treatingDoctor: values.treatingDoctor || defaultDoctor,
              procedureStatus: procedure.procedureStatus || "مخطط",
              note: procedure.note || null,
            }))
        : [];

    // Build payment
    let initialPayment: QuickEntryInput["initialPayment"] = undefined;
    let installmentPlan: QuickEntryInput["installmentPlan"] = undefined;
    let baseTreatmentAmount: number | undefined = undefined;
    if (values.includeCase && canViewFinancials) {
      if (values.baseTreatmentAmount) {
        baseTreatmentAmount = parseFloat(values.baseTreatmentAmount);
      }
      if (values.includeInstallmentPlan) {
        const scheduledAmount = values.installmentTotalAmount
          ? parseFloat(values.installmentTotalAmount)
          : baseTreatmentAmount;
        const installmentCount = Number(values.installmentCount);
        if (!scheduledAmount || scheduledAmount <= 0) {
          setServerError("تعذر حفظ السجل. أدخل مبلغ العلاج أو مبلغ التقسيط.");
          setValidationErrors([{
            path: "installmentTotalAmount",
            label: fieldLabel("installmentTotalAmount"),
            message: "مبلغ التقسيط مطلوب عند تفعيل التقسيط.",
          }]);
          setFinanceOpen(true);
          return;
        }
        if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 60) {
          setServerError("تعذر حفظ السجل. عدد الدفعات يجب أن يكون بين 1 و60.");
          setValidationErrors([{
            path: "installmentCount",
            label: fieldLabel("installmentCount"),
            message: "عدد الدفعات يجب أن يكون بين 1 و60.",
          }]);
          setFinanceOpen(true);
          return;
        }
        if (!baseTreatmentAmount || scheduledAmount > baseTreatmentAmount) {
          setServerError("تعذر حفظ السجل. مبلغ التقسيط لا يمكن أن يتجاوز مبلغ العلاج.");
          setValidationErrors([{
            path: "installmentTotalAmount",
            label: fieldLabel("installmentTotalAmount"),
            message: "مبلغ التقسيط لا يمكن أن يتجاوز مبلغ العلاج الأساسي.",
          }]);
          setFinanceOpen(true);
          return;
        }
        installmentPlan = {
          totalAmount: scheduledAmount,
          installmentCount,
          firstDueDate: values.installmentFirstDueDate || today,
        };
      }
      if (values.includePayment && canRecordPayments && values.paymentAmount && parseFloat(values.paymentAmount) > 0) {
        initialPayment = {
          amount: parseFloat(values.paymentAmount),
          installmentId: null,
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
      boneGraftProcedures,
      baseTreatmentAmount,
      initialPayment,
      installmentPlan,
      followup,
    };

    quickEntry.mutate(input, {
      onSuccess: () => {
        toast({ title: "تم حفظ السجل بنجاح" });
        onSuccess();
      },
      onError: (err) => {
        const apiErr = err instanceof ApiError ? err : undefined;
          const apiDetails = collectApiErrors(apiErr);
        if (apiErr?.code === "DUPLICATE_ACTIVE" || apiErr?.code === "DUPLICATE_ARCHIVED") {
          setDuplicateInfo({
            patientId: (apiErr.data as { patientId?: string } | undefined)?.patientId,
            code: apiErr.code,
          });
            setServerError("تعذر حفظ السجل. رقم الملف مستخدم مسبقًا:");
            setValidationErrors([{
              path: "fileNumber",
              label: fieldLabel("fileNumber"),
              message: apiErr.message,
            }]);
          } else if (apiDetails.length > 0) {
            setServerError("تعذر حفظ السجل. راجع الحقول المحددة أدناه:");
            setValidationErrors(apiDetails);
          } else if (apiErr?.code === "INVALID_MOBILE") {
            setServerError("تعذر حفظ السجل. يوجد خطأ في الحقل التالي:");
            setValidationErrors([{
              path: "mobileNumber",
              label: fieldLabel("mobileNumber"),
              message: apiErr.message,
            }]);
        } else {
          setServerError(apiErr?.message ?? err.message ?? "حدث خطأ أثناء الحفظ.");
            setValidationErrors([]);
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

      {(serverError || validationErrors.length > 0) && (
        <div ref={errorBannerRef} className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {serverError && <p className="font-medium">{serverError}</p>}
          {validationErrors.length > 0 && (
            <ul className="mt-2 space-y-1 list-disc pr-5">
              {validationErrors.map((error, index) => (
                <li key={`${error.path}-${index}`}>
                  <strong>{error.label}:</strong> {error.message}
                </li>
              ))}
            </ul>
          )}
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
                aria-invalid={!!form.formState.errors.fileNumber}
                className={`text-right ${form.formState.errors.fileNumber ? "border-destructive focus-visible:ring-destructive" : ""}`}
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
                aria-invalid={!!form.formState.errors.fullName}
                className={form.formState.errors.fullName ? "border-destructive focus-visible:ring-destructive" : ""}
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
                aria-invalid={!!form.formState.errors.mobileNumber}
                className={`text-right ${form.formState.errors.mobileNumber ? "border-destructive focus-visible:ring-destructive" : ""}`}
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

        {/* Section 2: حالة الزراعة والزرعات (optional) */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <SectionHeader
              title="٢. حالة الزراعة والزرعات"
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
          {!includeCase && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠ المريض المضاف بدون حالة لن يظهر في الجدول التشغيلي؛ يمكن الوصول إليه عبر قسم المرضى.
            </p>
          )}
          {includeCase && caseOpen && (
            <div className="px-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <ExpectedProstheticDateField
                  procedureDate={form.watch("procedureDate") ?? ""}
                  expectedDate={form.watch("expectedProstheticDate") ?? ""}
                  onExpectedDateChange={(value) =>
                    form.setValue("expectedProstheticDate", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  className="sm:col-span-2"
                  idPrefix="quick-entry-expected-prosthetic"
                />
                <div className="space-y-1 sm:col-span-2">
                  <Label>ملاحظة</Label>
                  <Textarea {...form.register("generalNote")} rows={2} className="resize-none" placeholder="ملاحظات عامة..." />
                </div>
              </div>

              <div className="border-t border-border/60 pt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    الزرعات ({implantFields.length})
                  </p>
                </div>
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
                          <SelectTrigger
                            className={`text-right h-8 text-sm ${form.formState.errors.implants?.[index]?.site ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            aria-invalid={!!form.formState.errors.implants?.[index]?.site}
                          >
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
              <div className="border-t border-border/60 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted-foreground">
                    إجراءات زراعة العظم ({boneGraftProcedureFields.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">لا تؤثر في المبالغ أو الدفعات</p>
                </div>
                {boneGraftProcedureFields.map((field, index) => (
                  <div key={field.id} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between"><p className="text-sm font-medium">إجراء {index + 1}</p><Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeBoneGraftProcedure(index)}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1"><Label className="text-xs">تاريخ الإجراء</Label><OperationalDatePicker value={form.watch(`boneGraftProcedures.${index}.procedureDate`) || today} onChange={(value) => form.setValue(`boneGraftProcedures.${index}.procedureDate`, value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">نوع الإجراء</Label><Input {...form.register(`boneGraftProcedures.${index}.procedureType`)} placeholder="مثال: ترقيع عظمي" /></div>
                      <div className="space-y-1"><Label className="text-xs">الزرعة المرتبطة</Label><Select value={form.watch(`boneGraftProcedures.${index}.implantIndex`) || "__case__"} onValueChange={(value) => form.setValue(`boneGraftProcedures.${index}.implantIndex`, value === "__case__" ? "" : value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__case__">إجراء للحالة كاملة</SelectItem>{implantFields.map((implant, implantIndex) => <SelectItem key={implant.id} value={String(implantIndex)}>زرعة {implantIndex + 1}{form.watch(`implants.${implantIndex}.site`) ? ` — السن ${form.watch(`implants.${implantIndex}.site`)}` : ""}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label className="text-xs">الموضع</Label><Input {...form.register(`boneGraftProcedures.${index}.site`)} placeholder="مثال: المنطقة الخلفية" /></div>
                      <div className="space-y-1"><Label className="text-xs">المادة</Label><Input {...form.register(`boneGraftProcedures.${index}.material`)} placeholder="مثال: Bio-Oss / عظم ذاتي" /></div>
                      <div className="space-y-1"><Label className="text-xs">الغشاء</Label><Input {...form.register(`boneGraftProcedures.${index}.membrane`)} placeholder="مثال: غشاء كولاجين" /></div>
                      <div className="space-y-1"><Label className="text-xs">حالة الإجراء</Label><Input {...form.register(`boneGraftProcedures.${index}.procedureStatus`)} placeholder="مثال: تم / تحت المتابعة" /></div>
                      <div className="space-y-1 sm:col-span-2"><Label className="text-xs">ملاحظة</Label><Input {...form.register(`boneGraftProcedures.${index}.note`)} /></div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => appendBoneGraftProcedure({ procedureDate: today, procedureType: "", implantIndex: "", site: "", material: "", membrane: "", procedureStatus: "مخطط", note: "" })} data-testid="qe-add-bone-graft-procedure"><Plus className="h-3.5 w-3.5" />إضافة إجراء زراعة عظم</Button>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: المالية
            Visibility rules (per spec):
            - Section is visible when canViewFinancials (includes ADMIN)
            - Base treatment amount: canViewFinancials only
            - Payment fields (amount/date/label/method): canRecordPayments only
        */}
        {includeCase && canViewFinancials && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SectionHeader
                title="٣. المالية"
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
                <div className="space-y-1">
                  <Label className="flex items-center gap-2">
                    <Checkbox
                      id="qe-includeInstallmentPlan"
                      checked={includeInstallmentPlan}
                      onCheckedChange={(value) => {
                        form.setValue("includeInstallmentPlan", Boolean(value), {
                          shouldDirty: true,
                        });
                        if (value) setFinanceOpen(true);
                      }}
                    />
                    <span>تقسيط المبلغ</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    سيتم إنشاء جدول استحقاقات دون تغيير إجمالي الحالة أو الدفعات الفعلية.
                  </p>
                </div>
                {includeInstallmentPlan ? (
                  <div className="sm:col-span-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label>مبلغ التقسيط (ر.س)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0.01}
                          placeholder="يستخدم مبلغ العلاج تلقائيًا"
                          {...form.register("installmentTotalAmount")}
                          data-testid="qe-installment-total"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>عدد الدفعات</Label>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          step={1}
                          {...form.register("installmentCount")}
                          data-testid="qe-installment-count"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>أول استحقاق</Label>
                        <OperationalDatePicker
                          value={installmentFirstDueDate || today}
                          onChange={(value) =>
                            form.setValue("installmentFirstDueDate", value, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          data-testid="qe-installment-first-date"
                        />
                      </div>
                    </div>
                    {installmentPreview.length > 0 ? (
                      <div className="rounded-md bg-muted/50 p-2.5">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          معاينة جدول الدفعات
                        </p>
                        <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                          {installmentPreview.slice(0, 6).map((item, index) => (
                            <div key={`${item.date}-${index}`} className="flex justify-between gap-2">
                              <span>دفعة {index + 1}</span>
                              <span className="font-medium tabular-nums">
                                {formatMoney(item.amount)} — {item.date}
                              </span>
                            </div>
                          ))}
                        </div>
                        {installmentPreview.length > 6 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            + {installmentPreview.length - 6} دفعات أخرى
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        أدخل مبلغ العلاج وعدد الدفعات لعرض المعاينة.
                      </p>
                    )}
                  </div>
                ) : null}
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

        {/* Section 4: المتابعة (optional) */}
        {includeCase && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SectionHeader
                title="٤. المتابعة"
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
