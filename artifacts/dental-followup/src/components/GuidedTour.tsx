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
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";

interface GuidedTourProps {
  autoStart?: boolean;
}

export function GuidedTour({ autoStart = false }: GuidedTourProps) {
  const { t, i18n } = useTranslation("guidance");
  const direction = i18n.dir();
  const [showWelcome, setShowWelcome] = useState(autoStart);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickHelp, setShowQuickHelp] = useState(false);
  const updatePreferences = useUpdatePreferences();
  const updateOnboarding = updatePreferences.mutate;
  const { user } = useAuth();
  const includeSettingsIdentityStep = user?.role === "ADMIN";

  const skipWelcome = () => {
    setShowWelcome(false);
    if (autoStart) {
      updateOnboarding({ onboardingStatus: "skipped" });
    }
  };

  const startDriverTour = useCallback(() => {
    const finalStepIndex = includeSettingsIdentityStep ? 7 : 6;
    const driverObj = driver({
      showProgress: true,
      doneBtnText: t("tour.done"),
      nextBtnText: t("tour.next"),
      prevBtnText: t("tour.previous"),
      progressText: t("tour.progress", { total: finalStepIndex }),
      allowClose: true,
      // driver.js merges per-step showProgress with "||" at render time, so a
      // per-step "showProgress: false" cannot override the global "true".
      // Hide the counter on the final screen via the DOM hook instead.
      onPopoverRender: (popover, { state }) => {
        popover.progress.style.display = state.activeIndex === finalStepIndex ? "none" : "";
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
            title: t("tour.navigationTitle"),
            description: t("tour.navigationDescription"),
            side: "bottom",
            align: "center"
          }
        },
        {
          element: "#tour-global-search",
          popover: {
            title: t("tour.searchTitle"),
            description: t("tour.searchDescription"),
            side: "bottom",
            align: "start"
          }
        },
        {
          element: "#tour-new-patient-btn",
          popover: {
            title: t("tour.newPatientTitle"),
            description: t("tour.newPatientDescription"),
            side: "bottom",
            align: "start"
          }
        },
        {
          element: "#tour-dashboard-overview",
          popover: {
            title: t("tour.overviewTitle"),
            description: t("tour.overviewDescription"),
            side: "top",
            align: "start"
          }
        },
        {
          element: document.querySelector("#tour-patient-workspace") ? "#tour-patient-workspace" : "[href='/patients']",
          popover: {
            title: t("tour.workspaceTitle"),
            description: t("tour.workspaceDescription"),
            side: "bottom",
            align: "start"
          }
        },
        ...(includeSettingsIdentityStep ? [{
          element: "#tour-settings-nav",
          popover: {
            title: t("tour.settingsIdentityTitle"),
            description: t("tour.settingsIdentityDescription"),
            side: "bottom" as const,
            align: "center" as const
          }
        }] : []),
        {
          element: "#tour-help-icon",
          popover: {
            title: t("tour.helpTitle"),
            description: t("tour.helpDescription"),
            side: "bottom",
            align: "end"
          }
        },
        {
          element: "body",
          popover: {
            title: t("tour.completeTitle"),
            description: t("tour.completeDescription"),
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
  }, [autoStart, includeSettingsIdentityStep, t, updateOnboarding]);

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
        <DialogContent className="sm:max-w-md text-start" dir={direction}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-primary">{t("tour.welcomeTitle")}</DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              {t("tour.welcomeDescription")}
              <br />
              {t("tour.welcomeDuration")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button onClick={() => { setShowWelcome(false); startDriverTour(); }} className="btn-primary w-full sm:w-auto">
              {t("tour.start")}
            </Button>
            <Button variant="outline" onClick={skipWelcome} className="btn-outline w-full sm:w-auto">
              {t("tour.skip")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickHelp} onOpenChange={setShowQuickHelp}>
        <DialogContent className="sm:max-w-md text-start" dir={direction}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{t("quickHelp.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4 text-foreground">
            {(["addPatient", "addCase", "addImplant", "search", "openPatient", "editPatient", "archivePatient", "restartTour"] as const).map((key) => <p key={key}><strong>{t(`quickHelp.${key}`)} </strong>{t(`quickHelp.${key}Text`)}</p>)}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md text-start" dir={direction}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{t("shortcuts.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4 text-foreground divide-y divide-border">
            {[["System", "system"], ["site", "site"], ["SIZE", "size"], ["Q", "preserved"], ["Former", "preserved"], ["Graft", "graft"], ["Pros", "pros"], ["DIRECT", "direct"], ["IMMED", "immediate"]].map(([label, key]) => <div key={label} className="py-2 flex justify-between"><span className="font-semibold text-primary">{label}</span><span className="text-muted-foreground">{t(`shortcuts.${key}`)}</span></div>)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
