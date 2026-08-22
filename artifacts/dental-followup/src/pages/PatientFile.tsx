import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Archive,
  AlertCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { usePatient, useArchivePatient, useRestorePatient } from "@/hooks/use-patients";
import { useToast } from "@/hooks/use-toast";
import { PatientDetailsSection } from "@/components/patients/PatientDetailsSection";
import { ImplantsTab } from "@/components/implants/ImplantsTab";
import { PaymentsTab } from "@/components/finance/PaymentsTab";
import { FollowupsTab } from "@/components/followups/FollowupsTab";
import { SummaryTab } from "@/components/summary/SummaryTab";
import { formatSaudiDate } from "@/lib/datetime";

type PatientTab = "summary" | "procedures";

export default function PatientFile() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data, isLoading } = usePatient(id ?? "");
  const archivePatient = useArchivePatient();
  const restorePatient = useRestorePatient();
  const [showArchived, setShowArchived] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<PatientTab>("summary");

  const patient = data?.patient;
  const canArchive = user?.role === "ADMIN";

  const handleArchive = () => {
    if (!id) return;
    archivePatient.mutate(id, {
      onSuccess: () => {
        toast({ title: "تمت أرشفة ملف المريض" });
        setShowArchiveConfirm(false);
      },
      onError: (error: Error) =>
        toast({ variant: "destructive", title: "تعذر الأرشفة", description: error.message }),
    });
  };

  const handleRestore = () => {
    if (!id) return;
    restorePatient.mutate(id, {
      onSuccess: () => toast({ title: "تمت استعادة ملف المريض" }),
      onError: (error: Error) =>
        toast({ variant: "destructive", title: "تعذرت الاستعادة", description: error.message }),
    });
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (!patient) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-2 text-xl font-bold">المريض غير موجود</h2>
          <Button onClick={() => setLocation("/patients")} variant="outline" className="mt-4">
            العودة لقائمة المرضى
          </Button>
        </div>
      </Shell>
    );
  }

  const isArchived = patient.status === "archived";

  return (
    <Shell>
      <main className="animate-in fade-in duration-500 pb-20" id="tour-patient-workspace">
        <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" onClick={() => setLocation("/patients")} className="-ms-4 gap-2 text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" />
            العودة للقائمة
          </Button>
        </div>

        <header className="border-b border-border pb-5 print:hidden">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">الاسم الكامل</p>
              <p className="truncate font-bold text-foreground">{patient.fullName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رقم الملف</p>
              <p className="font-semibold text-foreground notranslate" dir="ltr">{patient.fileNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رقم الجوال</p>
              <p className="font-semibold text-foreground notranslate" dir="ltr">{patient.mobileNumber || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">العمر</p>
              <p className="font-semibold text-foreground">{patient.age != null ? `${patient.age} سنة` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تاريخ الإضافة</p>
              <p className="font-semibold text-foreground">{formatSaudiDate(patient.createdAt)}</p>
            </div>
          </div>
        </header>

        {isArchived ? (
          <Alert className="mt-5 print:hidden">
            <Archive className="h-4 w-4" />
            <AlertDescription>هذا الملف مؤرشف. يمكن مراجعته، وتصبح إجراءات التعديل متاحة بعد استعادته.</AlertDescription>
          </Alert>
        ) : null}

        <nav
          aria-label="تبويبات ملف المريض"
          className="sticky top-0 z-10 -mx-2 mt-5 overflow-x-auto border-y border-border bg-background/95 px-2 py-2 shadow-sm backdrop-blur print:hidden"
        >
          <div className="grid min-w-[280px] grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/35 p-1 sm:min-w-0">
            <Button
              variant="ghost"
              aria-selected={activeTab === "summary"}
              data-testid="patient-tab-summary"
              className={`rounded-lg px-4 py-2.5 transition-all ${
                activeTab === "summary"
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
              onClick={() => setActiveTab("summary")}
            >
              بيانات المريض
            </Button>
            <Button
              variant="ghost"
              aria-selected={activeTab === "procedures"}
              data-testid="patient-tab-procedures"
              className={`rounded-lg px-4 py-2.5 transition-all ${
                activeTab === "procedures"
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
              onClick={() => setActiveTab("procedures")}
            >
              إجراءات المريض
            </Button>
          </div>
        </nav>

        <div className="pt-5">
          {activeTab === "summary" ? (
            <SummaryTab
              patient={patient}
              showArchived={showArchived}
              onManage={() => setActiveTab("procedures")}
            />
          ) : (
            <div className="space-y-5 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 p-4 print:hidden">
                <div>
                  <h2 className="font-bold text-foreground">إجراءات المريض</h2>
                  <p className="text-sm text-muted-foreground">مساحة العمل الكاملة لإدارة الملف وسجلاته.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="patient-show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
                  <Label htmlFor="patient-show-archived" className="cursor-pointer text-sm text-muted-foreground">
                    إظهار العناصر المؤرشفة
                  </Label>
                </div>
              </div>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <PatientDetailsSection
                  patient={patient}
                  canArchive={canArchive}
                  onArchive={() => setShowArchiveConfirm(true)}
                  onRestore={handleRestore}
                  isRestoring={restorePatient.isPending}
                />
              </section>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <ImplantsTab patient={patient} showArchived={showArchived} />
              </section>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h2 className="text-lg font-bold text-foreground">المالية</h2>
                  <p className="text-sm text-muted-foreground">ملخص العلاج والدفعات والرسوم لكل حالة نشطة.</p>
                </div>
                <PaymentsTab patient={patient} />
              </section>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h2 className="text-lg font-bold text-foreground">المتابعات وسجل التواصل</h2>
                  <p className="text-sm text-muted-foreground">المواعيد والنتائج وسجل التواصل المرتبط بالملف.</p>
                </div>
                <FollowupsTab patient={patient} />
              </section>
            </div>
          )}
        </div>
      </main>

      <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <DialogContent className="text-right sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive">تأكيد أرشفة الملف</DialogTitle>
            <DialogDescription className="mt-4 text-base leading-relaxed text-foreground">
              هل أنت متأكد من أرشفة ملف المريض &quot;{patient.fullName}&quot;؟ ستبقى بياناته محفوظة للمراجعة، ولا يمكن تعديلها حتى استعادته.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5 flex-row gap-3 sm:justify-start">
            <Button onClick={handleArchive} disabled={archivePatient.isPending} variant="destructive">
              {archivePatient.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "أرشفة الملف"}
            </Button>
            <Button variant="outline" onClick={() => setShowArchiveConfirm(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}