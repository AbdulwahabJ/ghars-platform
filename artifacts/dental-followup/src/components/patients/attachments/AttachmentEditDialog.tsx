import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { PatientAttachment } from "@/lib/api";
import { PatientAttachmentCategory } from "@workspace/shared";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";

interface AttachmentEditDialogProps {
  attachment: PatientAttachment | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: { title: string; category: PatientAttachmentCategory | "OTHER"; note: string; fileDate: string | null }) => void;
  isPending: boolean;
}

export function AttachmentEditDialog({ attachment, isOpen, onOpenChange, onSave, isPending }: AttachmentEditDialogProps) {
  const { t } = useClinicalTranslation();
  const [editData, setEditData] = useState<{ title: string; category: PatientAttachmentCategory | "OTHER"; note: string; fileDate: string }>({
    title: "",
    category: "OTHER",
    note: "",
    fileDate: ""
  });

  useEffect(() => {
    if (attachment && isOpen) {
      const fd = attachment.fileDate ? attachment.fileDate.split("T")[0] : "";
      setEditData({
        title: attachment.title || "",
        category: attachment.category || "OTHER",
        note: attachment.note || "",
        fileDate: fd
      });
    }
  }, [attachment, isOpen]);

  const handleSave = () => {
    if (!attachment) return;
    onSave(attachment.id, {
      title: editData.title,
      category: editData.category,
      note: editData.note,
      fileDate: editData.fileDate || null
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir={document.documentElement.dir}>
        <DialogHeader>
          <DialogTitle>{t("attachments.edit")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("attachments.titleLabel")}</label>
            <Input 
              value={editData.title} 
              onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
              placeholder={attachment?.originalFilename}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("attachments.categoryLabel")}</label>
              <Select value={editData.category} onValueChange={(v) => setEditData(prev => ({ ...prev, category: v as PatientAttachmentCategory }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RADIOLOGY">{t("attachments.categories.RADIOLOGY")}</SelectItem>
                  <SelectItem value="MEDICAL_REPORT">{t("attachments.categories.MEDICAL_REPORT")}</SelectItem>
                  <SelectItem value="CONSENT">{t("attachments.categories.CONSENT")}</SelectItem>
                  <SelectItem value="REFERRAL">{t("attachments.categories.REFERRAL")}</SelectItem>
                  <SelectItem value="CLINICAL_IMAGE">{t("attachments.categories.CLINICAL_IMAGE")}</SelectItem>
                  <SelectItem value="LAB_RESULT">{t("attachments.categories.LAB_RESULT")}</SelectItem>
                  <SelectItem value="EXTERNAL_DOCUMENT">{t("attachments.categories.EXTERNAL_DOCUMENT")}</SelectItem>
                  <SelectItem value="OTHER">{t("attachments.categories.OTHER")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("attachments.fileDateLabel")}</label>
              <Input 
                type="date"
                value={editData.fileDate} 
                onChange={(e) => setEditData(prev => ({ ...prev, fileDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("attachments.noteLabel")}</label>
            <Textarea 
              value={editData.note} 
              onChange={(e) => setEditData(prev => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-start gap-2">
          <Button onClick={handleSave} disabled={isPending} className="btn-primary">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("attachments.saveChanges")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("patient.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
