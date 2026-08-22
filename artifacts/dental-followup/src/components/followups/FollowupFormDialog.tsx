import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Followup, ImplantCase } from "@workspace/shared";
import { FOLLOWUP_TYPES } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldLabel } from "@/components/implants/FieldLabel";
import {
  OperationalDatePicker,
  OperationalDateTimeFields,
} from "@/components/dashboard/OperationalDatePicker";
import { useCreateFollowup, useUpdateFollowup } from "@/hooks/use-followups";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { toRiyadhDateValue, toRiyadhInputValue } from "./followup-utils";

interface FollowupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  cases: ImplantCase[];
  /** When set, the dialog edits this follow-up instead of creating one. */
  followup?: Followup | null;
  /** Prefill for "متابعة جديدة من هذه" — a new record based on an old one. */
  prefillFrom?: Followup | null;
}

export function FollowupFormDialog(props: FollowupFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg text-right max-h-[90vh] overflow-y-auto" dir="rtl">
        <FollowupForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function FollowupForm({
  onOpenChange,
  patientId,
  cases,
  followup,
  prefillFrom,
}: FollowupFormDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const createFollowup = useCreateFollowup(patientId);
  const updateFollowup = useUpdateFollowup(patientId);
  const isEdit = Boolean(followup);
  const source = followup ?? prefillFrom ?? null;

  const activeCases = cases.filter((c) => !c.archivedAt);
  const [caseId, setCaseId] = useState(
    source?.implantCaseId ?? activeCases[0]?.id ?? "",
  );
  const [followupType, setFollowupType] = useState<string>(
    source?.followupType ?? "",
  );
  const [scheduledAt, setScheduledAt] = useState(
    followup?.scheduledAt ? toRiyadhInputValue(followup.scheduledAt) : "",
  );
  const [requiresContact, setRequiresContact] = useState(
    source?.requiresContact ?? false,
  );
  const [contactDueAt, setContactDueAt] = useState(
    followup?.contactDueAt ? toRiyadhDateValue(followup.contactDueAt) : "",
  );
  const [note, setNote] = useState(followup?.note ?? "");
  // New follow-ups belong to the logged-in user; edits preserve the existing owner.
  const assignedUserId = isEdit ? source?.assignedUserId ?? null : user?.id ?? null;
  const [error, setError] = useState<string | null>(null);

  const pending = createFollowup.isPending || updateFollowup.isPending;

  const submit = () => {
    if (!isEdit && !caseId) {
      setError("اختر حالة الزراعة أولًا.");
      return;
    }
    if (!followupType) {
      setError("نوع المتابعة مطلوب.");
      return;
    }
    if (!scheduledAt) {
      setError("موعد المتابعة مطلوب.");
      return;
    }
    if (requiresContact && !contactDueAt) {
      setError("حدد تاريخ استحقاق التواصل.");
      return;
    }
    const payload = {
      followupType: followupType as (typeof FOLLOWUP_TYPES)[number],
      scheduledAt,
      requiresContact,
      contactDueAt: requiresContact && contactDueAt ? contactDueAt : null,
      // The form now has one clear appointment field. Preserve an existing
      // suggested appointment when editing so hiding the optional field does
      // not erase previously saved data.
      nextAppointmentAt:
        isEdit && followup?.nextAppointmentAt
          ? toRiyadhInputValue(followup.nextAppointmentAt)
          : null,
      note: note.trim() || null,
        assignedUserId,
    };
    const callbacks = {
      onSuccess: () => {
        toast({
          title: isEdit ? "تم تحديث المتابعة." : "تمت إضافة المتابعة.",
        });
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        toast({
          title: isEdit ? "تعذر تحديث المتابعة" : "تعذر إضافة المتابعة",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive" as const,
        });
      },
    };
    if (isEdit && followup) {
      updateFollowup.mutate({ id: followup.id, input: payload }, callbacks);
    } else {
      createFollowup.mutate({ caseId, input: payload }, callbacks);
    }
  };

  return (
    <>
      <DialogHeader className="text-right sm:text-right">
        <DialogTitle>{isEdit ? "تعديل متابعة" : "إضافة متابعة"}</DialogTitle>
        <DialogDescription>
          تُعرض جميع المواعيد بتوقيت الرياض.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {!isEdit ? (
          <div className="space-y-2">
            <FieldLabel label="حالة الزراعة" />
            <Select value={caseId} onValueChange={setCaseId} dir="rtl">
              <SelectTrigger data-testid="select-followup-case">
                <SelectValue placeholder="اختر الحالة" />
              </SelectTrigger>
              <SelectContent>
                {activeCases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.caseStatus} —{" "}
                    {c.procedureDate
                      ? formatSaudiDate(c.procedureDate)
                      : formatSaudiDate(c.createdAt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <FieldLabel label="نوع المتابعة" />
            <Select
              value={followupType}
              onValueChange={(v) => {
                setFollowupType(v);
                setError(null);
              }}
              dir="rtl"
            >
              <SelectTrigger data-testid="select-followup-type">
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                {FOLLOWUP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <OperationalDateTimeFields
            label="موعد المتابعة"
            required
            value={scheduledAt}
            onChange={(v) => { setScheduledAt(v); setError(null); }}
            id="input-followup-scheduled"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel label="المسؤول" />
          <div
            className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground"
            data-testid="followup-current-assignee"
          >
            {isEdit
              ? followup?.assignedUserName ?? "غير محدد"
              : user?.fullName ?? "المستخدم الحالي"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="requires-contact"
            checked={requiresContact}
            onCheckedChange={(v) => {
              setRequiresContact(v === true);
              setError(null);
            }}
            data-testid="checkbox-requires-contact"
          />
          <label htmlFor="requires-contact" className="text-sm cursor-pointer">
            يتطلب تواصلًا مع المريض
          </label>
        </div>
        {requiresContact ? (
          <div className="space-y-2">
            <FieldLabel label="تاريخ استحقاق التواصل" />
            <OperationalDatePicker
              value={contactDueAt}
              onChange={(v) => { setContactDueAt(v); setError(null); }}
              id="input-contact-due"
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <FieldLabel label="ملاحظة (اختياري)" />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            data-testid="input-followup-note"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={pending} data-testid="button-save-followup">
          {pending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>{isEdit ? "حفظ التعديلات" : "إضافة"}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
