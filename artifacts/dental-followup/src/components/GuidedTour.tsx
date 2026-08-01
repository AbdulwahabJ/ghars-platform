import React, { useCallback, useEffect, useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useUpdatePreferences } from "@/hooks/use-preferences";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GuidedTourProps {
  autoStart?: boolean;
}

export function GuidedTour({ autoStart = false }: GuidedTourProps) {
  const [showWelcome, setShowWelcome] = useState(autoStart);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickHelp, setShowQuickHelp] = useState(false);
  const updatePreferences = useUpdatePreferences();
  const updateOnboarding = updatePreferences.mutate;

  const skipWelcome = () => {
    setShowWelcome(false);
    if (autoStart) {
      updateOnboarding({ onboardingStatus: "skipped" });
    }
  };

  const startDriverTour = useCallback(() => {
    const driverObj = driver({
      showProgress: true,
      doneBtnText: "ابدأ العمل",
      nextBtnText: "التالي",
      prevBtnText: "السابق",
      progressText: "{{current}} من 6",
      allowClose: true,
      // driver.js merges per-step showProgress with "||" at render time, so a
      // per-step "showProgress: false" cannot override the global "true".
      // Hide the counter on the final screen (index 6) via the DOM hook instead.
      onPopoverRender: (popover, { state }) => {
        popover.progress.style.display = state.activeIndex === 6 ? "none" : "";
      },
      onDestroyStarted: () => {
        if (!driverObj.hasNextStep() && autoStart) {
          updateOnboarding({ onboardingStatus: "completed" });
        } else if (autoStart) {
          updateOnboarding({ onboardingStatus: "skipped" });
        }
        driverObj.destroy();
      },
      steps: [
        {
          element: "#tour-nav-tabs",
          popover: {
            title: "التنقل الرئيسي",
            description: "استخدم هذه التابات للانتقال بين الرئيسية، المرضى، والتقارير المالية.",
            side: "bottom",
            align: "center"
          }
        },
        {
          element: "#tour-global-search",
          popover: {
            title: "البحث عن مريض",
            description: "ابحث باستخدام اسم المريض، رقم الملف، أو رقم الجوال.",
            side: "bottom",
            align: "start"
          }
        },
        {
          element: "#tour-new-patient-btn",
          popover: {
            title: "إضافة حالة جديدة",
            description: "ابدأ من هنا لتسجيل مريض جديد أو إضافة حالة زراعة لمريض موجود.",
            side: "bottom",
            align: "start"
          }
        },
        {
          element: "#tour-dashboard-overview",
          popover: {
            title: "ملخص العمل اليومي",
            description: "تعرض هذه البطاقات المواعيد والمتابعات والحالات الجاهزة والمتأخرة.",
            side: "top",
            align: "start"
          }
        },
        {
          element: document.querySelector("#tour-patient-workspace") ? "#tour-patient-workspace" : "[href='/patients']",
          popover: {
            title: "ملف المريض",
            description: "داخل ملف المريض ستجد البيانات، الزرعات، الدفعات، المتابعة، والملخص.",
            side: "bottom",
            align: "start"
          }
        },
        {
          element: "#tour-help-icon",
          popover: {
            title: "المساعدة والتواصل",
            description: "يمكنك إعادة تشغيل الجولة التعريفية في أي وقت من علامة الاستفهام.",
            side: "bottom",
            align: "end"
          }
        },
        {
          element: "body",
          popover: {
            title: "انتهت الجولة",
            description: "أصبحت الآن جاهزًا لاستخدام النظام. يمكنك إعادة الجولة في أي وقت من علامة الاستفهام.",
            side: "bottom",
            align: "center",
            popoverClass: "tour-final-screen",
            showProgress: false,
            showButtons: ["next"]
          }
        }
      ]
    });

    driverObj.drive();
  }, [autoStart, updateOnboarding]);

  useEffect(() => {
    const handleStartTour = () => {
      setShowWelcome(false);
      startDriverTour();
    };

    const handleShowShortcuts = () => setShowShortcuts(true);
    const handleShowQuickHelp = () => setShowQuickHelp(true);

    window.addEventListener("start-tour", handleStartTour);
    window.addEventListener("show-shortcuts", handleShowShortcuts);
    window.addEventListener("show-quick-help", handleShowQuickHelp);

    return () => {
      window.removeEventListener("start-tour", handleStartTour);
      window.removeEventListener("show-shortcuts", handleShowShortcuts);
      window.removeEventListener("show-quick-help", handleShowQuickHelp);
    };
  }, [startDriverTour]);

  return (
    <>
      <Dialog open={showWelcome} onOpenChange={(open) => !open && skipWelcome()}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-primary">مرحبًا بك في نظام متابعة زراعة الأسنان</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              يمكنك أخذ جولة تعريفية قصيرة للتعرف على أهم أجزاء النظام.
              <br />
              تستغرق الجولة أقل من دقيقة، ويمكنك تشغيلها لاحقًا من علامة الاستفهام.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={() => { setShowWelcome(false); startDriverTour(); }} className="btn-primary w-full sm:w-auto">
              ابدأ الجولة
            </Button>
            <Button variant="outline" onClick={skipWelcome} className="btn-outline w-full sm:w-auto">
              تخطي الآن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickHelp} onOpenChange={setShowQuickHelp}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">مساعدة سريعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4 text-foreground">
            <p><strong>لإضافة مريض:</strong> اضغط تسجيل حالة زراعة جديدة.</p>
            <p><strong>لإضافة حالة:</strong> اضغط تسجيل حالة زراعة جديدة.</p>
            <p><strong>لإضافة زرعة:</strong> افتح ملف المريض ثم تاب الزرعات.</p>
            <p><strong>للبحث عن مريض:</strong> استخدم الاسم أو رقم الملف أو رقم الجوال.</p>
            <p><strong>لفتح ملف مريض:</strong> اضغط على سطر المريض في قائمة المرضى أو نتائج البحث.</p>
            <p><strong>لتعديل بيانات المريض:</strong> افتح ملف المريض، عدّل الحقول، ثم اضغط حفظ التعديلات.</p>
            <p><strong>لأرشفة ملف أو استعادته:</strong> من داخل ملف المريض في تاب البيانات.</p>
            <p><strong>لإعادة الجولة التعريفية:</strong> من علامة الاستفهام في أعلى الشاشة.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">شرح الاختصارات</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4 text-foreground divide-y divide-border">
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">System</span><span className="text-muted-foreground">نظام الزرعة</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">site</span><span className="text-muted-foreground">رقم السن أو الموقع</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">SIZE</span><span className="text-muted-foreground">مقاس الزرعة</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">Q</span><span className="text-muted-foreground">قيمة محفوظة كما في السجل الأصلي</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">Former</span><span className="text-muted-foreground">قيمة محفوظة كما في السجل الأصلي</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">Graft</span><span className="text-muted-foreground">معلومات ترقيع العظم حسب إدخال المستخدم</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">Pros</span><span className="text-muted-foreground">مدة أو مرحلة التركيب</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">DIRECT</span><span className="text-muted-foreground">إجراء مباشر</span></div>
            <div className="py-2 flex justify-between"><span className="font-semibold text-primary">IMMED</span><span className="text-muted-foreground">إجراء فوري</span></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
