import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CASE_STATUSES,
  PROS_SUGGESTED_VALUES,
  DEFAULT_TREATING_DOCTOR,
  type ImplantCase,
  type ImplantCaseInput,
} from "@workspace/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldLabel } from "./FieldLabel";
import { useCreateImplantCase, useUpdateImplantCase } from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";
import { addMonthsToIsoDate, formatSaudiDate } from "@/lib/datetime";

const NONE = "__none__";
const CUSTOM = "__custom__";

interface CaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  /** When set, the dialog edits this case instead of creating a new one. */
  caseData?: ImplantCase | null;
  /** Other cases of the same patient (for the reimplantation source link). */
  otherCases: ImplantCase[];
}

export function CaseFormDialog(props: CaseFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl text-right max-h-[90vh] overflow-y-auto" dir="rtl">
        {/* The form mounts fresh on every open, so state initializers run each time. */}
        <CaseForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function CaseForm({
  onOpenChange,
  patientId,
  caseData,
  otherCases,
}: CaseFormDialogProps) {
  const { toast } = useToast();
  const createCase = useCreateImplantCase();
  const updateCase = useUpdateImplantCase();
  const isEdit = Boolean(caseData);

  const [procedureDate, setProcedureDate] = useState(
    () => caseData?.procedureDate ?? "",
  );
  const [treatingDoctor, setTreatingDoctor] = useState(
    () => caseData?.treatingDoctor ?? DEFAULT_TREATING_DOCTOR,
  );
  const [referringDoctor, setReferringDoctor] = useState(
    () => caseData?.referringDoctor ?? "",
  );
  const [caseStatus, setCaseStatus] = useState<string>(
    () => caseData?.caseStatus ?? "حالة جديدة",
  );
  const [prosChoice, setProsChoice] = useState<string>(() => {
    const pros = caseData?.prosValue;
    if (!pros) return NONE;
    return (PROS_SUGGESTED_VALUES as readonly string[]).includes(pros)
      ? pros
      : CUSTOM;
  });
  const [prosCustom, setProsCustom] = useState(() => {
    const pros = caseData?.prosValue;
    if (pros && !(PROS_SUGGESTED_VALUES as readonly string[]).includes(pros)) {
      return pros;
    }
    return "";
  });
  const [expectedDate, setExpectedDate] = useState(
    () => caseData?.expectedProstheticDate ?? "",
  );
  const [expectedTouched, setExpectedTouched] = useState(() =>
    Boolean(caseData?.expectedProstheticDate),
  );
  const [generalNote, setGeneralNote] = useState(
    () => caseData?.generalNote ?? "",
  );
  const [isReimplantation, setIsReimplantation] = useState(
    () => caseData?.isReimplantation ?? false,
  );
  const [reimplantationReason, setReimplantationReason] = useState(
    () => caseData?.reimplantationReason ?? "",
  );
  const [sourceCaseId, setSourceCaseId] = useState<string>(
    () => caseData?.sourceCaseId ?? NONE,
  );

  /** Suggested (but editable) expected date: procedure date + 2/3 months. */
  const suggestExpected = (date: string, pros: string) => {
    if (expectedTouched) return;
    if (date && (pros === "2M" || pros === "3M")) {
      setExpectedDate(addMonthsToIsoDate(date, pros === "2M" ? 2 : 3));
    }
  };

  const handleProcedureDateChange = (value: string) => {
    setProcedureDate(value);
    suggestExpected(value, prosChoice);
  };

  const handleProsChange = (value: string) => {
    setProsChoice(value);
    suggestExpected(procedureDate, value);
  };

  const isPending = createCase.isPending || updateCase.isPending;

  const handleSubmit = () => {
    if (!treatingDoctor.trim()) {
      toast({ variant: "destructive", title: "اسم الطبيب المعالج مطلوب." });
      return;
    }
    const prosValue =
      prosChoice === CUSTOM
        ? prosCustom.trim() || null
        : prosChoice === NONE
          ? null
          : prosChoice;
    const payload: ImplantCaseInput = {
      procedureDate: procedureDate || null,
      treatingDoctor: treatingDoctor.trim(),
      referringDoctor: referringDoctor.trim() || null,
      caseStatus: caseStatus as ImplantCaseInput["caseStatus"],
      prosValue,
      expectedProstheticDate: expectedDate || null,
      generalNote: generalNote.trim() || null,
      legacyCostNote: caseData?.legacyCostNote ?? null,
      isReimplantation,
      reimplantationReason: isReimplantation
        ? reimplantationReason.trim() || null
        : null,
      sourceCaseId:
        isReimplantation && sourceCaseId !== NONE ? sourceCaseId : null,
    };

    const onError = (err: Error) =>
      toast({
        variant: "destructive",
        title: "خطأ",
        description: err.message || "تعذر حفظ حالة الزراعة.",
      });

    if (isEdit && caseData) {
      updateCase.mutate(
        { id: caseData.id, patientId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "تم حفظ تعديلات الحالة بنجاح" });
            onOpenChange(false);
          },
          onError,
        },
      );
    } else {
      createCase.mutate(
        { patientId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "تم تسجيل حالة الزراعة بنجاح" });
            onOpenChange(false);
          },
          onError,
        },
      );
    }
  };

  const sourceOptions = otherCases.filter((c) => c.id !== caseData?.id);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold text-primary">
          {isEdit ? "تعديل حالة الزراعة" : "تسجيل حالة زراعة جديدة"}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          {isEdit
            ? "عدّل بيانات الحالة ثم اضغط حفظ."
            : "أدخل بيانات حالة الزراعة. يمكن إضافة الزرعات بعد إنشاء الحالة."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="case-procedure-date" label="تاريخ الإجراء" />
          <Input
            id="case-procedure-date"
            type="date"
            value={procedureDate}
            onChange={(e) => handleProcedureDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="case-status" label="حالة الحالة" />
          <Select value={caseStatus} onValueChange={setCaseStatus}>
            <SelectTrigger id="case-status" className="h-[46px] rounded-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {CASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="case-treating" label="الطبيب المعالج" />
          <Input
            id="case-treating"
            value={treatingDoctor}
            onChange={(e) => setTreatingDoctor(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="case-referring" label="الطبيب المحوِّل" />
          <Input
            id="case-referring"
            value={referringDoctor}
            onChange={(e) => setReferringDoctor(e.target.value)}
            placeholder="اختياري"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="case-pros" label="مدة التركيب — Pros" helpKey="Pros" />
          <div className="flex gap-2">
            <Select value={prosChoice} onValueChange={handleProsChange}>
              <SelectTrigger id="case-pros" className="h-[46px] rounded-[10px]">
                <SelectValue placeholder="اختر" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value={NONE}>بدون</SelectItem>
                {PROS_SUGGESTED_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>قيمة مخصصة</SelectItem>
              </SelectContent>
            </Select>
            {prosChoice === CUSTOM && (
              <Input
                aria-label="قيمة مدة التركيب المخصصة"
                value={prosCustom}
                onChange={(e) => setProsCustom(e.target.value)}
                placeholder="أدخل القيمة"
              />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="case-expected" label="التاريخ المتوقع للتركيب" />
          <Input
            id="case-expected"
            type="date"
            value={expectedDate}
            onChange={(e) => {
              setExpectedTouched(true);
              setExpectedDate(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            يُقترح تلقائيًا حسب مدة التركيب ويمكن تعديله.
          </p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <FieldLabel htmlFor="case-note" label="ملاحظة عامة" />
          <Textarea
            id="case-note"
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            rows={3}
          />
        </div>

        <div className="md:col-span-2 border-t border-border pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="case-reimplant" label="إعادة زراعة" />
            <Switch
              id="case-reimplant"
              checked={isReimplantation}
              onCheckedChange={setIsReimplantation}
            />
          </div>
          {isReimplantation && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <FieldLabel htmlFor="case-reimplant-reason" label="سبب إعادة الزراعة" />
                <Textarea
                  id="case-reimplant-reason"
                  value={reimplantationReason}
                  onChange={(e) => setReimplantationReason(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <FieldLabel htmlFor="case-source" label="الحالة المصدر" />
                <Select value={sourceCaseId} onValueChange={setSourceCaseId}>
                  <SelectTrigger id="case-source" className="h-[46px] rounded-[10px]">
                    <SelectValue placeholder="اختر الحالة الأصلية (اختياري)" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value={NONE}>بدون ربط</SelectItem>
                    {sourceOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {`حالة ${formatSaudiDate(c.procedureDate ?? c.createdAt)} — ${c.caseStatus}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
        <Button onClick={handleSubmit} disabled={isPending} className="btn-primary w-full sm:w-auto">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span>{isEdit ? "حفظ التعديلات" : "تسجيل الحالة"}</span>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
          className="btn-outline w-full sm:w-auto"
        >
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
