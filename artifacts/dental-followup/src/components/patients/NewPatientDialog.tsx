import React, { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { patientInputSchema, PatientInput } from "@workspace/shared";
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
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { localizeErrorMessage } from "@/lib/localize-error";

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

  const onSubmit = async (data: PatientInput) => {
    // Validate mobile first if provided
    if (data.mobileNumber) {
      const mobileRes = normalizeMobile(data.mobileNumber);
      if (!mobileRes.ok) {
        form.setError("mobileNumber", { message: mobileRes.message });
        return;
      }
    }

    try {
      // Check duplicate
      const checkRes = await checkFileNumber.mutateAsync(data.fileNumber);
      
      if (checkRes.status === "active") {
        setDuplicateStatus("active");
        setDuplicateData({ id: checkRes.patientId, name: checkRes.fullName });
        return; // Stop form submission
      } else if (checkRes.status === "archived") {
        setDuplicateStatus("archived");
        setDuplicateData({ id: checkRes.patientId, name: checkRes.fullName });
        return; // Stop form submission
      }

      // If available, proceed to create
      createPatient.mutate(data, {
        onSuccess: (res) => {
          toast({ title: t("patient.registered") });
          onOpenChange(false);
          form.reset();
          setLocation(`/patients/${res.patient.id}`);
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-xl text-start" dir={document.documentElement.dir}>
          <DialogHeader>
             <DialogTitle className="text-xl font-bold">{t("patient.registerTitle")}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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

              <DialogFooter className="mt-6 flex-row gap-3 sm:justify-start">
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
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="btn-outline w-full sm:w-auto mt-0">
                   {t("patient.cancel")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
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
