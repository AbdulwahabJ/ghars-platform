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
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

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
      <DialogContent className="sm:max-w-md text-start">
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
  const { t } = useTranslation("operations");
  const voidPayment = useVoidPayment();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!reason.trim()) {
      setError(t("financeForms.voidReasonRequired"));
      return;
    }
    voidPayment.mutate(
      { id: payment.id, caseId, data: { reason: reason.trim() } },
      {
        onSuccess: () => {
          toast({ title: t("financeForms.paymentVoided") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("financeForms.voidFailed"),
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
        <DialogTitle>{t("financeForms.voidPayment")}</DialogTitle>
        <DialogDescription>
          {t("financeForms.voidDescription", { amount: formatMoney(payment.amount), date: formatSaudiDate(payment.paymentDate) })}
        </DialogDescription>
      </DialogHeader>
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {t("financeForms.voidWarning")}
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
          {t("financeForms.back")}
        </Button>
      </DialogFooter>
    </>
  );
}
