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

interface NewPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewPatientDialog({ open, onOpenChange }: NewPatientDialogProps) {
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
          toast({ title: "تم تسجيل المريض بنجاح" });
          onOpenChange(false);
          form.reset();
          setLocation(`/patients/${res.patient.id}`);
        },
        onError: (err: any) => {
          if (err.code === "DUPLICATE_ACTIVE") {
             setDuplicateStatus("active");
             setDuplicateData({ id: err.data?.patientId });
          } else if (err.code === "DUPLICATE_ARCHIVED") {
             setDuplicateStatus("archived");
             setDuplicateData({ id: err.data?.patientId });
          } else {
            toast({
              variant: "destructive",
              title: "خطأ",
              description: err.message || "فشل تسجيل المريض"
            });
          }
        }
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: err.message || "حدث خطأ أثناء التحقق من رقم الملف."
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
          toast({ title: "تم استعادة ملف المريض بنجاح" });
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
        <DialogContent className="sm:max-w-xl text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">تسجيل حالة زراعة جديدة</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fileNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الملف <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="أدخل رقم الملف" {...field} dir="ltr" className="text-right" />
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
                      <FormLabel>الاسم الكامل <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="اسم المريض الثلاثي أو الرباعي" {...field} />
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
                      <FormLabel>رقم الجوال (اختياري)</FormLabel>
                      <FormControl>
                        <Input placeholder="05XXXXXXXX" {...field} value={field.value || ""} dir="ltr" className="text-right" />
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
                      <FormLabel>العمر (اختياري)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="العمر" 
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
                    <FormLabel>ملاحظة إدارية (اختياري)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="أي ملاحظات عامة حول المريض..." {...field} value={field.value || ""} rows={3} className="resize-none" />
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
                      <span>حفظ وتسجيل المريض</span>
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="btn-outline w-full sm:w-auto mt-0">
                  إلغاء
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Duplicate Active Dialog */}
      <Dialog open={duplicateStatus === "active"} onOpenChange={(v) => !v && setDuplicateStatus(null)}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-primary">المريض مسجل مسبقًا</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              هذا المريض مسجل مسبقًا. هل تريد فتح ملفه وإضافة حالة جديدة؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={handleOpenPatient} className="btn-primary w-full sm:w-auto">
              فتح ملف المريض
            </Button>
            <Button variant="outline" onClick={() => setDuplicateStatus(null)} className="btn-outline w-full sm:w-auto">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Archived Dialog */}
      <Dialog open={duplicateStatus === "archived"} onOpenChange={(v) => !v && setDuplicateStatus(null)}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive">الملف مؤرشف</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              هذا المريض ({duplicateData?.name || "صاحب رقم الملف المدخل"}) مسجل مسبقًا ولكن ملفه مؤرشف.
              لا يمكن إضافة حالات لملف مؤرشف.
              <br /><br />
              هل ترغب في استعادة الملف وتنشيطه؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={handleRestorePatient} disabled={restorePatient.isPending} className="btn-primary w-full sm:w-auto">
              {restorePatient.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>استعادة الملف</span>}
            </Button>
            <Button variant="outline" onClick={() => setDuplicateStatus(null)} className="btn-outline w-full sm:w-auto">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
