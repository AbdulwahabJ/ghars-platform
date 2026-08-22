import React, { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { usePatient, useUpdatePatient, useArchivePatient, useRestorePatient } from "@/hooks/use-patients";
import { formatSaudiDate } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Archive, RefreshCw, Save, AlertCircle, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PatientUpdate } from "@workspace/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ImplantsTab } from "@/components/implants/ImplantsTab";
import { PaymentsTab } from "@/components/finance/PaymentsTab";
import { FollowupsTab } from "@/components/followups/FollowupsTab";
import { SummaryTab } from "@/components/summary/SummaryTab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PatientFile() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data, isLoading } = usePatient(id || "");
  const updatePatient = useUpdatePatient();
  const archivePatient = useArchivePatient();
  const restorePatient = useRestorePatient();

  const patient = data?.patient;
  const canArchive = user?.role === "ADMIN";

  const requestedTab = new URLSearchParams(location.split("?")[1] ?? "").get("tab");
  const [activeTab, setActiveTab] = useState<"data" | "implants" | "payments" | "followup" | "summary">(
    requestedTab === "followup" ? "followup" : "data",
  );
  
  // Local state for editing
  const [formData, setFormData] = useState<PatientUpdate>({});
  const [isDirty, setIsDirty] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingTab, setPendingTab] = useState<typeof activeTab | null>(null);
  
  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (patient && initializedForId.current !== patient.id) {
      initializedForId.current = patient.id;
      setFormData({
        fileNumber: patient.fileNumber,
        fullName: patient.fullName,
        mobileNumber: patient.mobileNumber,
        age: patient.age,
        administrativeNote: patient.administrativeNote
      });
      setIsDirty(false);
    }
  }, [patient]);

  const handleFieldChange = <K extends keyof PatientUpdate>(field: K, value: PatientUpdate[K]) => {
    setFormData((prev: PatientUpdate) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!id || !isDirty) return;
    updatePatient.mutate({ id, data: formData }, {
      onSuccess: () => {
        toast({ title: "تم حفظ التعديلات بنجاح" });
        setIsDirty(false);
      },
      onError: (err: Error) => {
        toast({ variant: "destructive", title: "خطأ", description: err.message || "فشل حفظ التعديلات" });
      }
    });
  };

  const handleArchive = () => {
    if (!id) return;
    archivePatient.mutate(id, {
      onSuccess: () => {
        toast({ title: "تم أرشفة الملف" });
        setShowArchiveConfirm(false);
      }
    });
  };

  const handleRestore = () => {
    if (!id) return;
    restorePatient.mutate(id, {
      onSuccess: () => {
        toast({ title: "تم استعادة الملف" });
      }
    });
  };

  const tryChangeTab = (tab: typeof activeTab) => {
    if (isDirty) {
      setPendingTab(tab);
      setShowUnsavedWarning(true);
    } else {
      setActiveTab(tab);
    }
  };

  const confirmLeave = () => {
    setIsDirty(false);
    setShowUnsavedWarning(false);
    if (pendingTab) setActiveTab(pendingTab);
    setPendingTab(null);
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (!patient) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold mb-2">المريض غير موجود</h2>
          <Button onClick={() => setLocation("/patients")} variant="outline" className="mt-4">
            العودة لقائمة المرضى
          </Button>
        </div>
      </Shell>
    );
  }

  const isArchived = patient.status === "archived";

  const tabs = [
    { id: "data", label: "البيانات" },
    { id: "implants", label: "الزرعات" },
    { id: "payments", label: "الدفعات" },
    { id: "followup", label: "المتابعة" },
    { id: "summary", label: "الملخص" },
  ] as const;

  return (
    <Shell>
      <div className="space-y-6 animate-in fade-in duration-500 pb-20" id="tour-patient-workspace">
        
        {/* Navigation Back */}
        <div className="print:hidden">
          <Button variant="ghost" onClick={() => setLocation("/patients")} className="text-muted-foreground hover:text-foreground gap-2 -ml-4">
            <ArrowRight className="h-4 w-4" />
            العودة للقائمة
          </Button>
        </div>

        {/* Compact Patient Header */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
          <div className="flex items-start gap-4">
            <div className={`h-14 w-14 rounded-full flex items-center justify-center shrink-0 text-xl font-bold ${
              isArchived ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
            }`}>
              {patient.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-foreground">{patient.fullName}</h1>
                {isArchived && (
                  <span className="bg-muted text-muted-foreground px-2 py-1 rounded text-xs font-medium">مؤرشف</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground mt-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">رقم الملف:</span>
                  <span dir="ltr" className="font-mono">{patient.fileNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">الجوال:</span>
                  <span dir="ltr" className="font-mono">{patient.mobileNumber || "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">العمر:</span>
                  <span>{patient.age ? `${patient.age} سنة` : "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">تاريخ الإضافة:</span>
                  <span>{formatSaudiDate(patient.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
          
        </div>

        {/* Tabs Navigation */}
        <div className="flex overflow-x-auto hide-scrollbar border-b border-border bg-card rounded-t-2xl px-2 pt-2 print:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tryChangeTab(tab.id)}
              className={`px-6 py-3 font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/5 rounded-t-lg"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-lg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-card border border-border border-t-0 rounded-b-2xl shadow-sm min-h-[400px]">
          {activeTab === "data" ? (
            <div className="p-6 md:p-8">
              {isArchived && (
                <Alert className="mb-6 bg-muted border-muted-foreground/20 text-muted-foreground">
                  <Archive className="h-4 w-4" />
                  <AlertDescription>
                    هذا الملف مؤرشف. لا يمكن تعديل البيانات. يمكنك استعادة الملف لتفعيل التعديل.
                  </AlertDescription>
                </Alert>
              )}

              <div className="max-w-2xl space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">رقم الملف</label>
                    <Input 
                      value={formData.fileNumber || ""} 
                      onChange={(e) => handleFieldChange("fileNumber", e.target.value)}
                      disabled={isArchived}
                      dir="ltr"
                      className="text-right disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">الاسم الكامل</label>
                    <Input 
                      value={formData.fullName || ""} 
                      onChange={(e) => handleFieldChange("fullName", e.target.value)}
                      disabled={isArchived}
                      className="disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">رقم الجوال</label>
                    <Input 
                      value={formData.mobileNumber || ""} 
                      onChange={(e) => handleFieldChange("mobileNumber", e.target.value)}
                      disabled={isArchived}
                      dir="ltr"
                      className="text-right disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">العمر</label>
                    <Input 
                      type="number"
                      value={formData.age ?? ""} 
                      onChange={(e) => handleFieldChange("age", e.target.value === "" ? null : Number(e.target.value))}
                      disabled={isArchived}
                      className="disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">ملاحظة إدارية</label>
                  <Textarea 
                    value={formData.administrativeNote || ""} 
                    onChange={(e) => handleFieldChange("administrativeNote", e.target.value)}
                    disabled={isArchived}
                    rows={4}
                    className="resize-none disabled:opacity-50"
                  />
                </div>

                {!isArchived ? (
                  <div className="flex items-center justify-between pt-6 border-t border-border mt-8">
                    {canArchive && (
                      <Button
                        onClick={() => setShowArchiveConfirm(true)}
                        variant="outline"
                        className="text-destructive border-destructive hover:bg-destructive/10"
                      >
                        <Archive className="h-4 w-4 mr-2 ml-2" />
                        أرشفة الملف
                      </Button>
                    )}
                    <Button 
                      onClick={handleSave} 
                      disabled={!isDirty || updatePatient.isPending}
                      className="btn-primary"
                    >
                      {updatePatient.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2 ml-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2 ml-2" />
                      )}
                      <span>حفظ التعديلات</span>
                    </Button>
                  </div>
                ) : (
                  <div className="pt-6 border-t border-border mt-8 flex justify-end">
                    <Button onClick={handleRestore} disabled={restorePatient.isPending} className="btn-primary">
                      {restorePatient.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2 ml-2" /> : <RefreshCw className="h-4 w-4 mr-2 ml-2" />}
                      <span>استعادة الملف</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === "implants" ? (
            <ImplantsTab patient={patient} />
          ) : activeTab === "payments" ? (
            <PaymentsTab patient={patient} />
          ) : activeTab === "followup" ? (
            <FollowupsTab patient={patient} />
          ) : (
            <SummaryTab patient={patient} />
          )}
        </div>
      </div>

      {/* Archive Confirm Dialog */}
      <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive">تأكيد الأرشفة</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              هل أنت متأكد من رغبتك في أرشفة ملف المريض "{patient.fullName}"؟
              لن تتمكن من تعديل بياناته أثناء وجوده في الأرشيف.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={handleArchive} disabled={archivePatient.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto px-6 h-[46px] rounded-[10px]">
              {archivePatient.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>نعم، أرشفة</span>}
            </Button>
            <Button variant="outline" onClick={() => setShowArchiveConfirm(false)} className="btn-outline w-full sm:w-auto">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Warning */}
      <Dialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-primary">تغييرات غير محفوظة</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              لقد قمت بإجراء تعديلات على بيانات المريض ولم تقم بحفظها. 
              إذا انتقلت الآن ستفقد هذه التعديلات.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={() => setShowUnsavedWarning(false)} className="btn-primary w-full sm:w-auto">
              البقاء للحفظ
            </Button>
            <Button variant="outline" onClick={confirmLeave} className="btn-outline text-destructive border-destructive hover:bg-destructive/10 w-full sm:w-auto">
              تجاهل التعديلات والانتقال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
