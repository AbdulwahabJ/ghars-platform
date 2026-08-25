import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { FieldLabel } from "@/components/implants/FieldLabel";
import { useUpdateBaseAmount } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

interface FinalTotalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  currentFinalTotal: number;
  chargesTotal: number;
  discountsTotal: number;
}

export function FinalTotalDialog({
  open,
  onOpenChange,
  caseId,
  currentFinalTotal,
  chargesTotal,
  discountsTotal,
}: FinalTotalDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const update = useUpdateBaseAmount();
  const [value, setValue] = useState(() => String(currentFinalTotal));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const finalTotal = Number(value);
    if (value.trim() === "" || Number.isNaN(finalTotal) || finalTotal < 0) {
      setError(t("financeForms.validTotal"));
      return;
    }

    const baseTreatmentAmount =
      Math.round((finalTotal - chargesTotal + discountsTotal) * 100) / 100;
    if (baseTreatmentAmount < 0) {
      setError(t("financeForms.totalBelowNetCharges"));
      return;
    }

    update.mutate(
      { caseId, data: { baseTreatmentAmount } },
      {
        onSuccess: () => {
          toast({ title: t("financeForms.totalUpdated") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("financeForms.totalUpdateFailed"),
            description: localizeErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-start">
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle>{t("financeForms.editFinalTotal")}</DialogTitle>
          <DialogDescription>
            {t("financeForms.finalTotalDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <FieldLabel label={t("financeForms.finalTotalAmount")} />
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            data-testid="input-final-total"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={submit}
            disabled={update.isPending}
            data-testid="button-save-final-total"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
            {t("financeForms.save")}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            {t("financeForms.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}