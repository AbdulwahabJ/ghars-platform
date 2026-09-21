import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";

interface AttachmentDeleteDialogProps {
  attachmentId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function AttachmentDeleteDialog({ attachmentId, isOpen, onOpenChange, onConfirm, isPending }: AttachmentDeleteDialogProps) {
  const { t } = useClinicalTranslation();

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent dir={document.documentElement.dir}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">{t("attachments.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("attachments.deleteConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-start gap-2">
          <AlertDialogAction onClick={(e) => { e.preventDefault(); onConfirm(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("attachments.delete")}
          </AlertDialogAction>
          <AlertDialogCancel disabled={isPending}>{t("patient.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
