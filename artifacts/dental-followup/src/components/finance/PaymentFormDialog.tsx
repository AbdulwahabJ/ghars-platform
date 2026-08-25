import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type PaymentInput,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldLabel } from "@/components/implants/FieldLabel";
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import { useCreatePayment } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/money";
import { localizeErrorMessage } from "@/lib/localize-error";
import { useTranslation } from "react-i18next";

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}

export function PaymentFormDialog(props: PaymentFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg text-start max-h-[90vh] overflow-y-auto">
        <PaymentForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ onOpenChange, caseId }: PaymentFormDialogProps) {
  const { t } = useTranslation("operations");
  const { toast } = useToast();
  const createPayment = useCreatePayment();

  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => todayIso());
  const [paymentLabel, setPaymentLabel] =
    useState<(typeof PAYMENT_LABELS)[number]>("دفعة أولى");
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("شبكة");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value <= 0) {
      setError(t("financeForms.positiveAmount"));
      return;
    }
    if (!paymentDate) {
      setError(t("financeForms.paymentDateRequired"));
      return;
    }
    const data: PaymentInput = {
      amount: Math.round(value * 100) / 100,
      installmentId: null,
      paymentDate,
      paymentLabel,
      paymentMethod,
      referenceNumber: referenceNumber.trim() || null,
      note: note.trim() || null,
    };
    createPayment.mutate(
      { caseId, data },
      {
        onSuccess: () => {
          toast({ title: t("financeForms.paymentRecorded") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("financeForms.paymentRecordFailed"),
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
        <DialogTitle>{t("financeForms.recordPayment")}</DialogTitle>
        <DialogDescription>
          الدفعات لا تُحذف — يمكن إلغاؤها فقط مع ذكر السبب.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
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
            data-testid="input-payment-amount"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("financeForms.paymentDate")} />
          <OperationalDatePicker
            value={paymentDate}
            onChange={setPaymentDate}
            data-testid="input-payment-date"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("financeForms.paymentDescription")} />
          <Select
            value={paymentLabel}
            onValueChange={(v) => setPaymentLabel(v as (typeof PAYMENT_LABELS)[number])}
          >
            <SelectTrigger data-testid="select-payment-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_LABELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <FieldLabel label="طريقة الدفع" />
          <Select
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as (typeof PAYMENT_METHODS)[number])}
          >
            <SelectTrigger data-testid="select-payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("financeForms.referenceNumber")} />
          <Input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            data-testid="input-payment-reference"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <FieldLabel label="ملاحظة" />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            data-testid="input-payment-note"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={createPayment.isPending} data-testid="button-save-payment">
          {createPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>{t("financeForms.recordPayment")}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
