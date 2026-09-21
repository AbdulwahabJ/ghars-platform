import { useCallback, useState } from "react";
import { X, FileText, Image as ImageIcon, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { patientAttachmentMimeForFile, StagedFile } from "./upload-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientAttachmentCategory, ImplantCase } from "@workspace/shared";
import { useToast } from "@/hooks/use-toast";
import { PATIENT_ATTACHMENT_MAX_BYTES } from "@workspace/shared";

interface StagedFilesListProps {
  files: StagedFile[];
  onRemove: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateCategory: (id: string, category: PatientAttachmentCategory) => void;
  onUpdateNote: (id: string, note: string) => void;
  onUpdateFileDate: (id: string, date: string) => void;
  onUpdateImplantCaseId: (id: string, caseId: string | null) => void;
  disabled?: boolean;
  cases?: ImplantCase[];
}

export function StagedFilesList({ 
  files, 
  onRemove, 
  onUpdateTitle, 
  onUpdateCategory, 
  onUpdateNote,
  onUpdateFileDate,
  onUpdateImplantCaseId,
  disabled,
  cases = []
}: StagedFilesListProps) {
  const { t } = useClinicalTranslation();

  if (files.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      {files.map((file) => (
        <div key={file.id} className="flex flex-col sm:flex-row gap-3 p-3 border border-border rounded-lg bg-card shadow-sm relative overflow-hidden">
          {file.status === "uploading" && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${file.progress}%` }}
              />
            </div>
          )}
          
          <div className="w-16 h-16 flex-shrink-0 bg-muted/50 rounded-md border border-border flex items-center justify-center overflow-hidden">
            {file.file.type.startsWith("image/") && file.previewUrl ? (
              <img src={file.previewUrl} alt={file.file.name} className="w-full h-full object-cover" />
            ) : file.file.type === "application/pdf" ? (
              <FileText className="h-8 w-8 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          
          <div className="flex-grow min-w-0 flex flex-col justify-center space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <Input
                  value={file.title}
                  onChange={(e) => onUpdateTitle(file.id, e.target.value)}
                  placeholder={file.file.name}
                  className="h-8 text-sm font-medium"
                  disabled={disabled || file.status === "uploading" || file.status === "success"}
                  data-testid={`input-attachment-title-${file.id}`}
                />
              </div>
              {!disabled && file.status !== "uploading" && file.status !== "success" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(file.id)}
                  data-testid={`button-remove-attachment-${file.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={file.category || "OTHER"}
                onValueChange={(val) => onUpdateCategory(file.id, val as PatientAttachmentCategory)}
                disabled={disabled || file.status === "uploading" || file.status === "success"}
              >
                <SelectTrigger className="h-8 text-xs w-[140px]" data-testid={`select-attachment-category-${file.id}`}>
                  <SelectValue placeholder={t("attachments.categoryLabel")} />
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

              {cases.length > 0 && (
                <Select
                  value={file.implantCaseId || "none"}
                  onValueChange={(val) => onUpdateImplantCaseId(file.id, val === "none" ? null : val)}
                  disabled={disabled || file.status === "uploading" || file.status === "success"}
                >
                  <SelectTrigger className="h-8 text-xs w-[140px]" data-testid={`select-attachment-case-${file.id}`}>
                    <SelectValue placeholder={t("implant.case")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("implant.none")}</SelectItem>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {t("implant.case")} {new Date(c.createdAt).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Input 
                type="date"
                value={file.fileDate}
                onChange={(e) => onUpdateFileDate(file.id, e.target.value)}
                className="h-8 text-xs w-[130px]"
                disabled={disabled || file.status === "uploading" || file.status === "success"}
                data-testid={`input-attachment-date-${file.id}`}
              />

              <div className="w-full">
                <Textarea 
                  value={file.note}
                  onChange={(e) => onUpdateNote(file.id, e.target.value)}
                  placeholder={t("attachments.noteLabel")}
                  className="h-8 min-h-[32px] text-xs resize-none"
                  disabled={disabled || file.status === "uploading" || file.status === "success"}
                  data-testid={`input-attachment-note-${file.id}`}
                />
              </div>

              <div className="text-xs text-muted-foreground flex-shrink-0 mt-1">
                {(file.file.size / 1024 / 1024).toFixed(1)} MiB
              </div>
              
              {file.status === "error" && (
                <div className="text-xs text-destructive font-medium ml-auto mt-1">
                  {file.errorMessage || t("attachments.uploadFailed")}
                </div>
              )}
              {file.status === "success" && (
                <div className="text-xs text-status-success font-medium ml-auto mt-1">
                  {t("attachments.uploadSuccess")}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface FileDropzoneProps {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
}

export function FileDropzone({ onFilesAdded, disabled }: FileDropzoneProps) {
  const { t } = useClinicalTranslation();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled) return;
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, [disabled, onFilesAdded]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      // Reset input so the same file can be selected again if removed
      e.target.value = "";
    }
  }, [onFilesAdded]);

  const handleFiles = (files: File[]) => {
    const tooLarge = files.some((file) => file.size > PATIENT_ATTACHMENT_MAX_BYTES);
    const unsupported = files.some((file) => !patientAttachmentMimeForFile(file));
    const validFiles = files.filter(
      (file) => file.size <= PATIENT_ATTACHMENT_MAX_BYTES && patientAttachmentMimeForFile(file),
    );
    if (tooLarge) {
      toast({ variant: "destructive", title: t("attachments.fileTooLarge") });
    }
    if (unsupported) {
      toast({ variant: "destructive", title: t("attachments.unsupportedType") });
    }
    if (validFiles.length > 0) {
      onFilesAdded(validFiles);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer relative overflow-hidden ${
        isDragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        onChange={handleFileInput}
        disabled={disabled}
        data-testid="input-file-dropzone"
      />
      <UploadCloud className={`h-10 w-10 mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
      <p className="text-sm font-medium mb-1">{t("attachments.dropzone")}</p>
      <p className="text-xs text-muted-foreground">{t("attachments.supportedFiles")}</p>
    </div>
  );
}
