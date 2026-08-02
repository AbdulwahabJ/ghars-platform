import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { Payment } from "@workspace/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useVoidPayment } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";

interface VoidPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  payment: Payment | null;
}

export function VoidPaymentDialog(props: VoidPaymentDialogProps) {
  const { open, onOpenChange, payment } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        {payment ? <VoidPaymentForm {...props} payment={payment} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function VoidPaymentForm({
  onOpenChange,
  caseId,
  payment,
}: VoidPaymentDialogProps & { payment: Payment }) {
  const { toast } = useToast();
  const voidPayment = useVoidPayment();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!reason.trim()) {
      setError("سبب الإلغاء مطلوب.");
      return;
    }
    voidPayment.mutate(
      { id: payment.id, caseId, data: { reason: reason.trim() } },
      {
        onSuccess: () => {
          toast({ title: "تم إلغاء الدفعة وإعادة احتساب المبالغ." });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "تعذر إلغاء الدفعة",
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
        <DialogTitle>إلغاء دفعة</DialogTitle>
        <DialogDescription>
          الدفعة بمبلغ {formatMoney(payment.amount)} بتاريخ{" "}
          {formatSaudiDate(payment.paymentDate)}.
        </DialogDescription>
      </DialogHeader>
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          لا يمكن التراجع عن إلغاء الدفعة. ستبقى الدفعة ظاهرة في السجل بحالة
          &quot;ملغاة&quot; ولن تُحتسب ضمن المدفوع.
        </AlertDescription>
      </Alert>
      <div className="space-y-2 py-2">
        <FieldLabel label="سبب الإلغاء" />
        <Textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          rows={2}
          data-testid="input-void-reason"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <DialogFooter className="gap-2 sm:justify-start">
        <Button
          variant="destructive"
          onClick={submit}
          disabled={voidPayment.isPending}
          data-testid="button-confirm-void"
        >
          {voidPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>تأكيد الإلغاء</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          تراجع
        </Button>
      </DialogFooter>
    </>
  );
}
