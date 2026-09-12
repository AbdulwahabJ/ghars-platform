import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { ME_QUERY_KEY } from "@/hooks/use-auth";
import { localizeErrorMessage } from "@/lib/localize-error";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePassword() {
  const { t } = useTranslation("auth");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user, currentTenant, isPlatformAdmin } = useAuth();
  const forced = user?.mustChangePassword ?? false;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      forced
        ? api.completeForcedPasswordChange({ password: newPassword })
        : api.changeOwnPassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setLocation(isPlatformAdmin && !currentTenant ? "/platform-admin" : "/dashboard");
    },
  });

  const submit = () => {
    setValidationError("");
    if (newPassword !== confirmPassword) {
      setValidationError(t("changePassword.passwordMismatch"));
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 p-4">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-md items-center">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-brand-navy">
              {forced ? t("changePassword.requiredTitle") : t("changePassword.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {forced ? t("changePassword.requiredDescription") : t("changePassword.description")}
            </p>
          </div>

          {(validationError || mutation.isError) && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>
                {validationError || localizeErrorMessage(mutation.error)}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-5">
            {!forced && (
              <div className="space-y-2">
                <Label htmlFor="current-password">{t("changePassword.currentPassword")}</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  dir="ltr"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("changePassword.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  dir="ltr"
                  className="pe-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("changePassword.confirmPassword")}</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                dir="ltr"
              />
            </div>
            <p className="text-xs text-slate-500">{t("changePassword.passwordHint")}</p>
            <Button
              className="h-12 w-full btn-primary"
              onClick={submit}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("changePassword.submit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}