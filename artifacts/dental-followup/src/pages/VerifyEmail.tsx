import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useVerifyEmail, useResendVerification } from "@/hooks/use-commercial";
import { Button } from "@/components/ui/button";
import gharsSymbol from "@/assets/ghars-symbol-transparent.png";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";
import { Input } from "@/components/ui/input";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation("commercial");
  const { direction } = useLocale();

  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  const verifyMutation = useVerifyEmail();
  const resendMutation = useResendVerification();

  const [resendEmail, setResendEmail] = useState("");
  const [resendMode, setResendMode] = useState(false);

  useEffect(() => {
    if (token && !verifyMutation.isPending && !verifyMutation.isSuccess && !verifyMutation.isError) {
      verifyMutation.mutate({ token });
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = (e: React.FormEvent) => {
    e.preventDefault();
    if (resendEmail.trim()) {
      resendMutation.mutate({ email: resendEmail });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-[#f4f7fa] relative" dir={direction}>
      <div className="absolute top-8 end-8">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <img src={gharsSymbol} alt="Ghars Symbol" className="h-20 w-20 mx-auto mb-6 object-contain" />

        {verifyMutation.isPending || (!token && !resendMode && !verifyMutation.isError) ? (
          <div className="space-y-4 py-8">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">{t("verify.verifying")}</h2>
          </div>
        ) : verifyMutation.isSuccess ? (
          <div className="space-y-6">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">{t("verify.success")}</h2>
              <p className="text-slate-500">{t("verify.successDesc")}</p>
            </div>
            <Button onClick={() => setLocation("/login")} className="w-full btn-primary h-[50px]">
              {t("verify.successButton")}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {!resendMode ? (
              <>
                <XCircle className="h-16 w-16 text-destructive mx-auto" />
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">{t("verify.invalid")}</h2>
                  <p className="text-slate-500 text-sm">
                    {verifyMutation.error ? localizeErrorMessage(verifyMutation.error) : t("verify.invalidDesc")}
                  </p>
                </div>
                <div className="space-y-3 pt-4">
                  <Button onClick={() => setResendMode(true)} className="w-full btn-primary h-[50px]">
                    {t("verify.resendButton")}
                  </Button>
                  <Button onClick={() => setLocation("/login")} variant="outline" className="w-full h-[50px]">
                    {t("verify.loginButton")}
                  </Button>
                </div>
              </>
            ) : (
              <form onSubmit={handleResend} className="space-y-5 text-start">
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2 text-center">{t("verify.resendButton")}</h2>

                  {resendMutation.isSuccess && (
                    <div className="bg-emerald-50 text-emerald-600 p-3 rounded-lg text-sm font-medium mb-4 text-center">
                      {t("verify.resendSuccess")}
                    </div>
                  )}

                  {resendMutation.isError && (
                    <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm font-medium mb-4 text-center">
                      {localizeErrorMessage(resendMutation.error)}
                    </div>
                  )}

                  <label className="block text-sm font-medium mb-1.5">{t("register.email")}</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <Input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      dir="ltr"
                      className="h-[50px] ps-11"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full btn-primary h-[50px]" disabled={resendMutation.isPending}>
                  {resendMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                  {resendMutation.isPending ? t("verify.resending") : t("verify.resendButton")}
                </Button>
                <Button type="button" onClick={() => setLocation("/login")} variant="ghost" className="w-full">
                  {t("verify.loginButton")}
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
