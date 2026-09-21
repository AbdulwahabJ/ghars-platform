import { useEffect, useRef, useState } from "react";
import { usePatientAttachments, useDeletePatientAttachment, useUpdatePatientAttachment } from "@/hooks/use-attachments";
import { PatientAttachment, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FileDropzone, StagedFilesList } from "./StagedFilesList";
import { patientAttachmentMimeForFile, StagedFile, uploadFileWithProgress } from "./upload-utils";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { FileText, Image as ImageIcon, Paperclip, MoreVertical, Edit2, Trash2, Download, Eye, Loader2, Plus, CalendarIcon, FolderOpen, UploadCloud } from "lucide-react";
import { formatSaudiDate } from "@/lib/datetime";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientAttachmentCategory } from "@workspace/shared";
import { useImplantCases } from "@/hooks/use-implant-cases";
import { AttachmentViewer } from "./AttachmentViewer";
import { AttachmentEditDialog } from "./AttachmentEditDialog";
import { AttachmentDeleteDialog } from "./AttachmentDeleteDialog";

interface AttachmentsSectionProps {
  patientId: string;
  canDelete: boolean;
  disabled?: boolean;
}

export function AttachmentsSection({ patientId, canDelete, disabled }: AttachmentsSectionProps) {
  const { t } = useClinicalTranslation();
  const { toast } = useToast();
  const { data, isLoading, refetch } = usePatientAttachments(patientId);
  const { data: casesData } = useImplantCases(patientId);
  const attachments = data?.attachments || [];
  const implantCases = casesData?.items || [];

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [previewAttachment, setPreviewAttachment] = useState<PatientAttachment | null>(null);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const deleteMutation = useDeletePatientAttachment();

  const [editingAttachment, setEditingAttachment] = useState<PatientAttachment | null>(null);
  // removed editData

  const updateMutation = useUpdatePatientAttachment();
  const stagedFilesRef = useRef<StagedFile[]>([]);

  useEffect(() => {
    stagedFilesRef.current = stagedFiles;
  }, [stagedFiles]);

  useEffect(() => {
    return () => {
      stagedFilesRef.current.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  const handleAddFiles = (files: File[]) => {
    const newStaged = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      contentType: patientAttachmentMimeForFile(file)!,
      title: file.name,
      category: "OTHER" as PatientAttachmentCategory,
      note: "",
      fileDate: "",
      implantCaseId: null,
      status: "idle" as const,
      progress: 0,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setStagedFiles((prev) => [...prev, ...newStaged]);
    setIsAdding(true);
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const uploadStagedFiles = async () => {
    setIsUploading(true);

    const uploadResults = await Promise.all(
      stagedFiles.map(async (stagedFile) => {
        if (stagedFile.status === "success") return true;

        setStagedFiles((prev) =>
          prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "uploading", progress: 0, errorMessage: undefined } : f))
        );

        let objectPath = stagedFile.objectPath;
        let uploadToken = stagedFile.uploadToken;
        let uploadURL = "";

        try {
          const reqRes = await api.requestAttachmentUploadUrl(patientId, {
            name: stagedFile.file.name,
            size: stagedFile.file.size,
            contentType: stagedFile.contentType,
            title: stagedFile.title,
            category: stagedFile.category,
            note: stagedFile.note,
            fileDate: stagedFile.fileDate ? stagedFile.fileDate : undefined,
            implantCaseId: stagedFile.implantCaseId,
          });

          objectPath = reqRes.objectPath;
          uploadToken = reqRes.uploadToken;
          uploadURL = reqRes.uploadURL;

          setStagedFiles((prev) =>
            prev.map((f) => (f.id === stagedFile.id ? { ...f, objectPath, uploadToken } : f))
          );

          await uploadFileWithProgress(uploadURL, stagedFile.file, stagedFile.contentType, (prog) => {
            setStagedFiles((prev) => prev.map((f) => (f.id === stagedFile.id ? { ...f, progress: prog } : f)));
          });

          await api.finalizeAttachmentUpload(patientId, {
            objectPath,
            uploadToken,
            name: stagedFile.file.name,
            size: stagedFile.file.size,
            contentType: stagedFile.contentType,
            title: stagedFile.title,
            category: stagedFile.category,
            note: stagedFile.note,
            fileDate: stagedFile.fileDate ? stagedFile.fileDate : undefined,
            implantCaseId: stagedFile.implantCaseId,
          });

          setStagedFiles((prev) => prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "success", progress: 100 } : f)));
          return true;
        } catch (err: any) {
          if (objectPath && uploadToken) {
            api.cancelAttachmentUpload(patientId, { objectPath, uploadToken }).catch(() => {});
          }
          setStagedFiles((prev) =>
            prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "error", errorMessage: err.message || t("attachments.uploadFailed"), uploadToken: undefined, objectPath: undefined } : f))
          );
          return false;
        }
      })
    );

    setIsUploading(false);

    if (uploadResults.every(Boolean)) {
      toast({ title: t("attachments.uploadSuccess") });
      setIsAdding(false);
      setStagedFiles([]);
      refetch();
    } else {
      toast({ variant: "destructive", title: t("attachments.uploadFailed") });
    }
  };

  const handleDelete = () => {
    if (deleteAttachmentId) {
      deleteMutation.mutate(
        { patientId, attachmentId: deleteAttachmentId },
        {
          onSuccess: () => {
            setDeleteAttachmentId(null);
            refetch();
          },
          onError: () => {
            toast({ variant: "destructive", title: t("patient.error") });
            setDeleteAttachmentId(null);
          }
        }
      );
    }
  };

  
  const getCategoryLabel = (cat: string | null) => {
    if (!cat) return t("attachments.categories.OTHER");
    return t(`attachments.categories.${cat}` as any, { defaultValue: cat });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            {t("attachments.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("attachments.description")}</p>
        </div>
        {!isAdding && !disabled && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)} data-testid="button-add-attachment">
            <Plus className="h-4 w-4 ms-1.5" />
            {t("attachments.add")}
          </Button>
        )}
      </div>

      {isAdding && !disabled && (
        <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-4">
          <FileDropzone onFilesAdded={handleAddFiles} disabled={isUploading} />
          
          {stagedFiles.length > 0 && (
            <>
              <StagedFilesList 
                files={stagedFiles}
                disabled={isUploading}
                onRemove={removeStagedFile}
                onUpdateTitle={(id, title) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, title } : f))}
                onUpdateCategory={(id, category) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))}
                onUpdateNote={(id, note) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, note } : f))}
                onUpdateFileDate={(id, fileDate) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, fileDate } : f))}
                onUpdateImplantCaseId={(id, implantCaseId) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, implantCaseId } : f))}
                cases={implantCases}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setStagedFiles([]); setIsAdding(false); }} disabled={isUploading} data-testid="button-cancel-attachments">
                  {t("patient.cancel")}
                </Button>
                <Button className="btn-primary" onClick={uploadStagedFiles} disabled={isUploading} data-testid="button-save-attachments">
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin ms-2" /> : <UploadCloud className="h-4 w-4 ms-2" />}
                  {t("patient.save")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : attachments.length === 0 ? (
        !isAdding && (
          <div className="py-10 flex flex-col items-center justify-center text-center border border-dashed rounded-xl bg-card/50">
            <Paperclip className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium text-foreground">{t("attachments.empty")}</p>
            {!disabled && (
              <Button variant="link" size="sm" onClick={() => setIsAdding(true)} className="mt-2 text-primary" data-testid="button-empty-add-attachment">
                {t("attachments.add")}
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith("image/");
            const fileUrl = `${import.meta.env.BASE_URL}api/patients/${patientId}/attachments/${att.id}/file`;
            const fileSizeMb = (att.fileSize / 1024 / 1024).toFixed(1);
            const linkedCase = implantCases.find((item) => item.id === att.implantCaseId);

            return (
              <div key={att.id} className="group relative flex flex-col border border-border rounded-xl bg-card overflow-hidden hover:border-primary/30 transition-colors shadow-sm">
                <div className="h-32 bg-muted/40 border-b border-border flex items-center justify-center overflow-hidden relative cursor-pointer" onClick={() => setPreviewAttachment(att)}>
                  {isImage ? (
                    <img src={`${import.meta.env.BASE_URL}api/patients/${patientId}/attachments/${att.id}/thumbnail`} alt={att.title || ""} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="h-10 w-10 text-muted-foreground opacity-70" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                    <Eye className="h-6 w-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                  </div>
                </div>
                
                <div className="p-3 flex-1 flex flex-col min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className="font-semibold text-sm truncate" title={att.title || att.originalFilename}>
                      {att.title || att.originalFilename}
                    </h3>
                    <DropdownMenu dir={document.documentElement.dir as "ltr" | "rtl"}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1 text-muted-foreground hover:text-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => setPreviewAttachment(att)}>
                          <Eye className="h-4 w-4 ms-2" /> {t("attachments.preview")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          const a = document.createElement('a');
                          a.href = `${fileUrl}?download=1`;
                          a.download = att.originalFilename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}>
                          <Download className="h-4 w-4 ms-2" /> {t("attachments.download")}
                        </DropdownMenuItem>
                        {!disabled && (
                          <DropdownMenuItem onClick={() => {
                            setEditingAttachment(att);
                          }}>
                            <Edit2 className="h-4 w-4 ms-2" /> {t("attachments.edit")}
                          </DropdownMenuItem>
                        )}
                        {!disabled && canDelete && (
                          <DropdownMenuItem className="text-destructive focus:bg-destructive/10" onClick={() => setDeleteAttachmentId(att.id)}>
                            <Trash2 className="h-4 w-4 ms-2" /> {t("attachments.delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-auto pt-2">
                    <span className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-sm font-medium">
                      <FolderOpen className="h-3 w-3" />
                      {getCategoryLabel(att.category)}
                    </span>
                    <span className="mx-1">•</span>
                    <span>{fileSizeMb} MiB</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {att.fileDate ? formatSaudiDate(att.fileDate) : formatSaudiDate(att.createdAt)}
                  </div>
                  {att.uploadedByName ? (
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {t("attachments.uploadedBy", { name: att.uploadedByName })}
                    </div>
                  ) : null}
                  {att.implantCaseId ? (
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {t("attachments.linkedCase", {
                        case: linkedCase?.procedureDate
                          ? formatSaudiDate(linkedCase.procedureDate)
                          : att.implantCaseId,
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      {previewAttachment && (
        <AttachmentViewer
          attachments={attachments}
          initialAttachmentId={previewAttachment.id}
          patientId={patientId}
          onClose={() => setPreviewAttachment(null)}
          onEdit={(att) => {
            setPreviewAttachment(null);
            setEditingAttachment(att);
          }}
          onDelete={(id) => {
            setPreviewAttachment(null);
            setDeleteAttachmentId(id);
          }}
          canDelete={canDelete}
          disabled={disabled}
        />
      )}

      <AttachmentDeleteDialog
        attachmentId={deleteAttachmentId}
        isOpen={!!deleteAttachmentId}
        onOpenChange={(v) => !v && setDeleteAttachmentId(null)}
        isPending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      <AttachmentEditDialog
        attachment={editingAttachment}
        isOpen={!!editingAttachment}
        onOpenChange={(v) => !v && setEditingAttachment(null)}
        isPending={updateMutation.isPending}
        onSave={async (id, data) => {
          await updateMutation.mutateAsync({ patientId, attachmentId: id, data });
          setEditingAttachment(null);
          refetch();
        }}
      />
    </div>
  );
}
