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
import { useCreateDiscount } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/money";

interface DiscountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}

export function DiscountFormDialog(props: DiscountFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <DiscountForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function DiscountForm({ onOpenChange, caseId }: DiscountFormDialogProps) {
  const { toast } = useToast();
  const createDiscount = useCreateDiscount();

  const [amount, setAmount] = useState("");
  const [discountDate, setDiscountDate] = useState(() => todayIso());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value <= 0) {
      setError("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    if (!discountDate) {
      setError("تاريخ الخصم مطلوب.");
      return;
    }
    if (!reason.trim()) {
      setError("سبب الخصم مطلوب.");
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
          toast({ title: "تمت إضافة الخصم بنجاح." });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "تعذر إضافة الخصم",
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
        <DialogTitle>إضافة خصم</DialogTitle>
        <DialogDescription>
          يُخصم المبلغ من الإجمالي النهائي للحالة تلقائيًا.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              data-testid="input-discount-amount"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel label="تاريخ الخصم" />
            <Input
              type="date"
              value={discountDate}
              onChange={(e) => setDiscountDate(e.target.value)}
              data-testid="input-discount-date"
            />
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel label="سبب الخصم" />
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
          <span>إضافة</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
