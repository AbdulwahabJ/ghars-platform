import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Followup } from "@workspace/shared";
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
import { OperationalDateTimeFields } from "@/components/dashboard/OperationalDatePicker";
import { usePostponeFollowup } from "@/hooks/use-followups";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDateTime } from "@/lib/datetime";

interface PostponeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  followup: Followup | null;
}

export function PostponeDialog(props: PostponeDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        {props.followup ? <PostponeForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PostponeForm({ onOpenChange, patientId, followup }: PostponeDialogProps) {
  const { toast } = useToast();
  const postpone = usePostponeFollowup(patientId);
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!newScheduledAt) {
      setError("حدد الموعد الجديد.");
      return;
    }
    postpone.mutate(
      {
        id: followup!.id,
        input: { newScheduledAt, note: note.trim() || null },
      },
      {
        onSuccess: () => {
          toast({ title: "تم تأجيل المتابعة وإنشاء موعد جديد." });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "تعذر تأجيل المتابعة",
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
        <DialogTitle>تأجيل المتابعة</DialogTitle>
        <DialogDescription>
          يُحفظ الموعد الحالي في السجل بحالة «مؤجلة» ويُنشأ موعد جديد.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {followup!.scheduledAt ? (
          <p className="text-sm text-muted-foreground">
            الموعد الحالي: {formatSaudiDateTime(followup!.scheduledAt)}
          </p>
        ) : null}
        <OperationalDateTimeFields
          label="الموعد الجديد"
          required
          value={newScheduledAt}
          onChange={(v) => { setNewScheduledAt(v); setError(null); }}
          id="input-postpone-datetime"
        />
        <div className="space-y-2">
          <FieldLabel label="ملاحظة (اختياري)" />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            data-testid="input-postpone-note"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button onClick={submit} disabled={postpone.isPending} data-testid="button-save-postpone">
          {postpone.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          <span>تأجيل</span>
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
