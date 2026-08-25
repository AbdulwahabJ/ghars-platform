import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Followup } from "@workspace/shared";
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
import { FieldLabel } from "@/components/implants/FieldLabel";
import { OperationalDateTimeFields } from "@/components/dashboard/OperationalDatePicker";
import { usePostponeFollowup } from "@/hooks/use-followups";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDateTime } from "@/lib/datetime";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

interface PostponeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  followup: Followup | null;
}

export function PostponeDialog(props: PostponeDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-start">
        {props.followup ? <PostponeForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PostponeForm({ onOpenChange, patientId, followup }: PostponeDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const postpone = usePostponeFollowup(patientId);
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!newScheduledAt) {
      setError(t("followupForms.newAppointmentRequired"));
      return;
    }
    postpone.mutate(
      {
        id: followup!.id,
        input: { newScheduledAt, note: note.trim() || null },
      },
      {
        onSuccess: () => {
          toast({ title: t("followupForms.postponeSuccess") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("followupForms.postponeFailed"),
            description: localizeErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <DialogHeader className="text-start sm:text-start">
        <DialogTitle>{t("followupForms.postponeTitle")}</DialogTitle>
        <DialogDescription>
          {t("followupForms.postponeDescription")}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {followup!.scheduledAt ? (
          <p className="text-sm text-muted-foreground">
            {t("followupForms.currentAppointment", { date: formatSaudiDateTime(followup!.scheduledAt) })}
          </p>
        ) : null}
        <OperationalDateTimeFields
          label={t("followupForms.newAppointment")}
          required
          value={newScheduledAt}
          onChange={(v) => { setNewScheduledAt(v); setError(null); }}
          id="input-postpone-datetime"
        />
        <div className="space-y-2">
          <FieldLabel label={t("followupForms.optionalNote")} />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            data-testid="input-postpone-note"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={postpone.isPending} data-testid="button-save-postpone">
          {postpone.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>{t("followups.postpone")}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("financeForms.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
