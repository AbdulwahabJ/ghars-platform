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
  const update = useUpdateBaseAmount();
  const [value, setValue] = useState(() => String(currentFinalTotal));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const finalTotal = Number(value);
    if (value.trim() === "" || Number.isNaN(finalTotal) || finalTotal < 0) {
      setError("أدخل إجماليًا صحيحًا (0 أو أكثر).");
      return;
    }

    const baseTreatmentAmount =
      Math.round((finalTotal - chargesTotal + discountsTotal) * 100) / 100;
    if (baseTreatmentAmount < 0) {
      setError("الإجمالي لا يمكن أن يكون أقل من صافي الرسوم بعد الخصومات.");
      return;
    }

    update.mutate(
      { caseId, data: { baseTreatmentAmount } },
      {
        onSuccess: () => {
          toast({ title: "تم تحديث إجمالي الحالة." });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "تعذر تحديث إجمالي الحالة",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>تعديل إجمالي تكلفة الحالة</DialogTitle>
          <DialogDescription>
            الرسوم والخصومات محفوظة؛ سيتم تعديل القيمة الأساسية للوصول إلى الإجمالي الجديد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <FieldLabel label="إجمالي تكلفة الحالة (ر.س)" />
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
            حفظ
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}