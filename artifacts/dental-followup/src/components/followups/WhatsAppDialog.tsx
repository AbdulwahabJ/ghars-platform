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
      <DialogContent className="sm:max-w-lg text-right max-h-[90vh] overflow-y-auto" dir="rtl">
        <WhatsAppForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

const NO_TEMPLATE = "__none__";

function WhatsAppForm({ onOpenChange, patient, followup }: WhatsAppDialogProps) {
  const { toast } = useToast();
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
      setError("نص الرسالة مطلوب.");
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
            title: "تعذر تسجيل عملية التواصل",
            description: err instanceof Error ? err.message : undefined,
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
      <DialogHeader className="text-right sm:text-right">
        <DialogTitle>تواصل عبر واتساب</DialogTitle>
        <DialogDescription>
          يفتح النظام واتساب برسالة جاهزة قابلة للتعديل، ولا يؤكد إرسالها أو
          قراءتها.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          المريض: <span className="notranslate">{patient.fullName}</span>
          {patient.mobileNumber ? (
            <>
              {" — "}
              <span dir="ltr" className="notranslate">{patient.mobileNumber}</span>
            </>
          ) : null}
        </p>
        {!mobile ? (
          <p className="text-sm text-destructive">
            رقم الجوال غير صالح للتواصل عبر واتساب. حدّث رقم المريض أولًا.
          </p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <FieldLabel label="القالب (اختياري)" />
            <Select value={templateId} onValueChange={applyTemplate} dir="rtl">
              <SelectTrigger data-testid="select-whatsapp-template">
                <SelectValue placeholder="بدون قالب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>بدون قالب</SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <FieldLabel label="سبب التواصل" />
            <Select value={reason} onValueChange={setReason} dir="rtl">
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
          <FieldLabel label="نص الرسالة" />
          <Textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
            rows={6}
            placeholder="اختر قالبًا أو اكتب رسالة"
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
          <span>فتح واتساب</span>
          <ExternalLink className="h-3.5 w-3.5 me-1" />
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
