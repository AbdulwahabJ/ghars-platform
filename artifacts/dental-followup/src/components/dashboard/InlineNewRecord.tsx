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
  ADJUNCT_PROCEDURE_CATEGORIES,
  PROCEDURE_SIDES,
  SINUS_LIFT_TYPES,
  type QuickEntryInput,
} from "@workspace/shared";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import { useImplantOptions } from "@/hooks/use-implant-cases";
import { useAssignableUsers } from "@/hooks/use-followups";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useAppSettings } from "@/hooks/use-settings";
import { ApiError } from "@/lib/api";
import {
  localizeErrorMessage,
  localizeValidationMessage,
} from "@/lib/localize-error";
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
import { FileDropzone, StagedFilesList } from "@/components/patients/attachments/StagedFilesList";
import { patientAttachmentMimeForFile, StagedFile, uploadFileWithProgress } from "@/components/patients/attachments/upload-utils";
import { PatientAttachmentCategory } from "@workspace/shared";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { useEnumTranslation } from "@/i18n/use-enum-translation";
import { finalizeDecimalInput, parseImplantDimension } from "@/lib/digits";

/* ------------------------------------------------------------------ */
/* Internal form schema (more permissive than API schema — API validates)
/* ------------------------------------------------------------------ */

const createFormSchema = (t: (key: string) => string) => z.object({
  // Patient
  fileNumber: z.string().min(1, t("validation.fileNumberRequired")),
  fullName: z.string().min(1, t("validation.fullNameRequired")),
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
    site: z.string().min(1, t("validation.siteRequired")),
    system: z.string().optional(),
    diameter: z.string().optional().refine((value) => !value || !Number.isNaN(parseImplantDimension(value)), t("validation.implantDimension")),
    length: z.string().optional().refine((value) => !value || !Number.isNaN(parseImplantDimension(value)), t("validation.implantDimension")),
    qValue: z.string().optional(),
    formerValue: z.string().optional(),
    graftValue: z.string().optional(),
    implantStatus: z.string(),
    implantNote: z.string().optional(),
  })),
  boneGraftProcedures: z.array(z.object({
    procedureDate: z.string().optional(),
    procedureCategory: z.enum(ADJUNCT_PROCEDURE_CATEGORIES).optional(),
    procedureType: z.string().optional(),
    implantIndex: z.string().optional(),
    procedureSide: z.string().optional(),
    liftType: z.string().optional(),
    site: z.string().optional(),
    material: z.string().optional(),
    membrane: z.string().optional(),
    quantity: z.string().optional(),
    size: z.string().optional(),
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

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

type FormErrorDetail = {
  path: string;
  label: string;
  message: string;
};

function fieldLabel(path: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const implantPath = /^implants\.(\d+)\.(.+)$/.exec(path);
  if (implantPath) {
    return t("errors.implantField", { number: Number(implantPath[1]) + 1, field: t(`fields.${implantPath[2]}`) });
  }
  const aliases: Record<string, string> = {
    "patient.fileNumber": "fileNumber", "patient.fullName": "fullName", "patient.mobileNumber": "mobileNumber",
    "patient.age": "age", "case.procedureDate": "procedureDate", "case.treatingDoctor": "treatingDoctor",
    "case.caseStatus": "caseStatus", "initialPayment.amount": "paymentAmount",
    "initialPayment.paymentDate": "paymentDate", "initialPayment.paymentLabel": "paymentLabel",
    "initialPayment.paymentMethod": "paymentMethod", "followup.followupType": "followupType",
    "followup.scheduledAt": "followupScheduledAt", "followup.assignedUserId": "followupAssignedUserId",
  };
  return path ? t(`fields.${aliases[path] ?? path}`) : t("fields.general");
}

function collectFormErrors(node: unknown, t: (key: string, options?: Record<string, unknown>) => string, path = ""): FormErrorDetail[] {
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  if (typeof record.message === "string") {
    return [{ path, label: fieldLabel(path, t), message: record.message }];
  }

  return Object.entries(record).flatMap(([key, value]) => {
    if (key === "ref" || key === "types") return [];
    return collectFormErrors(value, t, path ? `${path}.${key}` : key);
  });
}

function collectApiErrors(error: ApiError | undefined, t: (key: string, options?: Record<string, unknown>) => string): FormErrorDetail[] {
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
    return [{
      path,
      label: fieldLabel(path, t),
      message: localizeValidationMessage(item.message),
    }];
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
  optionalLabel,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  optional?: boolean;
  optionalLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 px-4 bg-muted/50 hover:bg-muted rounded-lg text-sm font-semibold transition-colors"
    >
      <span>
        {title}
        {optional && <span className="text-muted-foreground font-normal ms-2">({optionalLabel})</span>}
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
  const { t, i18n } = useTranslation("quickEntry");
  const { t: clinicalT } = useClinicalTranslation();
  const { enumLabel } = useEnumTranslation();
  const optionLabel = (value: string) => t(`options.${value}`, { defaultValue: value });
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
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  const defaultDoctor =
    appSettings?.defaultTreatingDoctor ?? DEFAULT_TREATING_DOCTOR;

  const form = useForm<FormValues>({
    resolver: zodResolver(createFormSchema(t)),
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

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const stagedFilesRef = useRef<StagedFile[]>([]);
  useEffect(() => { stagedFilesRef.current = stagedFiles; }, [stagedFiles]);
  useEffect(() => {
    return () => {
      stagedFilesRef.current.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  const handleAddFiles = (files: File[]) => {
    const newStaged = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      contentType: patientAttachmentMimeForFile(file)!,
      title: file.name,
      category: "OTHER" as PatientAttachmentCategory,
      note: "",
      fileDate: "",
      implantCaseId: null, // We'll link it after creation if case is created
      status: "idle" as const,
      progress: 0,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setStagedFiles((prev) => [...prev, ...newStaged]);
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const uploadAttachments = async (patientId: string, caseId: string | null) => {
    setIsUploadingAttachments(true);
    const uploadResults = await Promise.all(
      stagedFiles.map(async (stagedFile) => {
        if (stagedFile.status === "success") return true;

        setStagedFiles((prev) => prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "uploading", progress: 0, errorMessage: undefined } : f)));

        let objectPath = stagedFile.objectPath;
        let uploadToken = stagedFile.uploadToken;
        let uploadURL = "";

        // Link to case if it was created and user hasn't explicitly set it
        const linkedCaseId = stagedFile.implantCaseId || caseId;

        try {
          const reqRes = await api.requestAttachmentUploadUrl(patientId, {
            name: stagedFile.file.name,
            size: stagedFile.file.size,
            contentType: stagedFile.contentType,
            title: stagedFile.title,
            category: stagedFile.category,
            note: stagedFile.note,
            fileDate: stagedFile.fileDate ? stagedFile.fileDate : undefined,
            implantCaseId: linkedCaseId,
          });

          objectPath = reqRes.objectPath;
          uploadToken = reqRes.uploadToken;
          uploadURL = reqRes.uploadURL;

          await uploadFileWithProgress(uploadURL, stagedFile.file, stagedFile.contentType, (prog) => {
            setStagedFiles((prev) => prev.map((f) => (f.id === stagedFile.id ? { ...f, progress: prog } : f)));
          });

          await api.finalizeAttachmentUpload(patientId, {
            objectPath,
            uploadToken,
            name: stagedFile.file.name,
            size: stagedFile.file.size,
            contentType: stagedFile.contentType,
            title: stagedFile.title,
            category: stagedFile.category,
            note: stagedFile.note,
            fileDate: stagedFile.fileDate ? stagedFile.fileDate : undefined,
            implantCaseId: linkedCaseId,
          });

          if (stagedFile.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl);
          setStagedFiles((prev) => prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "success", progress: 100, previewUrl: undefined } : f)));
          return true;
        } catch (err: any) {
          if (objectPath && uploadToken) {
            api.cancelAttachmentUpload(patientId, { objectPath, uploadToken }).catch(() => {});
          }
          setStagedFiles((prev) =>
            prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "error", errorMessage: err.message || clinicalT("attachments.uploadFailed"), uploadToken: undefined, objectPath: undefined } : f))
          );
          return false;
        }
      })
    );

    setIsUploadingAttachments(false);
    return uploadResults.every(Boolean);
  };

  // Auto-scroll to error banner whenever a server error appears
  useEffect(() => {
    if (serverError && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [serverError]);

  // Scroll to first invalid field when client-side validation fails
  const onInvalid = (errors: FieldErrors<FormValues>) => {
    const details = collectFormErrors(errors, t);
    setServerError(t("errors.reviewFields"));
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
        const message = localizeValidationMessage(mobileRes.message);
        form.setError("mobileNumber", { message });
        setServerError(t("errors.invalidField"));
        setValidationErrors([{
          path: "mobileNumber",
          label: fieldLabel("mobileNumber", t),
          message,
        }]);
        return;
      }
    }

    // Followup date required when section is included
    if (values.includeFollowup && !values.followupScheduledAt) {
      form.setError("followupScheduledAt", { message: t("validation.followupRequired") });
      setServerError(t("errors.requiredField"));
      setValidationErrors([{
        path: "followupScheduledAt",
        label: fieldLabel("followupScheduledAt", t),
        message: t("validation.followupRequired"),
      }]);
      setFollowupOpen(true);
      setTimeout(() => {
        document.getElementById("qe-followupScheduledAt")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }

    const missingSideIndex = values.boneGraftProcedures.findIndex(
      (procedure) =>
        procedure.procedureCategory &&
        procedure.procedureCategory !== "زراعة عظم" &&
        procedure.procedureType?.trim() &&
        !procedure.procedureSide,
    );
    if (missingSideIndex >= 0) {
      const path = `boneGraftProcedures.${missingSideIndex}.procedureSide` as `boneGraftProcedures.${number}.procedureSide`;
      form.setError(path, { message: t("validation.procedureSideRequired") });
      setServerError(t("errors.procedureSideRequired"));
      setValidationErrors([{ path, label: t("errors.procedureSideField", { number: missingSideIndex + 1 }), message: t("validation.sideRequired") }]);
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
            diameter: parseImplantDimension(i.diameter ?? ""),
            length: parseImplantDimension(i.length ?? ""),
            qValue: i.qValue || null,
            formerValue: i.formerValue || null,
            immediatePlacement: "UNSPECIFIED",
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
            .filter((procedure) => procedure.procedureCategory && procedure.procedureType?.trim())
            .map((procedure) => ({
              procedureDate: procedure.procedureDate || today,
              procedureCategory: procedure.procedureCategory!,
              procedureType: procedure.procedureType!.trim(),
              implantIndex: procedure.implantIndex ? Number(procedure.implantIndex) : undefined,
              procedureSide:
                procedure.procedureCategory === "زراعة عظم"
                  ? null
                  : (procedure.procedureSide || null) as "يمين" | "يسار" | null,
              liftType: procedure.procedureCategory === "رفع الجيب الفكي" ? procedure.liftType || null : null,
              site: procedure.site || null,
              material: procedure.material || null,
              membrane: procedure.membrane || null,
              quantity: procedure.procedureCategory === "زراعة عظم" ? procedure.quantity || null : null,
              size: procedure.procedureCategory === "زراعة عظم" ? procedure.size || null : null,
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
          setServerError(t("errors.enterTreatmentOrInstallment"));
          setValidationErrors([{
            path: "installmentTotalAmount",
            label: fieldLabel("installmentTotalAmount", t),
            message: t("validation.installmentAmountRequired"),
          }]);
          setFinanceOpen(true);
          return;
        }
        if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 60) {
          setServerError(t("errors.installmentCountRange"));
          setValidationErrors([{
            path: "installmentCount",
            label: fieldLabel("installmentCount", t),
            message: t("validation.installmentCountRange"),
          }]);
          setFinanceOpen(true);
          return;
        }
        if (!baseTreatmentAmount || scheduledAmount > baseTreatmentAmount) {
          setServerError(t("errors.installmentExceedsTreatment"));
          setValidationErrors([{
            path: "installmentTotalAmount",
            label: fieldLabel("installmentTotalAmount", t),
            message: t("validation.installmentExceedsTreatment"),
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
      onSuccess: async (data) => {
        if (stagedFiles.length > 0) {
          const patientId = data.patient.id;
          const caseId = data.case?.id || null;
          setCreatedPatientId(patientId);
          setCreatedCaseId(caseId);

          const success = await uploadAttachments(patientId, caseId);
          if (success) {
            toast({ title: t("toast.saved") });
            onSuccess();
          } else {
            toast({ variant: "destructive", title: clinicalT("attachments.partialSuccess") });
            // Stay open to allow retry
          }
        } else {
          toast({ title: t("toast.saved") });
          onSuccess();
        }
      },
      onError: (err) => {
        const apiErr = err instanceof ApiError ? err : undefined;
          const apiDetails = collectApiErrors(apiErr, t);
        if (apiErr?.code === "DUPLICATE_ACTIVE" || apiErr?.code === "DUPLICATE_ARCHIVED") {
          setDuplicateInfo({
            patientId: (apiErr.data as { patientId?: string } | undefined)?.patientId,
            code: apiErr.code,
          });
            setServerError(t("errors.duplicateFile"));
            setValidationErrors([{
              path: "fileNumber",
              label: fieldLabel("fileNumber", t),
              message: localizeValidationMessage(apiErr.message),
            }]);
          } else if (apiDetails.length > 0) {
            setServerError(t("errors.reviewFields"));
            setValidationErrors(apiDetails);
          } else if (apiErr?.code === "INVALID_MOBILE") {
            setServerError(t("errors.invalidField"));
            setValidationErrors([{
              path: "mobileNumber",
              label: fieldLabel("mobileNumber", t),
              message: localizeValidationMessage(apiErr.message),
            }]);
        } else {
          setServerError(
            apiErr
              ? localizeErrorMessage(apiErr)
              : err instanceof Error
                ? localizeErrorMessage(err)
                : t("errors.saveFailed"),
          );
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
    <div className="p-4 md:p-6 bg-card border-b border-border" dir={i18n.dir()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{t("title")}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">{t("actions.close")}</span>
        </Button>
      </div>

      {(serverError || validationErrors.length > 0) && (
        <div ref={errorBannerRef} className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {serverError && <p className="font-medium">{serverError}</p>}
          {validationErrors.length > 0 && (
            <ul className="mt-2 space-y-1 list-disc pe-5">
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
              className="me-2 underline hover:no-underline"
              onClick={() => setLocation(`/patients/${duplicateInfo.patientId}`)}
            >
              {t("actions.openFile")}
            </button>
          )}
        </div>
      )}

      {createdPatientId ? (
        <div className="space-y-6">
          <div className="p-4 bg-muted/20 border border-border rounded-lg text-center space-y-2">
            <h3 className="font-semibold text-foreground">{clinicalT("patient.registered")}</h3>
            <p className="text-sm text-muted-foreground">{clinicalT("attachments.uploading")}</p>
          </div>

          <StagedFilesList
            files={stagedFiles}
            disabled={isUploadingAttachments}
            onRemove={removeStagedFile}
            onUpdateTitle={(id, title) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, title } : f))}
            onUpdateCategory={(id, category) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))}
            onUpdateNote={(id, note) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, note } : f))}
            onUpdateFileDate={(id, fileDate) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, fileDate } : f))}
            onUpdateImplantCaseId={(id, implantCaseId) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, implantCaseId } : f))}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={onSuccess} disabled={isUploadingAttachments}>
              {clinicalT("attachments.continue")}
            </Button>
            {stagedFiles.some(f => f.status === "error") && (
              <Button onClick={async () => {
                const success = await uploadAttachments(createdPatientId, createdCaseId);
                if (success) onSuccess();
              }} disabled={isUploadingAttachments}>
                {isUploadingAttachments ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
                {clinicalT("attachments.retry")}
              </Button>
            )}
          </div>
        </div>
      ) : (
      <form id="qe-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">

        <div className="space-y-3">
          <SectionHeader title={t("sections.patient")} open={true} onToggle={() => {}} />
          <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="qe-fileNumber">
                {t("fields.fileNumber")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qe-fileNumber"
                {...form.register("fileNumber")}
                placeholder={t("placeholders.fileNumber")}
                dir="ltr"
                aria-invalid={!!form.formState.errors.fileNumber}
                className={`text-start ${form.formState.errors.fileNumber ? "border-destructive focus-visible:ring-destructive" : ""}`}
                data-testid="qe-fileNumber"
              />
              {form.formState.errors.fileNumber && (
                <p className="text-xs text-destructive">{form.formState.errors.fileNumber.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="qe-fullName">
                {t("fields.fullName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qe-fullName"
                {...form.register("fullName")}
                placeholder={t("placeholders.fullName")}
                aria-invalid={!!form.formState.errors.fullName}
                className={form.formState.errors.fullName ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="qe-fullName"
              />
              {form.formState.errors.fullName && (
                <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="qe-mobile">{t("fields.mobileNumber")} ({t("optional")})</Label>
              <Input
                id="qe-mobile"
                {...form.register("mobileNumber")}
                placeholder="05XXXXXXXX"
                dir="ltr"
                aria-invalid={!!form.formState.errors.mobileNumber}
                className={`text-start ${form.formState.errors.mobileNumber ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
              {form.formState.errors.mobileNumber && (
                <p className="text-xs text-destructive">{form.formState.errors.mobileNumber.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="qe-age">{t("fields.age")} ({t("optional")})</Label>
              <Input
                id="qe-age"
                {...form.register("age")}
                type="number"
                placeholder={t("placeholders.age")}
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
              title={t("sections.case")}
              open={caseOpen}
              onToggle={() => setCaseOpen((v) => !v)}
              optional
              optionalLabel={t("optional")}
            />
            <div className="flex items-center gap-2 shrink-0">
              <Checkbox
                id="qe-includeCase"
                checked={includeCase}
                onCheckedChange={(v) => form.setValue("includeCase", !!v)}
              />
              <Label htmlFor="qe-includeCase" className="text-sm cursor-pointer">{t("actions.include")}</Label>
            </div>
          </div>
          {!includeCase && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              {t("notices.patientWithoutCase")}
            </p>
          )}
          {includeCase && caseOpen && (
            <div className="px-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("fields.procedureDate")}</Label>
                  <OperationalDatePicker
                    value={form.watch("procedureDate") ?? ""}
                    onChange={(value) => form.setValue("procedureDate", value, { shouldDirty: true, shouldValidate: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.treatingDoctor")}</Label>
                  <Input {...form.register("treatingDoctor")} placeholder={defaultDoctor} />
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.caseStatus")}</Label>
                  <Select
                    dir={i18n.dir()}
                    value={form.watch("caseStatus")}
                    onValueChange={(v) => form.setValue("caseStatus", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CASE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{optionLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.prosValue")}</Label>
                  <Input {...form.register("prosValue")} placeholder={t("placeholders.prosValue")} />
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
                  <Label>{t("fields.generalNote")}</Label>
                  <Textarea {...form.register("generalNote")} rows={2} className="resize-none" placeholder={t("placeholders.generalNote")} />
                </div>
              </div>

              <div className="border-t border-border/60 pt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {t("sections.implants", { count: implantFields.length })}
                  </p>
                </div>
                {implantFields.map((field, index) => (
                  <div key={field.id} className="border border-border rounded-xl p-3 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{t("implant.number", { number: index + 1 })}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeImplant(index)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">{t("actions.removeImplant", { number: index + 1 })}</span>
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("fields.site")} <span className="text-destructive">*</span></Label>
                        <Select
                          dir="ltr"
                          value={form.watch(`implants.${index}.site`)}
                          onValueChange={(v) => form.setValue(`implants.${index}.site`, v)}
                        >
                          <SelectTrigger
                            className={`text-start h-8 text-sm ${form.formState.errors.implants?.[index]?.site ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            aria-invalid={!!form.formState.errors.implants?.[index]?.site}
                          >
                            <SelectValue placeholder={t("actions.choose")} />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{t("jaws.upper")}</div>
                            {["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"].map((s) => (
                              <SelectItem key={s} value={s}>{optionLabel(s)}</SelectItem>
                            ))}
                            <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{t("jaws.lower")}</div>
                            {["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"].map((s) => (
                              <SelectItem key={s} value={s}>{optionLabel(s)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("fields.system")}</Label>
                        <Select
                          dir={i18n.dir()}
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
                        <Label className="text-xs">{t("fields.diameter")}</Label>
                        <Input
                          className="h-8 text-sm"
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          aria-label={t("fields.diameter")}
                          aria-invalid={!!form.formState.errors.implants?.[index]?.diameter}
                          placeholder="3.5"
                          {...form.register(`implants.${index}.diameter`)}
                          onBlur={(event) => form.setValue(`implants.${index}.diameter`, finalizeDecimalInput(event.target.value), { shouldTouch: true, shouldValidate: true })}
                        />
                        {form.formState.errors.implants?.[index]?.diameter && <p role="alert" className="text-xs text-destructive">{form.formState.errors.implants[index]?.diameter?.message}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("fields.length")}</Label>
                        <Input
                          className="h-8 text-sm"
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          aria-label={t("fields.length")}
                          aria-invalid={!!form.formState.errors.implants?.[index]?.length}
                          placeholder="10"
                          {...form.register(`implants.${index}.length`)}
                          onBlur={(event) => form.setValue(`implants.${index}.length`, finalizeDecimalInput(event.target.value), { shouldTouch: true, shouldValidate: true })}
                        />
                        {form.formState.errors.implants?.[index]?.length && <p role="alert" className="text-xs text-destructive">{form.formState.errors.implants[index]?.length?.message}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Q</Label>
                        <Select
                          dir={i18n.dir()}
                          value={form.watch(`implants.${index}.qValue`) || "__none__"}
                          onValueChange={(v) => form.setValue(`implants.${index}.qValue`, v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[180px]" collisionPadding={12}>
                            <SelectItem value="__none__">—</SelectItem>
                            {(implantOptions?.qValues ?? []).map((v) => (
                              <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("fields.formerValue")}</Label>
                        <Select
                          dir={i18n.dir()}
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
                        <Label className="text-xs">{t("fields.graftValue")}</Label>
                        <Select
                          dir={i18n.dir()}
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
                        <Label className="text-xs">{t("fields.implantStatus")}</Label>
                        <Select
                          dir={i18n.dir()}
                          value={form.watch(`implants.${index}.implantStatus`)}
                          onValueChange={(v) => form.setValue(`implants.${index}.implantStatus`, v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPLANT_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{optionLabel(s)}</SelectItem>
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
                  {t("actions.addImplant")}
                </Button>
              </div>
              <div className="border-t border-border/60 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {t("adjunct.heading", { count: boneGraftProcedureFields.length })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t("adjunct.noFinancialImpact")}</p>
                </div>
                {boneGraftProcedureFields.map((field, index) => (
                  <div key={field.id} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between"><p className="text-sm font-medium">{t("adjunct.procedureNumber", { number: index + 1 })}</p><Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeBoneGraftProcedure(index)} aria-label={t("actions.removeAdjunctProcedure", { number: index + 1 })}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1"><Label className="text-xs">{t("adjunct.date")}</Label><OperationalDatePicker value={form.watch(`boneGraftProcedures.${index}.procedureDate`) || today} onChange={(value) => form.setValue(`boneGraftProcedures.${index}.procedureDate`, value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">{t("adjunct.category")} *</Label><Select dir={i18n.dir()} value={form.watch(`boneGraftProcedures.${index}.procedureCategory`) || ""} onValueChange={(value) => { form.setValue(`boneGraftProcedures.${index}.procedureCategory`, value as typeof ADJUNCT_PROCEDURE_CATEGORIES[number]); form.setValue(`boneGraftProcedures.${index}.procedureSide`, ""); form.setValue(`boneGraftProcedures.${index}.liftType`, ""); }}><SelectTrigger className="h-9"><SelectValue placeholder={t("adjunct.chooseCategory")} /></SelectTrigger><SelectContent>{ADJUNCT_PROCEDURE_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{optionLabel(category)}</SelectItem>)}</SelectContent></Select></div>
                      {form.watch(`boneGraftProcedures.${index}.procedureCategory`) !== "زراعة عظم" && <div className="space-y-1"><Label className="text-xs">{t("adjunct.side")} *</Label><Select dir={i18n.dir()} value={form.watch(`boneGraftProcedures.${index}.procedureSide`) || ""} onValueChange={(value) => form.setValue(`boneGraftProcedures.${index}.procedureSide`, value)}><SelectTrigger className="h-9"><SelectValue placeholder={t("adjunct.chooseSide")} /></SelectTrigger><SelectContent>{PROCEDURE_SIDES.map((side) => <SelectItem key={side} value={side}>{optionLabel(side)}</SelectItem>)}</SelectContent></Select></div>}
                      {form.watch(`boneGraftProcedures.${index}.procedureCategory`) === "رفع الجيب الفكي" && <div className="space-y-1"><Label className="text-xs">{t("adjunct.liftType")}</Label><Select dir={i18n.dir()} value={form.watch(`boneGraftProcedures.${index}.liftType`) || "__none__"} onValueChange={(value) => form.setValue(`boneGraftProcedures.${index}.liftType`, value === "__none__" ? "" : value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">{t("unspecified")}</SelectItem>{SINUS_LIFT_TYPES.map((type) => <SelectItem key={type} value={type}>{optionLabel(type)}</SelectItem>)}</SelectContent></Select></div>}
                      <div className="space-y-1"><Label className="text-xs">{t("adjunct.description")} *</Label><Input {...form.register(`boneGraftProcedures.${index}.procedureType`)} placeholder={t("adjunct.descriptionPlaceholder")} /></div>
                      <div className="space-y-1"><Label className="text-xs">{t("adjunct.relatedImplant")}</Label><Select dir={i18n.dir()} value={form.watch(`boneGraftProcedures.${index}.implantIndex`) || "__case__"} onValueChange={(value) => form.setValue(`boneGraftProcedures.${index}.implantIndex`, value === "__case__" ? "" : value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__case__">{t("adjunct.caseLevel")}</SelectItem>{implantFields.map((implant, implantIndex) => <SelectItem key={implant.id} value={String(implantIndex)}>{t("implant.number", { number: implantIndex + 1 })}{form.watch(`implants.${implantIndex}.site`) ? ` — ${t("adjunct.tooth", { site: form.watch(`implants.${implantIndex}.site`) })}` : ""}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label className="text-xs">{t("adjunct.site")}</Label><Input {...form.register(`boneGraftProcedures.${index}.site`)} placeholder={t("adjunct.sitePlaceholder")} /></div>
                      {form.watch(`boneGraftProcedures.${index}.procedureCategory`) === "زراعة عظم" && <><div className="space-y-1"><Label className="text-xs">{t("adjunct.material")}</Label><Input {...form.register(`boneGraftProcedures.${index}.material`)} placeholder={t("adjunct.materialPlaceholder")} /></div><div className="space-y-1"><Label className="text-xs">{t("adjunct.membrane")}</Label><Input {...form.register(`boneGraftProcedures.${index}.membrane`)} placeholder={t("adjunct.membranePlaceholder")} /></div><div className="space-y-1"><Label className="text-xs">{t("adjunct.quantity")}</Label><Input {...form.register(`boneGraftProcedures.${index}.quantity`)} /></div><div className="space-y-1"><Label className="text-xs">{t("adjunct.size")}</Label><Input {...form.register(`boneGraftProcedures.${index}.size`)} /></div></>}
                      <div className="space-y-1"><Label className="text-xs">{t("adjunct.status")}</Label><Input {...form.register(`boneGraftProcedures.${index}.procedureStatus`)} placeholder={t("adjunct.statusPlaceholder")} /></div>
                      <div className="space-y-1 sm:col-span-2"><Label className="text-xs">{t("adjunct.note")}</Label><Input {...form.register(`boneGraftProcedures.${index}.note`)} /></div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => appendBoneGraftProcedure({ procedureDate: today, procedureCategory: "زراعة عظم", procedureType: "", implantIndex: "", procedureSide: "", liftType: "", site: "", material: "", membrane: "", quantity: "", size: "", procedureStatus: "مخطط", note: "" })} data-testid="qe-add-bone-graft-procedure"><Plus className="h-3.5 w-3.5" />{t("actions.addAdjunctProcedure")}</Button>
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
                title={t("sections.finance")}
                open={financeOpen}
                onToggle={() => setFinanceOpen((v) => !v)}
                optional
              optionalLabel={t("optional")}
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
                  <Label htmlFor="qe-includePayment" className="text-sm cursor-pointer">{t("actions.include")}</Label>
                </div>
              )}
            </div>
            {financeOpen && (
              <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Base treatment amount — canViewFinancials */}
                <div className="space-y-1">
                  <Label>{t("fields.baseTreatmentAmount")} ({t("currency")})</Label>
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
                    <span>{t("installments.enable")}</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    سيتم إنشاء جدول استحقاقات دون تغيير إجمالي الحالة أو الدفعات الفعلية.
                  </p>
                </div>
                {includeInstallmentPlan ? (
                  <div className="sm:col-span-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label>{t("fields.installmentTotalAmount")} ({t("currency")})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0.01}
                          placeholder={t("placeholders.installmentAmount")}
                          {...form.register("installmentTotalAmount")}
                          data-testid="qe-installment-total"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{t("fields.installmentCount")}</Label>
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
                        <Label>{t("fields.installmentFirstDueDate")}</Label>
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
                              <span>{t("installments.payment", { number: index + 1 })}</span>
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
                  <Label>{t("fields.paymentAmount")} ({t("currency")})</Label>
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
                    <Label>{t("fields.paymentDate")}</Label>
                    <OperationalDatePicker
                      value={form.watch("paymentDate") ?? ""}
                      onChange={(value) => form.setValue("paymentDate", value, { shouldDirty: true, shouldValidate: true })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("fields.paymentLabel")}</Label>
                    <Select
                      dir={i18n.dir()}
                      value={form.watch("paymentLabel") || "دفعة أولى"}
                      onValueChange={(v) => form.setValue("paymentLabel", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_LABELS.map((l) => (
                          <SelectItem key={l} value={l}>{enumLabel("paymentLabel", l)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t("fields.paymentMethod")}</Label>
                    <Select
                      dir={i18n.dir()}
                      value={form.watch("paymentMethod") || "نقدي"}
                      onValueChange={(v) => form.setValue("paymentMethod", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{enumLabel("paymentMethod", m)}</SelectItem>
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
                title={t("sections.followup")}
                open={followupOpen}
                onToggle={() => setFollowupOpen((v) => !v)}
                optional
              optionalLabel={t("optional")}
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
                <Label htmlFor="qe-includeFollowup" className="text-sm cursor-pointer">{t("actions.include")}</Label>
              </div>
            </div>
            {includeFollowup && followupOpen && (
              <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("fields.followupType")}</Label>
                  <Select
                    dir={i18n.dir()}
                    value={form.watch("followupType") || "متابعة بعد العملية"}
                    onValueChange={(v) => form.setValue("followupType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <Label>{t("fields.followupAssignedUserId")}</Label>
                  <Select
                    dir={i18n.dir()}
                    value={form.watch("followupAssignedUserId") || "__none__"}
                    onValueChange={(v) => form.setValue("followupAssignedUserId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("unspecified")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("unspecified")}</SelectItem>
                      {(assignableUsers ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t("fields.followupNote")}</Label>
                  <Textarea
                    {...form.register("followupNote")}
                    rows={2}
                    className="resize-none"
                    placeholder={t("placeholders.followupNote")}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Attachments Section */}
        <div className="space-y-3">
          <SectionHeader
            title={clinicalT("attachments.title")}
            open={attachmentsOpen}
            onToggle={() => setAttachmentsOpen((open) => !open)}
            optional
            optionalLabel={t("optional")}
          />
          {attachmentsOpen ? (
            <div className="px-1 space-y-3">
              <FileDropzone onFilesAdded={handleAddFiles} disabled={quickEntry.isPending || isUploadingAttachments} />
              {stagedFiles.length > 0 && (
                <StagedFilesList
                  files={stagedFiles}
                  disabled={quickEntry.isPending || isUploadingAttachments}
                  onRemove={removeStagedFile}
                  onUpdateTitle={(id, title) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, title } : f))}
                  onUpdateCategory={(id, category) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))}
                  onUpdateNote={(id, note) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, note } : f))}
                  onUpdateFileDate={(id, fileDate) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, fileDate } : f))}
                  onUpdateImplantCaseId={(id, implantCaseId) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, implantCaseId } : f))}
                />
              )}
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-border/60">
          <Button
            type="submit"
            className="btn-primary"
            disabled={quickEntry.isPending || isUploadingAttachments}
            data-testid="qe-submit"
          >
            {quickEntry.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {t("actions.save")}
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={quickEntry.isPending}>
            {t("actions.cancel")}
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}
