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

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}

export function PaymentFormDialog(props: PaymentFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg text-right max-h-[90vh] overflow-y-auto" dir="rtl">
        <PaymentForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ onOpenChange, caseId }: PaymentFormDialogProps) {
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
      setError("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    if (!paymentDate) {
      setError("تاريخ الدفعة مطلوب.");
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
          toast({ title: "تم تسجيل الدفعة بنجاح." });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "تعذر تسجيل الدفعة",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <DialogHeader className="text-right sm:text-right">
        <DialogTitle>تسجيل دفعة</DialogTitle>
        <DialogDescription>
          الدفعات لا تُحذف — يمكن إلغاؤها فقط مع ذكر السبب.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
        <div className="space-y-2">
          <FieldLabel label="المبلغ (ر.س)" />
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
          <FieldLabel label="تاريخ الدفعة" />
          <OperationalDatePicker
            value={paymentDate}
            onChange={setPaymentDate}
            data-testid="input-payment-date"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel label="وصف الدفعة" />
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
          <FieldLabel label="رقم المرجع" />
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
          <span>تسجيل الدفعة</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
