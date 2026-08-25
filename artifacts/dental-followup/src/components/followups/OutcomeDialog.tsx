import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Followup } from "@workspace/shared";
import { FOLLOWUP_OUTCOME_STATUSES } from "@workspace/shared";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FieldLabel } from "@/components/implants/FieldLabel";
import { useFollowupOutcome } from "@/hooks/use-followups";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

interface OutcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  followup: Followup | null;
  /** Cancellation has its own confirmation dialog, so it is not a status option here. */
  title?: string;
  successMessage?: string;
}

export function OutcomeDialog(props: OutcomeDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-start">
        {props.followup ? <OutcomeForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function OutcomeForm({
  onOpenChange,
  patientId,
  followup,
  title,
  successMessage,
}: OutcomeDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const recordOutcome = useFollowupOutcome(patientId);
  const [status, setStatus] = useState<string>("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!status) {
      setError(t("followupForms.outcomeRequired"));
      return;
    }
    recordOutcome.mutate(
      {
        id: followup!.id,
        input: {
          status: status as (typeof FOLLOWUP_OUTCOME_STATUSES)[number],
          result: result.trim() || null,
          note: null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: successMessage ?? t("followupForms.saveChanges") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("followupForms.outcomeFailed"),
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
        <DialogTitle>{title ?? t("followupForms.outcomeTitle")}</DialogTitle>
        <DialogDescription>{followup!.followupType}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <RadioGroup value={status} onValueChange={(v) => { setStatus(v); setError(null); }} className="space-y-1">
            {FOLLOWUP_OUTCOME_STATUSES.filter((s) => s !== "ملغاة").map((s) => (
            <div key={s} className="flex items-center gap-2">
              <RadioGroupItem value={s} id={`outcome-${s}`} data-testid={`radio-outcome-${s}`} />
              <label htmlFor={`outcome-${s}`} className="text-sm cursor-pointer">
                {s}
              </label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-2">
          <FieldLabel label={t("followupForms.detailsOptional")} />
          <Textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            rows={2}
            data-testid="input-outcome-result"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={recordOutcome.isPending} data-testid="button-save-outcome">
          {recordOutcome.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>{t("financeForms.save")}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("financeForms.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
