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
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import { useCreateImplantCase, useUpdateImplantCase } from "@/hooks/use-implant-cases";
import { useAppSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { ExpectedProstheticDateField } from "./ExpectedProstheticDateField";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { localizeErrorMessage } from "@/lib/localize-error";
import { useEnumTranslation } from "@/i18n/use-enum-translation";

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
      <DialogContent className="sm:max-w-2xl text-start max-h-[90vh] overflow-y-auto">
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
  const { t } = useClinicalTranslation();
  const { enumLabel } = useEnumTranslation();
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const createCase = useCreateImplantCase();
  const updateCase = useUpdateImplantCase();
  const isEdit = Boolean(caseData);

  const [procedureDate, setProcedureDate] = useState(
    () => caseData?.procedureDate ?? "",
  );
  const [treatingDoctor, setTreatingDoctor] = useState(
    () =>
      caseData?.treatingDoctor ??
      settings.defaultTreatingDoctor ??
      DEFAULT_TREATING_DOCTOR,
  );
  const [referringDoctor, setReferringDoctor] = useState(
    () => caseData?.referringDoctor ?? "",
  );
  const [caseStatus, setCaseStatus] = useState<string>(
    () => caseData?.caseStatus ?? "حالة جديدة",
  );
  const [prosChoice, setProsChoice] = useState<string>(() => {
    // New cases prefill from the admin-configured default Pros value.
    const pros = caseData ? caseData.prosValue : settings.defaultProsValue;
    if (!pros) return NONE;
    return (PROS_SUGGESTED_VALUES as readonly string[]).includes(pros)
      ? pros
      : CUSTOM;
  });
  const [prosCustom, setProsCustom] = useState(() => {
    const pros = caseData ? caseData.prosValue : settings.defaultProsValue;
    if (pros && !(PROS_SUGGESTED_VALUES as readonly string[]).includes(pros)) {
      return pros;
    }
    return "";
  });
  const [expectedDate, setExpectedDate] = useState(
    () => caseData?.expectedProstheticDate ?? "",
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

  const isPending = createCase.isPending || updateCase.isPending;

  const handleSubmit = () => {
    if (!treatingDoctor.trim()) {
      toast({ variant: "destructive", title: t("implant.treatingDoctor") });
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
        title: t("patient.error"),
        description: localizeErrorMessage(err),
      });

    if (isEdit && caseData) {
      updateCase.mutate(
        { id: caseData.id, patientId, data: payload },
        {
          onSuccess: () => {
             toast({ title: t("implant.caseSaved") });
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
             toast({ title: t("implant.caseCreated") });
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
           {isEdit ? t("implant.editCase") : t("implant.newCase")}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          {isEdit
             ? t("implant.caseDescriptionEdit")
             : t("implant.caseDescriptionNew")}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="space-y-2">
           <FieldLabel htmlFor="case-procedure-date" label={t("implant.procedureDate")} />
          <OperationalDatePicker
            id="case-procedure-date"
            value={procedureDate}
            onChange={setProcedureDate}
          />
        </div>
        <div className="space-y-2">
           <FieldLabel htmlFor="case-status" label={t("implant.caseStatus")} />
          <Select value={caseStatus} onValueChange={setCaseStatus}>
            <SelectTrigger id="case-status" className="h-[46px] rounded-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                   {enumLabel("caseStatus", s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
           <FieldLabel htmlFor="case-treating" label={t("implant.treatingDoctor")} />
          <Input
            id="case-treating"
            value={treatingDoctor}
            onChange={(e) => setTreatingDoctor(e.target.value)}
          />
        </div>
        <div className="space-y-2">
           <FieldLabel htmlFor="case-referring" label={t("implant.referringDoctor")} />
          <Input
            id="case-referring"
            value={referringDoctor}
            onChange={(e) => setReferringDoctor(e.target.value)}
             placeholder={t("implant.optional")}
          />
        </div>
        <div className="space-y-2">
           <FieldLabel htmlFor="case-pros" label={t("implant.prosDuration")} helpKey="Pros" />
          <div className="flex gap-2">
            <Select value={prosChoice} onValueChange={setProsChoice}>
              <SelectTrigger id="case-pros" className="h-[46px] rounded-[10px]">
               <SelectValue placeholder={t("implant.choose")} />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value={NONE}>{t("implant.none")}</SelectItem>
                {PROS_SUGGESTED_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
                 <SelectItem value={CUSTOM}>{t("implant.customValue")}</SelectItem>
              </SelectContent>
            </Select>
            {prosChoice === CUSTOM && (
              <Input
                 aria-label={t("implant.customValue")}
                value={prosCustom}
                onChange={(e) => setProsCustom(e.target.value)}
                 placeholder={t("implant.customValue")}
              />
            )}
          </div>
        </div>
        <ExpectedProstheticDateField
          procedureDate={procedureDate}
          expectedDate={expectedDate}
          onExpectedDateChange={setExpectedDate}
          className="md:col-span-2"
          idPrefix="case-expected-prosthetic"
        />
        <div className="space-y-2 md:col-span-2">
           <FieldLabel htmlFor="case-note" label={t("implant.generalNote")} />
          <Textarea
            id="case-note"
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            rows={3}
          />
        </div>

        <div className="md:col-span-2 border-t border-border pt-4 space-y-4">
          <div className="flex items-center justify-between">
             <FieldLabel htmlFor="case-reimplant" label={t("implant.reimplantation")} />
            <Switch
              id="case-reimplant"
              checked={isReimplantation}
              onCheckedChange={setIsReimplantation}
            />
          </div>
          {isReimplantation && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                 <FieldLabel htmlFor="case-reimplant-reason" label={t("implant.reimplantationReason")} />
                <Textarea
                  id="case-reimplant-reason"
                  value={reimplantationReason}
                  onChange={(e) => setReimplantationReason(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                 <FieldLabel htmlFor="case-source" label={t("implant.sourceCase")} />
                <Select value={sourceCaseId} onValueChange={setSourceCaseId}>
                  <SelectTrigger id="case-source" className="h-[46px] rounded-[10px]">
                     <SelectValue placeholder={t("implant.sourceCasePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value={NONE}>{t("implant.noLink")}</SelectItem>
                    {sourceOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                         {`${t("implant.case")} ${formatSaudiDate(c.procedureDate ?? c.createdAt)} — ${enumLabel("caseStatus", c.caseStatus)}`}
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
             <span>{isEdit ? t("implant.saveChanges") : t("implant.saveCase")}</span>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
          className="btn-outline w-full sm:w-auto"
        >
           {t("implant.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
