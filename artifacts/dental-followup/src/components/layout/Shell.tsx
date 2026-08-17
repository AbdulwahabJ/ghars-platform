import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "./Header";
import { GuidedTour } from "../GuidedTour";
import { Loader2 } from "lucide-react";
import { PageBackgroundDecorations } from "./PageBackground";

interface ShellProps {
  children: React.ReactNode;
  decorated?: boolean;
}

export function Shell({ children, decorated = false }: ShellProps) {
  const { user, preferences, isLoading, isError, setupStatus } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (setupStatus?.setupRequired) {
        setLocation("/setup");
      } else if (isError || !user) {
        setLocation("/login");
      }
    }
  }, [isLoading, isError, user, setupStatus, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background" dir="rtl">
      <Header user={user} />
      <main className="relative isolate flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8">
        {decorated && <PageBackgroundDecorations />}
        <div className={decorated ? "relative z-10" : undefined}>{children}</div>
      </main>
      {preferences?.onboardingStatus === "not_started" && <GuidedTour autoStart />}
      {preferences?.onboardingStatus !== "not_started" && <GuidedTour autoStart={false} />}
    </div>
  );
}
