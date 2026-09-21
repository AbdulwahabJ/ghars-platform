import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { patientInputSchema, PatientInput, PatientAttachmentCategory } from "@workspace/shared";
import { normalizeMobile } from "@workspace/shared";
import { useCreatePatient, useCheckFileNumber, useRestorePatient } from "@/hooks/use-patients";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertCircle, ArrowRight, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { localizeErrorMessage } from "@/lib/localize-error";
import { FileDropzone, StagedFilesList } from "./attachments/StagedFilesList";
import { patientAttachmentMimeForFile, StagedFile, uploadFileWithProgress } from "./attachments/upload-utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface NewPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewPatientDialog({ open, onOpenChange }: NewPatientDialogProps) {
  const { t } = useClinicalTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const createPatient = useCreatePatient();
  const checkFileNumber = useCheckFileNumber();
  const restorePatient = useRestorePatient();
  
  const [duplicateStatus, setDuplicateStatus] = useState<"active" | "archived" | null>(null);
  const [duplicateData, setDuplicateData] = useState<{ id?: string; name?: string } | null>(null);

  // Attachments State
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const stagedFilesRef = useRef<StagedFile[]>([]);

  useEffect(() => {
    stagedFilesRef.current = stagedFiles;
  }, [stagedFiles]);

  useEffect(() => () => {
    stagedFilesRef.current.forEach((file) => {
      if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
    });
  }, []);

  const form = useForm<PatientInput>({
    resolver: zodResolver(patientInputSchema),
    defaultValues: {
      fileNumber: "",
      fullName: "",
      mobileNumber: "",
      age: undefined,
      administrativeNote: "",
    },
  });

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
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const uploadStagedFiles = async (patientId: string, filesToUpload: StagedFile[]) => {
    setIsUploadingFiles(true);

    const uploadResults = await Promise.all(
      filesToUpload.map(async (stagedFile) => {
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
          if (stagedFile.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl);
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

    setIsUploadingFiles(false);

    if (uploadResults.every(Boolean)) {
      toast({ title: t("patient.registered") });
      onOpenChange(false);
      form.reset();
      setCreatedPatientId(null);
      setStagedFiles([]);
      setLocation(`/patients/${patientId}`);
    }
  };

  const onSubmit = async (data: PatientInput) => {
    if (data.mobileNumber) {
      const mobileRes = normalizeMobile(data.mobileNumber);
      if (!mobileRes.ok) {
        form.setError("mobileNumber", { message: mobileRes.message });
        return;
      }
    }

    try {
      const checkRes = await checkFileNumber.mutateAsync(data.fileNumber);
      
      if (checkRes.status === "active") {
        setDuplicateStatus("active");
        setDuplicateData({ id: checkRes.patientId, name: checkRes.fullName });
        return;
      } else if (checkRes.status === "archived") {
        setDuplicateStatus("archived");
        setDuplicateData({ id: checkRes.patientId, name: checkRes.fullName });
        return;
      }

      createPatient.mutate(data, {
        onSuccess: async (res) => {
          if (stagedFiles.length === 0) {
            toast({ title: t("patient.registered") });
            onOpenChange(false);
            form.reset();
            setLocation(`/patients/${res.patient.id}`);
            return;
          }

          setCreatedPatientId(res.patient.id);
          await uploadStagedFiles(res.patient.id, stagedFiles);
        },
        onError: (err: Error) => {
          const apiErr = err instanceof ApiError ? err : undefined;
          const patientId = (apiErr?.data as { patientId?: string } | undefined)?.patientId;
          if (apiErr?.code === "DUPLICATE_ACTIVE") {
             setDuplicateStatus("active");
             setDuplicateData({ id: patientId });
          } else if (apiErr?.code === "DUPLICATE_ARCHIVED") {
             setDuplicateStatus("archived");
             setDuplicateData({ id: patientId });
          } else {
            toast({
              variant: "destructive",
               title: t("patient.error"),
               description: localizeErrorMessage(err)
            });
          }
        }
      });
    } catch (err) {
      toast({
        variant: "destructive",
         title: t("patient.error"),
          description: localizeErrorMessage(err)
      });
    }
  };

  const handleOpenPatient = () => {
    if (duplicateData?.id) {
      onOpenChange(false);
      setDuplicateStatus(null);
      form.reset();
      setLocation(`/patients/${duplicateData.id}`);
    }
  };

  const handleRestorePatient = () => {
    if (duplicateData?.id) {
      restorePatient.mutate(duplicateData.id, {
        onSuccess: () => {
           toast({ title: t("patient.restoreSuccess") });
          onOpenChange(false);
          setDuplicateStatus(null);
          form.reset();
          setLocation(`/patients/${duplicateData.id}`);
        }
      });
    }
  };

  const hasUploadErrors = stagedFiles.some((f) => f.status === "error");

  const handleResetDialog = () => {
    onOpenChange(false);
    setTimeout(() => {
      form.reset();
      setCreatedPatientId(null);
      stagedFiles.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      setStagedFiles([]);
    }, 200);
  };

  const handleContinueToPatient = () => {
    if (createdPatientId) {
      handleResetDialog();
      setLocation(`/patients/${createdPatientId}`);
    }
  };

  const handleRetryUploads = () => {
    if (createdPatientId) {
      uploadStagedFiles(createdPatientId, stagedFiles.filter(f => f.status !== "success"));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => {
        // Prevent closing by clicking outside if we are currently uploading or if patient is created but files failed
        if (!v && (isUploadingFiles || createdPatientId)) return;
        if (!v) handleResetDialog();
      }}>
       <DialogContent className="sm:max-w-2xl text-start max-h-[90vh] overflow-y-auto" dir={document.documentElement.dir}>
          <DialogHeader>
             <DialogTitle className="text-xl font-bold">{t("patient.registerTitle")}</DialogTitle>
          </DialogHeader>

          {createdPatientId ? (
            <div className="py-6 space-y-6">
              {hasUploadErrors ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t("attachments.partialSuccess")}</AlertTitle>
                  <AlertDescription>
                    {t("attachments.uploadFailed")} - {stagedFiles.filter(f => f.status === "error").length} file(s) failed.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-lg font-medium">{t("attachments.uploading")}</p>
                </div>
              )}

              <StagedFilesList
                files={stagedFiles}
                disabled={isUploadingFiles}
                onRemove={removeStagedFile}
                onUpdateTitle={(id, title) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, title } : f))}
                onUpdateCategory={(id, category) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))}
                onUpdateNote={(id, note) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, note } : f))}
                onUpdateFileDate={(id, fileDate) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, fileDate } : f))}
                onUpdateImplantCaseId={(id, implantCaseId) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, implantCaseId } : f))}
                cases={[]}
              />

              {hasUploadErrors && !isUploadingFiles && (
                <DialogFooter className="mt-6 flex-row gap-3 sm:justify-start border-t border-border pt-4">
                  <Button onClick={handleRetryUploads} className="btn-primary w-full sm:w-auto">
                    <RefreshCw className="h-4 w-4 ms-2" />
                    {t("attachments.retry")}
                  </Button>
                  <Button variant="outline" onClick={handleContinueToPatient} className="btn-outline w-full sm:w-auto">
                    {t("attachments.continue")}
                    <ArrowRight className="h-4 w-4 me-2 rtl:rotate-180" />
                  </Button>
                </DialogFooter>
              )}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fileNumber"
                    render={({ field }) => (
                      <FormItem>
                         <FormLabel>{t("patient.fileNumber")} <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                           <Input placeholder={t("patient.filePlaceholder")} {...field} dir="ltr" className="text-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                         <FormLabel>{t("patient.fullName")} <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                           <Input placeholder={t("patient.namePlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mobileNumber"
                    render={({ field }) => (
                      <FormItem>
                         <FormLabel>{t("patient.mobile")} ({t("patient.optional")})</FormLabel>
                        <FormControl>
                          <Input placeholder="05XXXXXXXX" {...field} value={field.value || ""} dir="ltr" className="text-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="age"
                    render={({ field }) => (
                      <FormItem>
                         <FormLabel>{t("patient.age")} ({t("patient.optional")})</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                             placeholder={t("patient.age")}
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="administrativeNote"
                  render={({ field }) => (
                    <FormItem>
                     <FormLabel>{t("patient.administrativeNote")} ({t("patient.optional")})</FormLabel>
                      <FormControl>
                       <Textarea placeholder={t("patient.notePlaceholder")} {...field} value={field.value || ""} rows={3} className="resize-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3 pt-2 border-t border-border">
                  <div>
                    <h3 className="text-sm font-semibold">{t("attachments.title")} <span className="text-muted-foreground font-normal text-xs">({t("patient.optional")})</span></h3>
                    <p className="text-xs text-muted-foreground">{t("attachments.description")}</p>
                  </div>

                  <FileDropzone onFilesAdded={handleAddFiles} />

                  <StagedFilesList
                    files={stagedFiles}
                    onRemove={removeStagedFile}
                    onUpdateTitle={(id, title) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, title } : f))}
                    onUpdateCategory={(id, category) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))}
                    onUpdateNote={(id, note) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, note } : f))}
                    onUpdateFileDate={(id, fileDate) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, fileDate } : f))}
                    onUpdateImplantCaseId={(id, implantCaseId) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, implantCaseId } : f))}
                    cases={[]}
                  />
                </div>

                <DialogFooter className="mt-8 flex-row gap-3 sm:justify-start pt-2 border-t border-border">
                  <Button type="submit" className="btn-primary w-full sm:w-auto" disabled={createPatient.isPending || checkFileNumber.isPending}>
                    {(createPatient.isPending || checkFileNumber.isPending) ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-5 w-5" />
                         <span>{t("patient.saveAndRegister")}</span>
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleResetDialog} className="btn-outline w-full sm:w-auto mt-0">
                     {t("patient.cancel")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Active Dialog */}
      <Dialog open={duplicateStatus === "active"} onOpenChange={(v) => !v && setDuplicateStatus(null)}>
        <DialogContent className="sm:max-w-md text-start">
          <DialogHeader>
           <DialogTitle className="text-xl font-bold text-primary">{t("patient.duplicateActiveTitle")}</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
               {t("patient.duplicateActiveDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={handleOpenPatient} className="btn-primary w-full sm:w-auto">
               {t("patient.openPatient")}
            </Button>
            <Button variant="outline" onClick={() => setDuplicateStatus(null)} className="btn-outline w-full sm:w-auto">
               {t("patient.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Archived Dialog */}
      <Dialog open={duplicateStatus === "archived"} onOpenChange={(v) => !v && setDuplicateStatus(null)}>
        <DialogContent className="sm:max-w-md text-start">
          <DialogHeader>
           <DialogTitle className="text-xl font-bold text-destructive">{t("patient.archivedFile")}</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
               {t("patient.archivedDuplicate", { name: duplicateData?.name || t("patient.fileNumber") })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={handleRestorePatient} disabled={restorePatient.isPending} className="btn-primary w-full sm:w-auto">
               {restorePatient.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>{t("patient.restore")}</span>}
            </Button>
            <Button variant="outline" onClick={() => setDuplicateStatus(null)} className="btn-outline w-full sm:w-auto">
               {t("patient.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
