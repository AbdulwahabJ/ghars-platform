import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Archive,
  AlertCircle,
  ArrowRight,
  ClipboardList,
  CreditCard,
  Loader2,
  MessageCircle,
  Printer,
  UserRound,
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

const sectionLinks = [
  { id: "patient-details", label: "بيانات المريض", icon: UserRound },
  { id: "implant-cases", label: "الزراعة", icon: ClipboardList },
  { id: "patient-finance", label: "المالية", icon: CreditCard },
  { id: "patient-followups", label: "المتابعات", icon: MessageCircle },
];

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
  const [activeSection, setActiveSection] = useState(sectionLinks[0].id);

  const patient = data?.patient;
  const canArchive = user?.role === "ADMIN";

  const scrollTo = (sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!patient) return;

    const sections = sectionLinks
      .map((link) => document.getElementById(link.id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-112px 0px -58% 0px", threshold: [0, 0.1, 0.5] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [patient]);

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
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 ms-1.5" />
            طباعة الملف
          </Button>
        </div>

        <header className="flex justify-end border-b border-border pb-5 print:hidden">
          <div className="flex items-center gap-2">
            <Switch id="patient-show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="patient-show-archived" className="cursor-pointer text-sm text-muted-foreground">
              إظهار العناصر المؤرشفة
            </Label>
          </div>
        </header>

        {isArchived ? (
          <Alert className="mt-5 print:hidden">
            <Archive className="h-4 w-4" />
            <AlertDescription>هذا الملف مؤرشف. يمكن مراجعته، وتصبح إجراءات التعديل متاحة بعد استعادته.</AlertDescription>
          </Alert>
        ) : null}

        <nav
          aria-label="أقسام الملف"
          className="sticky top-0 z-10 -mx-2 mt-5 overflow-x-auto border-y border-border bg-background/95 px-2 py-2 shadow-sm backdrop-blur print:hidden"
        >
          <div className="flex min-w-max gap-1 rounded-xl border border-border/80 bg-muted/35 p-1">
          {sectionLinks.map((link) => (
            <Button
              key={link.id}
              variant="ghost"
              size="sm"
              aria-current={activeSection === link.id ? "location" : undefined}
              data-active={activeSection === link.id}
              data-testid={`patient-section-${link.id}`}
              className={`shrink-0 gap-2 rounded-lg px-3 transition-all ${
                activeSection === link.id
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
              onClick={() => scrollTo(link.id)}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Button>
          ))}
          </div>
        </nav>

         <div className="space-y-5 pt-5">
           <section className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <PatientDetailsSection
              patient={patient}
              canArchive={canArchive}
              onArchive={() => setShowArchiveConfirm(true)}
              onRestore={handleRestore}
              isRestoring={restorePatient.isPending}
            />
           </section>
           <section id="implant-cases" className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <ImplantsTab patient={patient} showArchived={showArchived} />
          </section>
           <section id="patient-finance" className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
             <div className="mb-5">
              <h2 className="text-lg font-bold text-foreground">المالية</h2>
              <p className="text-sm text-muted-foreground">ملخص العلاج والدفعات والرسوم والخصومات لكل حالة نشطة.</p>
            </div>
            <PaymentsTab patient={patient} />
          </section>
           <section id="patient-followups" className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
             <div className="mb-5">
              <h2 className="text-lg font-bold text-foreground">المتابعات وسجل التواصل</h2>
              <p className="text-sm text-muted-foreground">المواعيد والنتائج وسجل التواصل المرتبط بالملف.</p>
            </div>
            <FollowupsTab patient={patient} />
          </section>
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