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
import { useFollowupOutcome } from "@/hooks/use-followups";
import { useToast } from "@/hooks/use-toast";

interface CancelFollowupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  followup: Followup | null;
}

export function CancelFollowupDialog(props: CancelFollowupDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        {props.followup ? <CancelFollowupForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelFollowupForm({
  onOpenChange,
  patientId,
  followup,
}: CancelFollowupDialogProps) {
  const { toast } = useToast();
  const cancelFollowup = useFollowupOutcome(patientId);

  const submit = () => {
    cancelFollowup.mutate(
      {
        id: followup!.id,
        input: { status: "ملغاة", result: null, note: null },
      },
      {
        onSuccess: () => {
          toast({ title: "تم إلغاء المتابعة وحفظها في السجل." });
          onOpenChange(false);
        },
        onError: (error) => {
          toast({
            title: "تعذر إلغاء المتابعة",
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <DialogHeader className="text-right sm:text-right">
        <DialogTitle className="text-destructive">إلغاء المتابعة</DialogTitle>
        <DialogDescription>
          ستتوقف هذه المتابعة عن الظهور كموعد نشط، مع بقاء سجلها محفوظًا للمراجعة.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="mt-5 gap-2 sm:justify-start">
        <Button
          variant="destructive"
          onClick={submit}
          disabled={cancelFollowup.isPending}
          data-testid="button-confirm-cancel-followup"
        >
          {cancelFollowup.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : null}
          تأكيد الإلغاء
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancelFollowup.isPending}>
          رجوع
        </Button>
      </DialogFooter>
    </>
  );
}