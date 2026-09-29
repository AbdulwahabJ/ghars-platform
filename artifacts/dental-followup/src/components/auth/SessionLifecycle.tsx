import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { ME_QUERY_KEY, SETUP_STATUS_QUERY_KEY } from "@/hooks/use-auth";
import {
  hasAuthenticatedSession,
  isSessionEndedStorageEvent,
  isSessionExpired,
  notifySessionExpired,
  resetSessionExpiry,
  subscribeToSessionExpiry,
} from "@/lib/session-expiry";

function SessionExpiredScreen() {
  const [, setLocation] = useLocation();
  const isArabic = document.documentElement.lang !== "en";
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6" dir={isArabic ? "rtl" : "ltr"}>
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm" role="alert">
        <h1 className="mb-4 text-xl font-bold text-foreground">{isArabic ? "انتهت جلسة الدخول" : "Session expired"}</h1>
        <p className="mb-6 text-muted-foreground">
          {isArabic
            ? "لحماية بيانات المرضى تم إنهاء الجلسة بعد فترة من عدم الاستخدام"
            : "For the security of patient data, your session ended after a period of inactivity."}
        </p>
        <Button onClick={() => { setLocation("/login"); resetSessionExpiry(); }}>
          {isArabic ? "تسجيل الدخول من جديد" : "Sign in again"}
        </Button>
      </section>
    </main>
  );
}

export function SessionLifecycle({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const expired = useSyncExternalStore(subscribeToSessionExpiry, isSessionExpired, () => false);

  useEffect(() => {
    const onExpired = () => {
      if (!isSessionExpired()) return;
      void queryClient.cancelQueries();
      queryClient.clear();
    };
    const onStorage = (event: StorageEvent) => {
      if (isSessionEndedStorageEvent(event)) notifySessionExpired(false);
    };
    const unsubscribe = subscribeToSessionExpiry(onExpired);
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [queryClient]);

  useEffect(() => {
    if (expired) return;
    let lastCheck = Date.now();
    let checking = false;
    const checkOnResume = async () => {
      if (document.visibilityState !== "visible" || !hasAuthenticatedSession()) return;
      const now = Date.now();
      if (checking || now - lastCheck < 60_000) return;
      checking = true;
      lastCheck = now;
      try {
        await queryClient.fetchQuery({
          queryKey: ME_QUERY_KEY,
          queryFn: ({ signal }) => api.me(signal),
          staleTime: 0,
          retry: false,
        });
        if (!isSessionExpired()) {
          await queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] !== ME_QUERY_KEY[0] &&
              query.queryKey[0] !== SETUP_STATUS_QUERY_KEY[0],
            refetchType: "active",
          });
        }
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error("Session resume check failed", error);
        }
      } finally {
        checking = false;
      }
    };
    window.addEventListener("focus", checkOnResume);
    document.addEventListener("visibilitychange", checkOnResume);
    return () => {
      window.removeEventListener("focus", checkOnResume);
      document.removeEventListener("visibilitychange", checkOnResume);
    };
  }, [expired, queryClient]);

  return expired ? <SessionExpiredScreen /> : children;
}