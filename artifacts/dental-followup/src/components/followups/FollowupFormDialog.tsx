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
import {
  useAssignableUsers,
  useCreateFollowup,
  useUpdateFollowup,
} from "@/hooks/use-followups";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { toRiyadhDateValue, toRiyadhInputValue } from "./followup-utils";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";
import { useEnumTranslation } from "@/i18n/use-enum-translation";

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
      <DialogContent className="sm:max-w-lg text-start max-h-[90vh] overflow-y-auto">
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
  const { t } = useTranslation("operations");
  const { enumLabel } = useEnumTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const createFollowup = useCreateFollowup(patientId);
  const updateFollowup = useUpdateFollowup(patientId);
  const { data: assignableUsers } = useAssignableUsers();
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
  // New follow-ups belong to the logged-in user; edits can reassign an active user.
  const [assignedUserId, setAssignedUserId] = useState(
    isEdit ? source?.assignedUserId ?? "" : user?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const pending = createFollowup.isPending || updateFollowup.isPending;

  const submit = () => {
    if (!isEdit && !caseId) {
      setError(t("followupForms.implantCaseRequired"));
      return;
    }
    if (!followupType) {
      setError(t("followupForms.typeRequired"));
      return;
    }
    if (!scheduledAt) {
      setError(t("followupForms.appointmentRequired"));
      return;
    }
    if (requiresContact && !contactDueAt) {
      setError(t("followupForms.contactDueDateRequired"));
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
        assignedUserId: assignedUserId || null,
    };
    const callbacks = {
      onSuccess: () => {
        toast({
          title: isEdit
            ? t("followupForms.followupUpdated")
            : t("followupForms.followupAdded"),
        });
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        toast({
          title: isEdit
            ? t("followupForms.followupUpdateFailed")
            : t("followupForms.followupAddFailed"),
          description: localizeErrorMessage(err),
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
      <DialogHeader className="text-start sm:text-start">
        <DialogTitle>{isEdit ? t("followupForms.edit") : t("followupForms.add")}</DialogTitle>
        <DialogDescription>
          {t("followupForms.riyadhTimeNotice")}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {!isEdit ? (
          <div className="space-y-2">
            <FieldLabel label={t("followupForms.implantCase")} />
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger data-testid="select-followup-case">
                <SelectValue placeholder={t("followupForms.selectCase")} />
              </SelectTrigger>
              <SelectContent>
                {activeCases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {enumLabel("caseStatus", c.caseStatus)} —{" "}
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
            <FieldLabel label={t("followupForms.type")} />
            <Select
              value={followupType}
              onValueChange={(v) => {
                setFollowupType(v);
                setError(null);
              }}
            >
              <SelectTrigger data-testid="select-followup-type">
                <SelectValue placeholder={t("followupForms.selectType")} />
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
            label={t("followupForms.appointment")}
            required
            value={scheduledAt}
            onChange={(v) => { setScheduledAt(v); setError(null); }}
            id="input-followup-scheduled"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("followupForms.assignee")} />
          {isEdit && assignableUsers && assignableUsers.length > 0 ? (
            <Select
              value={assignedUserId || "__none__"}
              onValueChange={(value) =>
                setAssignedUserId(value === "__none__" ? "" : value)
              }
            >
              <SelectTrigger data-testid="select-followup-assignee">
                <SelectValue placeholder={t("followupForms.unspecified")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("followupForms.unspecified")}</SelectItem>
                {assignableUsers.map((assignableUser) => (
                  <SelectItem key={assignableUser.id} value={assignableUser.id}>
                    {assignableUser.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div
              className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground"
              data-testid="followup-current-assignee"
            >
              {isEdit
                ? followup?.assignedUserName ?? t("followupForms.unspecified")
                : user?.fullName ?? t("followupForms.currentUser")}
            </div>
          )}
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
            {t("followupForms.requiresContact")}
          </label>
        </div>
        {requiresContact ? (
          <div className="space-y-2">
            <FieldLabel label={t("followupForms.contactDueDate")} />
            <OperationalDatePicker
              value={contactDueAt}
              onChange={(v) => { setContactDueAt(v); setError(null); }}
              id="input-contact-due"
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <FieldLabel label={t("followupForms.optionalNote")} />
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
          <span>{isEdit ? t("followupForms.saveChanges") : t("followupForms.add")}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("followupForms.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
