import React, { useState, useMemo } from "react";
import { usePatientAttachments, useDeletePatientAttachment, useUpdatePatientAttachment } from "@/hooks/use-attachments";
import { Button } from "@/components/ui/button";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { FileText, Image as ImageIcon, Paperclip, Plus, Eye, Loader2, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PatientAttachment, api } from "@/lib/api";
import { AttachmentViewer } from "./AttachmentViewer";
import { AttachmentEditDialog } from "./AttachmentEditDialog";
import { AttachmentDeleteDialog } from "./AttachmentDeleteDialog";
import { FileDropzone, StagedFilesList } from "./StagedFilesList";
import { patientAttachmentMimeForFile, StagedFile, uploadFileWithProgress } from "./upload-utils";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientAttachmentCategory } from "@workspace/shared";

interface CompactAttachmentsProps {
  patientId: string;
  canDelete: boolean;
  disabled?: boolean;
}

export function CompactAttachments({ patientId, canDelete, disabled }: CompactAttachmentsProps) {
  const { t } = useClinicalTranslation();
  const { toast } = useToast();
  const { data, isLoading, refetch } = usePatientAttachments(patientId);
  const attachments = data?.attachments || [];

  const [isAdding, setIsAdding] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState<PatientAttachment | null>(null);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const updateMutation = useUpdatePatientAttachment();
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const deleteMutation = useDeletePatientAttachment();

  const stagedFilesRef = React.useRef<StagedFile[]>([]);
  React.useEffect(() => { stagedFilesRef.current = stagedFiles; }, [stagedFiles]);
  React.useEffect(() => {
    return () => {
      stagedFilesRef.current.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  const filteredAttachments = useMemo(() => {
    if (categoryFilter === "ALL") return attachments;
    return attachments.filter(a => a.category === categoryFilter);
  }, [attachments, categoryFilter]);

  const visibleAttachments = attachments.slice(0, 6);

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

  const uploadStagedFiles = async () => {
    setIsUploading(true);
    const uploadResults = await Promise.all(
      stagedFiles.map(async (stagedFile) => {
        if (stagedFile.status === "success") return true;
        setStagedFiles((prev) => prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "uploading", progress: 0, errorMessage: undefined } : f)));

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

          if (stagedFile.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl);
          setStagedFiles((prev) => prev.map((f) => (f.id === stagedFile.id ? { ...f, status: "success", progress: 100, previewUrl: undefined } : f)));
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

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getAttachmentThumbnail = (att: PatientAttachment) => {
    const isImage = att.mimeType.startsWith("image/");
    if (isImage) {
      return <img src={`${import.meta.env.BASE_URL}api/patients/${patientId}/attachments/${att.id}/thumbnail`} alt={att.title || ""} className="w-full h-full object-cover" />;
    }
    return <FileText className="h-6 w-6 text-muted-foreground opacity-70" />;
  };

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden mb-4 shadow-sm">
      <div className="bg-muted/30 p-3 border-b border-border flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          {t("attachments.title")}
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{attachments.length}</span>
        </h4>
        <div className="flex items-center gap-2">
          {!disabled && !isAdding && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setIsAdding(true)}>
              <Plus className="h-3 w-3 sm:me-1" />
              <span className="hidden sm:inline">{t("attachments.add")}</span>
              <span className="sr-only sm:hidden">{t("attachments.add")}</span>
            </Button>
          )}
          {attachments.length > 6 && (
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setViewAllOpen(true)}>
              {t("patient.all")}
            </Button>
          )}
        </div>
      </div>

      <div className="p-3">
        {isAdding && !disabled && (
          <div className="mb-4 bg-muted/20 border border-border rounded-lg p-3 space-y-3">
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
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => { setStagedFiles([]); setIsAdding(false); }} disabled={isUploading}>
                    {t("patient.cancel")}
                  </Button>
                  <Button size="sm" onClick={uploadStagedFiles} disabled={isUploading}>
                    {isUploading ? <Loader2 className="h-3 w-3 animate-spin me-2" /> : null}
                    {t("patient.save")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {attachments.length === 0 && !isAdding ? (
          <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed rounded-lg bg-muted/10">
            <Paperclip className="h-8 w-8 text-muted-foreground opacity-50 mb-2" />
            <p className="text-sm font-medium text-foreground">{t("attachments.empty")}</p>
            <p className="text-xs text-muted-foreground max-w-[250px] mt-1">{t("attachments.description")}</p>
            {!disabled && (
              <Button variant="link" size="sm" onClick={() => setIsAdding(true)} className="mt-2 h-8 text-primary">
                {t("attachments.add")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleAttachments.map(att => (
              <div 
                key={att.id} 
                className="w-20 h-20 border border-border rounded-md overflow-hidden bg-muted/20 relative group cursor-pointer"
                onClick={() => setPreviewAttachmentId(att.id)}
                title={att.title || att.originalFilename}
              >
                {getAttachmentThumbnail(att)}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                  <Eye className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                </div>
                {att.category && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[9px] text-white text-center py-0.5 truncate px-1">
                    {t(`attachments.categories.${att.category}` as any, { defaultValue: att.category })}
                  </div>
                )}
              </div>
            ))}
            {attachments.length > 6 && (
              <div 
                className="w-20 h-20 border border-border border-dashed rounded-md flex items-center justify-center bg-muted/10 text-muted-foreground text-xs font-medium cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setViewAllOpen(true)}
              >
                +{attachments.length - 6}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
        <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>{t("attachments.title")}</DialogTitle>
              <div className="flex items-center gap-2 mr-6">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px] h-8 text-sm">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("patient.all")}</SelectItem>
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
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 bg-muted/10">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAttachments.map(att => (
                <div 
                  key={att.id} 
                  className="border border-border rounded-lg overflow-hidden bg-card shadow-sm cursor-pointer group"
                  onClick={() => setPreviewAttachmentId(att.id)}
                >
                  <div className="h-32 bg-muted/30 relative">
                    {getAttachmentThumbnail(att)}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                      <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                    </div>
                  </div>
                  <div className="p-2 text-xs">
                    <div className="font-medium truncate" title={att.title || att.originalFilename}>
                      {att.title || att.originalFilename}
                    </div>
                    <div className="text-muted-foreground mt-1 flex justify-between">
                      <span className="truncate max-w-[60%]">
                        {att.category ? t(`attachments.categories.${att.category}` as any, { defaultValue: att.category }) : ""}
                      </span>
                      <span>{(att.fileSize / 1024 / 1024).toFixed(1)}M</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredAttachments.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {t("attachments.empty")}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {previewAttachmentId && (
        <AttachmentViewer
          attachments={viewAllOpen ? filteredAttachments : attachments}
          initialAttachmentId={previewAttachmentId}
          patientId={patientId}
          onClose={() => setPreviewAttachmentId(null)}
          onEdit={(att) => {
            setPreviewAttachmentId(null);
            setEditingAttachment(att);
          }}
          onDelete={(id) => {
            setPreviewAttachmentId(null);
            setDeleteAttachmentId(id);
          }}
          canDelete={canDelete}
          disabled={disabled}
        />
      )}

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

      <AttachmentDeleteDialog
        attachmentId={deleteAttachmentId}
        isOpen={!!deleteAttachmentId}
        onOpenChange={(v) => !v && setDeleteAttachmentId(null)}
        isPending={deleteMutation.isPending}
        onConfirm={async () => {
          if (deleteAttachmentId) {
            await deleteMutation.mutateAsync({ patientId, attachmentId: deleteAttachmentId });
            setDeleteAttachmentId(null);
            refetch();
          }
        }}
      />
    </div>
  );
}
