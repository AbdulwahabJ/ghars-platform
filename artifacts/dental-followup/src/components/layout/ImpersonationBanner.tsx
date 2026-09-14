import { ShieldAlert, LogOut, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth, IMPERSONATION_RETURN_PATH_KEY } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { localizeErrorMessage } from "@/lib/localize-error";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation("commercial");
  const { toast } = useToast();
  const { user, currentTenant, impersonation, exitImpersonation } = useAuth();

  if (!impersonation || !user) return null;

  const handleExit = () => {
    exitImpersonation.mutate(undefined, {
      onSuccess: () => {
        const returnPath = sessionStorage.getItem(IMPERSONATION_RETURN_PATH_KEY);
        sessionStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
        setLocation(returnPath?.startsWith("/platform-admin") ? returnPath : "/platform-admin/customers");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: t("impersonation.exitFailed"),
          description: localizeErrorMessage(error),
        });
      },
    });
  };

  return (
    <div
      role="status"
      className="sticky top-16 z-30 border-b border-amber-300 bg-amber-50 text-amber-950 shadow-sm print:hidden"
      dir="inherit"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{t("impersonation.bannerTitle")}</p>
            <p className="truncate text-amber-900/80">
              {t("impersonation.bannerDescription", {
                name: user.fullName,
                tenant: currentTenant?.name ?? t("impersonation.unknownTenant"),
              })}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 sm:w-auto"
          onClick={handleExit}
          disabled={exitImpersonation.isPending}
        >
          {exitImpersonation.isPending ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="me-2 h-4 w-4" />
          )}
          {t("impersonation.exit")}
        </Button>
      </div>
    </div>
  );
}