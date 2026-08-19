import { useState } from "react";
import {
  PROSTHETIC_EVENT_TYPES,
  type Implant,
  type ImplantCaseWithImplants,
  type ProstheticEventType,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OperationalDatePicker, todayInRiyadh } from "@/components/dashboard/OperationalDatePicker";
import { FieldLabel } from "./FieldLabel";
import { useCreateProstheticEvent } from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";

const CASE_LEVEL = "__case_level__";

interface ProstheticEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  caseItem: ImplantCaseWithImplants;
  initialEventType?: ProstheticEventType;
  initialImplantId?: string | null;
  onSuccess?: () => void;
}

export function ProstheticEventDialog({
  open,
  onOpenChange,
  patientId,
  caseItem,
  initialEventType,
  initialImplantId,
  onSuccess,
}: ProstheticEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <ProstheticEventForm
          patientId={patientId}
          caseItem={caseItem}
          onClose={() => onOpenChange(false)}
          initialEventType={initialEventType}
          initialImplantId={initialImplantId}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProstheticEventForm({
  patientId,
  caseItem,
  onClose,
  initialEventType,
  initialImplantId,
  onSuccess,
}: Omit<ProstheticEventDialogProps, "open" | "onOpenChange"> & {
  onClose: () => void;
}) {
  const { toast } = useToast();
  const createEvent = useCreateProstheticEvent();
  const [eventType, setEventType] = useState<ProstheticEventType>(
    initialEventType ?? "تركيب دائم",
  );
  const [eventDate, setEventDate] = useState(todayInRiyadh);
  const [implantId, setImplantId] = useState(initialImplantId ?? CASE_LEVEL);
  const [note, setNote] = useState("");
  const activeImplants = caseItem.implants.filter((implant) => implant.status === "active");

  const submit = () => {
    if (!eventDate) {
      toast({ variant: "destructive", title: "اختر تاريخ التركيب أولًا." });
      return;
    }
    createEvent.mutate(
      {
        caseId: caseItem.id,
        patientId,
        data: {
          eventType,
          eventDate,
          implantId: implantId === CASE_LEVEL ? null : implantId,
          note: note || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "تم توثيق التركيب في السجل" });
              onSuccess?.();
          onClose();
        },
        onError: (error: Error) =>
          toast({
            variant: "destructive",
            title: "تعذر توثيق التركيب",
            description: error.message,
          }),
      },
    );
  };

  return (
    <>
      <DialogHeader className="text-right">
        <DialogTitle>توثيق تركيب</DialogTitle>
        <DialogDescription className="text-right leading-relaxed">
          سجّل تاريخ التركيب الفعلي. يظهر هذا السجل في ملخص العمل ولا يعتمد على حالة الحالة أو تاريخ تعديلها.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <FieldLabel label="نوع التركيب" />
          <Select value={eventType} onValueChange={(value) => setEventType(value as typeof eventType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent dir="rtl">
              {PROSTHETIC_EVENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <FieldLabel label="تاريخ التركيب الفعلي" />
          <OperationalDatePicker value={eventDate} onChange={setEventDate} />
        </div>

        <div className="space-y-2">
          <FieldLabel label="الزرعة المرتبطة (اختياري)" />
          <Select
            value={implantId}
            onValueChange={setImplantId}
            disabled={Boolean(initialImplantId)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value={CASE_LEVEL}>تركيب للحالة كاملة</SelectItem>
              {activeImplants.map((implant: Implant) => (
                <SelectItem key={implant.id} value={implant.id}>
                  السن {implant.site}{implant.system ? ` — ${implant.system}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="prosthetic-event-note" label="ملاحظة (اختيارية)" />
          <Textarea
            id="prosthetic-event-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            className="min-h-20"
          />
        </div>
      </div>

      <DialogFooter className="flex-row sm:justify-start gap-3">
        <Button className="btn-primary" onClick={submit} disabled={createEvent.isPending}>
          {createEvent.isPending ? "جارٍ التوثيق..." : "حفظ في السجل"}
        </Button>
        <Button variant="outline" className="btn-outline" onClick={onClose}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}