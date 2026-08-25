import { useState } from "react";
import { Loader2 } from "lucide-react";
import { COMMUNICATION_RESULTS } from "@workspace/shared";
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
import { useRecordCommunicationResult } from "@/hooks/use-followups";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

interface CommunicationResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  communicationId: string | null;
}

export function CommunicationResultDialog(props: CommunicationResultDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-start">
        {props.communicationId ? <CommunicationResultForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Inner form, also rendered inline as the second step of the WhatsApp dialog. */
export function CommunicationResultForm({
  onOpenChange,
  patientId,
  communicationId,
}: Omit<CommunicationResultDialogProps, "open">) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const recordResult = useRecordCommunicationResult(patientId);
  const [result, setResult] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!result) {
      setError(t("followupForms.selectCommunicationResult"));
      return;
    }
    recordResult.mutate(
      {
        id: communicationId!,
        input: {
          communicationResult:
            result as (typeof COMMUNICATION_RESULTS)[number],
          resultNote: note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("followupForms.communicationResultSaved") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("followupForms.communicationResultFailed"),
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
        <DialogTitle>{t("followupForms.communicationResultTitle")}</DialogTitle>
        <DialogDescription>
          {t("followupForms.communicationResultDescription")}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <RadioGroup
          value={result}
          onValueChange={(v) => {
            setResult(v);
            setError(null);
          }}
          className="space-y-1"
        >
          {COMMUNICATION_RESULTS.map((r) => (
            <div key={r} className="flex items-center gap-2">
              <RadioGroupItem value={r} id={`result-${r}`} data-testid={`radio-result-${r}`} />
              <label htmlFor={`result-${r}`} className="text-sm cursor-pointer">
                {r}
              </label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-2">
          <FieldLabel label={t("followupForms.optionalNote")} />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            data-testid="input-result-note"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={recordResult.isPending} data-testid="button-save-result">
          {recordResult.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>{t("financeForms.save")}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("followupForms.later")}
        </Button>
      </DialogFooter>
    </>
  );
}
