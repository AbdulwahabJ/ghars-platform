import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CHARGE_TYPES,
  type ChargeInput,
  type ImplantCaseWithImplants,
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
import { useCreateCharge } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/money";
import { useTranslation } from "react-i18next";

const NO_IMPLANT = "__none__";

interface ChargeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseItem: ImplantCaseWithImplants;
}

export function ChargeFormDialog(props: ChargeFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg text-right max-h-[90vh] overflow-y-auto" dir="rtl">
        <ChargeForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ChargeForm({ onOpenChange, caseItem }: ChargeFormDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const createCharge = useCreateCharge();
  const activeImplants = caseItem.implants.filter((i) => i.status === "active");

  const [chargeType, setChargeType] =
    useState<(typeof CHARGE_TYPES)[number]>("إجراء إضافي");
  const [amount, setAmount] = useState("");
  const [chargeDate, setChargeDate] = useState(() => todayIso());
  const [implantId, setImplantId] = useState<string>(NO_IMPLANT);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value <= 0) {
      setError(t("financeForms.positiveAmount"));
      return;
    }
    if (!chargeDate) {
      setError(t("financeForms.chargeDateRequired"));
      return;
    }
    const data: ChargeInput = {
      chargeType,
      amount: Math.round(value * 100) / 100,
      chargeDate,
      implantId: implantId === NO_IMPLANT ? null : implantId,
      description: description.trim() || null,
      note: note.trim() || null,
    };
    createCharge.mutate(
      { caseId: caseItem.id, data },
      {
        onSuccess: () => {
          toast({ title: t("financeForms.chargeAdded") });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: t("financeForms.chargeAddFailed"),
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
        <DialogTitle>{t("financeForms.addAdditionalCharge")}</DialogTitle>
        <DialogDescription>
          {t("financeForms.chargeDescription")}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
        <div className="space-y-2">
          <FieldLabel label={t("financeForms.chargeType")} />
          <Select
            value={chargeType}
            onValueChange={(v) => setChargeType(v as (typeof CHARGE_TYPES)[number])}
          >
            <SelectTrigger data-testid="select-charge-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHARGE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
            data-testid="input-charge-amount"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("financeForms.chargeDate")} />
          <OperationalDatePicker
            value={chargeDate}
            onChange={setChargeDate}
            data-testid="input-charge-date"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("financeForms.linkImplant")} />
          <Select value={implantId} onValueChange={setImplantId}>
            <SelectTrigger data-testid="select-charge-implant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_IMPLANT}>{t("financeForms.noLink")}</SelectItem>
              {activeImplants.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {t("financeForms.implantTooth", { site: i.site })}
                  {i.system ? ` — ${i.system}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <FieldLabel label={t("financeForms.description")} />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="input-charge-description"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <FieldLabel label={t("financeForms.note")} />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            data-testid="input-charge-note"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={createCharge.isPending} data-testid="button-save-charge">
          {createCharge.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>{t("financeForms.add")}</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("financeForms.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
