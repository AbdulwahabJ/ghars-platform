import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { DiscountInput } from "@workspace/shared";
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
import { FieldLabel } from "@/components/implants/FieldLabel";
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import { useCreateDiscount } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/money";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

interface DiscountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}

export function DiscountFormDialog(props: DiscountFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-start">
        <DiscountForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function DiscountForm({ onOpenChange, caseId }: DiscountFormDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const createDiscount = useCreateDiscount();

  const [amount, setAmount] = useState("");
  const [discountDate, setDiscountDate] = useState(() => todayIso());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value <= 0) {
      setError(t("financeForms.positiveAmount"));
      return;
    }
    if (!discountDate) {
      setError(t("financeForms.discountDateRequired"));
      return;
    }
    if (!reason.trim()) {
      setError(t("financeForms.discountReasonRequired"));
      return;
    }
    const data: DiscountInput = {
      amount: Math.round(value * 100) / 100,
      discountDate,
      reason: reason.trim(),
    };
    createDiscount.mutate(
      { caseId, data },
      {
        onSuccess: () => {
          toast({ title: t("financeForms.discountAdded") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("financeForms.discountAddFailed"),
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
        <DialogTitle>{t("financeForms.addDiscount")}</DialogTitle>
        <DialogDescription>
          {t("financeForms.discountDescription")}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <FieldLabel label={t("financeForms.amount")} />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              data-testid="input-discount-amount"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel label={t("financeForms.discountDate")} />
            <OperationalDatePicker
              value={discountDate}
              onChange={setDiscountDate}
              data-testid="input-discount-date"
            />
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("financeForms.discountReason")} />
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={2}
            data-testid="input-discount-reason"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={createDiscount.isPending} data-testid="button-save-discount">
          {createDiscount.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>{t("financeForms.add")}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("financeForms.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
