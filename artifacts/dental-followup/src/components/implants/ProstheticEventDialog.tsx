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
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import { FieldLabel } from "./FieldLabel";
import { useCreateProstheticEvent } from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { localizeErrorMessage } from "@/lib/localize-error";
import { useEnumTranslation } from "@/i18n/use-enum-translation";
import { initialProstheticEventDate } from "@/lib/prosthetic-event-date";

const CASE_LEVEL = "__case_level__";

interface ProstheticEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  caseItem: ImplantCaseWithImplants;
  initialEventType?: ProstheticEventType;
  initialImplantId?: string | null;
  /** Keep the event type aligned with a requested implant-status transition. */
  lockInitialEventType?: boolean;
  onSuccess?: () => void;
}

export function ProstheticEventDialog({
  open,
  onOpenChange,
  patientId,
  caseItem,
  initialEventType,
  initialImplantId,
  lockInitialEventType,
  onSuccess,
}: ProstheticEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-start">
        <ProstheticEventForm
          patientId={patientId}
          caseItem={caseItem}
          onClose={() => onOpenChange(false)}
          initialEventType={initialEventType}
          initialImplantId={initialImplantId}
          lockInitialEventType={lockInitialEventType}
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
  lockInitialEventType,
  onSuccess,
}: Omit<ProstheticEventDialogProps, "open" | "onOpenChange"> & {
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { t } = useClinicalTranslation();
  const { enumLabel } = useEnumTranslation();
  const createEvent = useCreateProstheticEvent();
  const [eventType, setEventType] = useState<ProstheticEventType>(
    initialEventType ?? "تركيب دائم",
  );
  // Never infer a clinical event date from the entry timestamp. Requiring an
  // explicit choice prevents historical work entered today from becoming
  // current-period activity.
  const [eventDate, setEventDate] = useState(initialProstheticEventDate);
  const [implantId, setImplantId] = useState(initialImplantId ?? CASE_LEVEL);
  const [note, setNote] = useState("");
  const activeImplants = caseItem.implants.filter((implant) => implant.status === "active");

  const submit = () => {
    if (!eventDate) {
       toast({ variant: "destructive", title: t("implant.chooseProstheticDate") });
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
           toast({ title: t("implant.prostheticDocumented") });
              onSuccess?.();
          onClose();
        },
        onError: (error: Error) =>
          toast({
            variant: "destructive",
             title: t("implant.prostheticFailed"),
            description: localizeErrorMessage(error),
          }),
      },
    );
  };

  return (
    <>
      <DialogHeader className="text-start">
         <DialogTitle>{t("implant.prostheticTitle")}</DialogTitle>
        <DialogDescription className="text-start leading-relaxed">
           {t("implant.prostheticDescription")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
           <FieldLabel label={t("implant.prostheticType")} />
          <Select
            value={eventType}
            onValueChange={(value) => setEventType(value as typeof eventType)}
            disabled={lockInitialEventType}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROSTHETIC_EVENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {enumLabel("prostheticEventType", type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
           <FieldLabel label={t("implant.actualProstheticDate")} />
          <OperationalDatePicker value={eventDate} onChange={setEventDate} />
        </div>

        <div className="space-y-2">
           <FieldLabel label={t("implant.relatedImplant")} />
          <Select
            value={implantId}
            onValueChange={setImplantId}
            disabled={Boolean(initialImplantId)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
               <SelectItem value={CASE_LEVEL}>{t("implant.caseLevelProsthetic")}</SelectItem>
              {activeImplants.map((implant: Implant) => (
                <SelectItem key={implant.id} value={implant.id}>
                   {t("implant.tooth", { site: implant.site })}{implant.system ? ` — ${implant.system}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
           <FieldLabel htmlFor="prosthetic-event-note" label={t("implant.prostheticNote")} />
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
           {createEvent.isPending ? t("implant.savingRecord") : t("implant.saveRecord")}
        </Button>
        <Button variant="outline" className="btn-outline" onClick={onClose}>
           {t("implant.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}