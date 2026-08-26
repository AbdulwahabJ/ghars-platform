import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCommercialStatus, useCreateActivationRequest } from "@/hooks/use-commercial";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Loader2, Mail, Phone, MessageCircle, AlertCircle, Building2, ShieldAlert } from "lucide-react";
import gharsSymbol from "@/assets/ghars-symbol-transparent.png";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";
import { formatSaudiDateTime } from "@/lib/datetime";
import { buildSupportWhatsappLink } from "@/lib/support";

export default function AccessStatus() {
  const [, setLocation] = useLocation();
  const { user, currentTenant, logout } = useAuth();
  const { data: statusData, isLoading } = useCommercialStatus();
  const activateMutation = useCreateActivationRequest();
  const { t } = useTranslation(["commercial", "common"]);
  const { direction } = useLocale();

  const [note, setNote] = useState("");

  if (isLoading || !statusData) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#f4f7fa]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => setLocation("/login") });
  };

  const submitActivation = () => {
    activateMutation.mutate({ note: note.trim() || undefined });
  };

  const { tenant, support, activationRequest } = statusData;
  const isPending = tenant.status === "PENDING_VERIFICATION";
  const isSuspended = tenant.status === "SUSPENDED";
  const isTrialExpired = Boolean(
    tenant.status === "TRIAL" && 
    tenant.trialEndsAt && 
    !isNaN(new Date(tenant.trialEndsAt).getTime()) &&
    new Date(tenant.trialEndsAt).getTime() <= Date.now()
  );
  const supportMessageKey = isSuspended
    ? "status.supportMessages.suspended"
    : isTrialExpired
      ? "status.supportMessages.trialExpired"
      : "status.supportMessages.activation";
  const supportWhatsappHref = buildSupportWhatsappLink(
    support.whatsapp,
    t(supportMessageKey, {
      tenantName: tenant.name,
      tenantReference: currentTenant?.referenceCode ?? "",
    }),
  );

  return (
    <div className="min-h-[100dvh] overflow-x-hidden flex flex-col bg-[#f4f7fa]" dir={direction}>
      <header className="min-h-16 bg-white border-b border-slate-200 px-3 py-2 sm:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img src={gharsSymbol} alt={t("common:brand.latin")} className="h-8 w-8 object-contain" />
          <span className="hidden font-semibold text-lg text-brand-navy sm:inline">
            <span dir="ltr" className="inline-flex items-baseline text-start">
              <span dir="rtl" className="font-brand-arabic">{t("common:brand.arabic")}</span>
              <span className="mx-1 text-brand-blue-gray"> | </span>
              <span className="font-brand-latin text-[0.9em]">{t("common:brand.latin")}</span>
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-4">
          <LanguageSwitcher />
          <Button variant="ghost" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="h-4 w-4 sm:me-2" />
            <span className="hidden sm:inline">{t("common:actions.logout")}</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

          <div className="p-5 pb-5 sm:p-8 sm:pb-6 border-b border-slate-100 flex items-start gap-4">
            <div className={`p-4 rounded-full flex-shrink-0 ${
              isSuspended ? 'bg-destructive/10 text-destructive' :
              isPending ? 'bg-amber-100 text-amber-600' : 'bg-primary/10 text-primary'
            }`}>
              {isSuspended ? <ShieldAlert className="h-8 w-8" /> :
               isPending ? <Mail className="h-8 w-8" /> : <Building2 className="h-8 w-8" />}
            </div>

            <div className="flex-1 pt-1">
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {isSuspended ? t("status.suspended.title") :
                 isPending ? t("status.pendingVerification.title") :
                 t("status.trialExpired.title")}
              </h1>
              <p className="text-slate-500 text-[15px]">
                {isSuspended ? t("status.suspended.desc") :
                 isPending ? t("status.pendingVerification.desc") :
                 t("status.trialExpired.desc")}
              </p>
            </div>
          </div>

          <div className="p-4 space-y-6 bg-slate-50/50 sm:p-8 sm:space-y-8">
            <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">
                  {t("header.tenant")}
                </p>
                <p className="font-semibold text-brand-navy text-[17px]">{tenant.name}</p>
              </div>
              <div className="text-start sm:text-end">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                  tenant.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                  tenant.status === 'SUSPENDED' ? 'bg-red-100 text-red-800' :
                  tenant.status === 'TRIAL' ? 'bg-blue-100 text-blue-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {t(`statuses.${tenant.status}`)}
                </span>
                {tenant.trialEndsAt && (
                  <p className="text-[11px] text-slate-400 mt-1.5 notranslate">
                    {formatSaudiDateTime(tenant.trialEndsAt)}
                  </p>
                )}
              </div>
            </div>

            {isTrialExpired && user?.role === "ADMIN" && !isSuspended && (
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="font-bold text-foreground mb-4">{t("status.activation.title")}</h3>

                {activationRequest ? (
                  <div className={`p-4 rounded-lg flex items-start gap-3 ${
                    activationRequest.status === 'PENDING' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    activationRequest.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                    'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {activationRequest.status === 'PENDING' ? t("status.activation.pending") :
                         activationRequest.status === 'APPROVED' ? t("status.activation.success") :
                         t("platformAdmin.requestRejected", "تم رفض الطلب. يرجى التواصل مع الدعم.")}
                      </p>
                      <p className="text-sm opacity-80 mt-1 notranslate">{formatSaudiDateTime(activationRequest.createdAt)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activateMutation.isError && (
                      <div className="p-3 rounded bg-red-50 text-red-600 text-sm">
                        {localizeErrorMessage(activateMutation.error)}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">{t("status.activation.note")}</label>
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("status.activation.notePlaceholder")}
                        className="resize-none h-24"
                      />
                    </div>
                    <Button
                      onClick={submitActivation}
                      className="w-full h-11 btn-primary"
                      disabled={activateMutation.isPending}
                    >
                      {activateMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                      {t("status.activation.submit")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="text-center pt-2">
              <p className="text-sm text-slate-500 mb-3">{t("status.support")}</p>
              <div className="flex flex-col items-center justify-center gap-3 text-brand-navy font-medium sm:flex-row sm:gap-6">
                {support.email && (
                  <a href={`mailto:${support.email}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                    <Mail className="h-4 w-4" /> <span dir="ltr">{support.email}</span>
                  </a>
                )}
                {supportWhatsappHref && support.whatsapp && (
                  <a
                    href={supportWhatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                    data-testid="link-support-whatsapp"
                  >
                    <MessageCircle className="h-4 w-4 text-[#25D366]" />
                    <span dir="ltr">{support.whatsapp}</span>
                  </a>
                )}
                {support.phone && (
                  <a href={`tel:${support.phone}`} className="flex items-center gap-2 hover:text-primary transition-colors" data-testid="link-support-phone">
                    <Phone className="h-4 w-4" /> <span dir="ltr">{support.phone}</span>
                  </a>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
