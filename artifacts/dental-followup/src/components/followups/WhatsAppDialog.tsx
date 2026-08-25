import { useState } from "react";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import type { Followup, Patient } from "@workspace/shared";
import {
  COMMUNICATION_REASONS,
  buildWhatsappLink,
  renderTemplate,
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
import { FieldLabel } from "@/components/implants/FieldLabel";
import {
  useCreateCommunication,
  useWhatsappTemplates,
} from "@/hooks/use-followups";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { CommunicationResultForm } from "./CommunicationResultDialog";
import { toRiyadhTimeValue } from "./followup-utils";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

interface WhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient;
  /** Optional follow-up context: fills {{date}} / {{time}} placeholders. */
  followup?: Followup | null;
}

export function WhatsAppDialog(props: WhatsAppDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg text-start max-h-[90vh] overflow-y-auto">
        <WhatsAppForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

const NO_TEMPLATE = "__none__";

function WhatsAppForm({ onOpenChange, patient, followup }: WhatsAppDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const { data: templates } = useWhatsappTemplates();
  const createCommunication = useCreateCommunication(patient.id);

  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [reason, setReason] = useState<string>("تواصل عام");
  const [message, setMessage] = useState("");
  const [resultCommunicationId, setResultCommunicationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mobile = patient.mobileNormalized;
  const dateValue = followup?.scheduledAt
    ? formatSaudiDate(followup.scheduledAt)
    : undefined;
  const timeValue = followup?.scheduledAt
    ? toRiyadhTimeValue(followup.scheduledAt)
    : undefined;

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    setError(null);
    if (id === NO_TEMPLATE) return;
    const template = (templates ?? []).find((t) => t.id === id);
    if (!template) return;
    setMessage(
      renderTemplate(template.body, {
        patientName: patient.fullName,
        date: dateValue,
        time: timeValue,
      }),
    );
    if ((COMMUNICATION_REASONS as readonly string[]).includes(template.name)) {
      setReason(template.name);
    }
  };

  const openWhatsapp = () => {
    if (!mobile) return;
    if (!message.trim()) {
      setError(t("followupForms.messageRequired"));
      return;
    }
    window.open(buildWhatsappLink(mobile, message.trim()), "_blank", "noopener");
    createCommunication.mutate(
      {
        implantCaseId: followup?.implantCaseId ?? null,
        templateId: templateId === NO_TEMPLATE ? null : templateId,
        communicationReason: reason,
        renderedMessage: message.trim(),
      },
      {
        onSuccess: (data) => {
          setResultCommunicationId(data.communication.id);
        },
        onError: (err) => {
          toast({
            title: t("followupForms.communicationCreateFailed"),
            description: localizeErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  if (resultCommunicationId) {
    return (
      <CommunicationResultForm
        onOpenChange={(v) => {
          if (!v) {
            setResultCommunicationId(null);
            onOpenChange(false);
          }
        }}
        patientId={patient.id}
        communicationId={resultCommunicationId}
      />
    );
  }

  return (
    <>
      <DialogHeader className="text-start sm:text-start">
        <DialogTitle>{t("followupForms.whatsappTitle")}</DialogTitle>
        <DialogDescription>
          {t("followupForms.whatsappDescription")}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          {t("followupForms.patient")} <span className="notranslate">{patient.fullName}</span>
          {patient.mobileNumber ? (
            <>
              {" — "}
              <span dir="ltr" className="notranslate">{patient.mobileNumber}</span>
            </>
          ) : null}
        </p>
        {!mobile ? (
          <p className="text-sm text-destructive">
            {t("followupForms.invalidMobile")}
          </p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <FieldLabel label={t("followupForms.templateOptional")} />
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger data-testid="select-whatsapp-template">
                <SelectValue placeholder={t("followupForms.noTemplate")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>{t("followupForms.noTemplate")}</SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <FieldLabel label={t("followupForms.communicationReason")} />
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger data-testid="select-whatsapp-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMUNICATION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel label={t("followupForms.messageText")} />
          <Textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
            rows={6}
            placeholder={t("followupForms.chooseTemplate")}
            data-testid="input-whatsapp-message"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button
          onClick={openWhatsapp}
          disabled={!mobile || createCommunication.isPending}
          className="bg-[hsl(var(--color-whatsapp,142_70%_45%))] text-white hover:opacity-90"
          style={{ backgroundColor: "#25D366" }}
          data-testid="button-open-whatsapp"
        >
          {createCommunication.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin ms-1" />
          ) : (
            <MessageCircle className="h-4 w-4 ms-1" />
          )}
          <span>{t("followupForms.openWhatsapp")}</span>
          <ExternalLink className="h-3.5 w-3.5 me-1" />
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("financeForms.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
