import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PatientAttachment, patientAttachmentFileUrl } from "@/lib/api";
import { ChevronLeft, ChevronRight, Download, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";

interface AttachmentViewerProps {
  attachments: PatientAttachment[];
  initialAttachmentId: string | null;
  patientId: string;
  onClose: () => void;
  onEdit?: (attachment: PatientAttachment) => void;
  onDelete?: (attachmentId: string) => void;
  canDelete?: boolean;
  disabled?: boolean;
}

export function AttachmentViewer({
  attachments,
  initialAttachmentId,
  patientId,
  onClose,
  onEdit,
  onDelete,
  canDelete,
  disabled
}: AttachmentViewerProps) {
  const { t } = useClinicalTranslation();
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  useEffect(() => {
    if (initialAttachmentId) {
      const idx = attachments.findIndex(a => a.id === initialAttachmentId);
      if (idx !== -1) setCurrentIndex(idx);
    }
  }, [initialAttachmentId, attachments]);

  if (currentIndex === -1 || !attachments[currentIndex]) return null;

  const attachment = attachments[currentIndex];
  const isImage = attachment.mimeType.startsWith("image/");
  const fileUrl = patientAttachmentFileUrl(patientId, attachment.id);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : 0));
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : attachments.length - 1));
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = patientAttachmentFileUrl(patientId, attachment.id, true);
    a.download = attachment.originalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden bg-background" dir={document.documentElement.dir}>
        <DialogHeader className="p-4 border-b bg-card z-10 flex-shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="truncate flex-1 pr-6" title={attachment.title || attachment.originalFilename}>
            {attachment.title || attachment.originalFilename}
          </DialogTitle>
          <div className="flex items-center gap-1 sm:gap-2 pr-4" dir="ltr">
            {!disabled && onEdit && (
              <Button variant="outline" size="sm" className="px-2 sm:px-3" onClick={() => onEdit(attachment)} title={t("attachments.edit")}>
                <Edit2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("attachments.edit")}</span>
              </Button>
            )}
            {!disabled && canDelete && onDelete && (
              <Button variant="destructive" size="sm" className="px-2 sm:px-3" onClick={() => onDelete(attachment.id)} title={t("attachments.delete")}>
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("attachments.delete")}</span>
              </Button>
            )}
            <Button variant="secondary" size="sm" className="px-2 sm:px-3" onClick={handleDownload} title={t("attachments.download")}>
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("attachments.download")}</span>
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden bg-black/5 flex relative min-h-0">
          {attachments.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 bg-background/50 hover:bg-background/80 rounded-full"
              onClick={(e) => { e.stopPropagation(); document.documentElement.dir === 'rtl' ? handleNext() : handlePrev(); }}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}

          <div className="flex-1 flex items-center justify-center p-4 overflow-auto min-h-0 w-full relative">
            {isImage ? (
              <img
                src={fileUrl}
                alt={attachment.title || ""}
                className="max-w-full max-h-full object-contain drop-shadow-sm rounded-sm"
              />
            ) : (
              <iframe
                src={fileUrl}
                title={attachment.title || "PDF Preview"}
                className="w-full h-full border-0 bg-white rounded-md shadow-sm"
              />
            )}
          </div>

          {attachments.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 bg-background/50 hover:bg-background/80 rounded-full"
              onClick={(e) => { e.stopPropagation(); document.documentElement.dir === 'rtl' ? handlePrev() : handleNext(); }}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
        </div>
        <div className="p-3 border-t bg-card flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {attachment.category ? t(`attachments.categories.${attachment.category}` as any, { defaultValue: attachment.category }) : t("attachments.categories.OTHER")}
            {attachment.fileDate ? ` • ${attachment.fileDate.split("T")[0]}` : ""}
          </div>
          <div>
            {currentIndex + 1} / {attachments.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
