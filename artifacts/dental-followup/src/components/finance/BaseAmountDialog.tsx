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

interface BaseAmountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  current: number;
}

export function BaseAmountDialog(props: BaseAmountDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <BaseAmountForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function BaseAmountForm({ onOpenChange, caseId, current }: BaseAmountDialogProps) {
  const { toast } = useToast();
  const update = useUpdateBaseAmount();
  const [value, setValue] = useState(() => (current > 0 ? String(current) : ""));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const amount = Number(value);
    if (value.trim() === "" || Number.isNaN(amount) || amount < 0) {
      setError("أدخل مبلغًا صحيحًا (0 أو أكثر).");
      return;
    }
    update.mutate(
      { caseId, data: { baseTreatmentAmount: Math.round(amount * 100) / 100 } },
      {
        onSuccess: () => {
          toast({ title: "تم تحديث قيمة العلاج الأساسية." });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "تعذر تحديث قيمة العلاج",
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
        <DialogTitle>قيمة العلاج الأساسية</DialogTitle>
        <DialogDescription>
          يُحتسب الإجمالي النهائي تلقائيًا: القيمة الأساسية + الرسوم − الخصومات.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-2">
        <FieldLabel label="المبلغ (ر.س)" />
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          data-testid="input-base-amount"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={update.isPending} data-testid="button-save-base-amount">
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          حفظ
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
