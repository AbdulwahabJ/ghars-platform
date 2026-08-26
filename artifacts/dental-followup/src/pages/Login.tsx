import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  loginInputSchema,
  LoginInput,
  completePasswordResetInputSchema,
  CompletePasswordResetInput,
} from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { useSupportContacts } from "@/hooks/use-commercial";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import gharsLogo from "@/assets/ghars-logo.png";
import gharsSymbol from "@/assets/ghars-symbol-transparent.png";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Headset,
  Loader2,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";
import { buildSupportWhatsappLink } from "@/lib/support";

type ResetFormInput = CompletePasswordResetInput & {
  confirmPassword: string;
};

export default function Login() {
  const [location, setLocation] = useLocation();
  const { login, user, setupStatus, isLoading } = useAuth();
  const { data: supportContacts } = useSupportContacts();
  const { t } = useTranslation(["auth", "common"]);
  const { direction } = useLocale();
  const resetFormSchema = completePasswordResetInputSchema
    .extend({
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("reset.passwordMismatch"),
      path: ["confirmPassword"],
    });

  // Extract token from search params if we're on the reset route
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  const isResetRoute = location === "/reset-password";
  const [view, setView] = useState<"login" | "forgot">("login");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [supportMessage, setSupportMessage] = useState(false);
  const supportWhatsappHref = buildSupportWhatsappLink(
    supportContacts?.whatsapp,
    t("login.supportMessage"),
  );

  useEffect(() => {
    if (!isLoading) {
      if (setupStatus?.setupRequired) {
        setLocation("/setup");
      } else if (user) {
        setLocation("/");
      }
    }
  }, [user, setupStatus, isLoading, setLocation]);

  const resetMutation = useMutation({
    mutationFn: (data: CompletePasswordResetInput) => api.completePasswordReset(data),
    onSuccess: () => {
      setResetSuccess(true);
    }
  });

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { username: "", password: "" },
  });

  const resetForm = useForm<ResetFormInput>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { token: token || "", password: "", confirmPassword: "" },
  });

  if (isLoading || user) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-white" dir={direction}>

      {/* Right Side Visually (First element in RTL) -> Form */}
      <div className="flex-1 flex flex-col items-center justify-start p-6 pt-28 sm:p-12 sm:pt-28 md:justify-center md:pt-12 relative z-10 bg-white order-2 md:order-1">
        <div className="absolute top-8 end-8">
          <LanguageSwitcher />
        </div>

        {/* Mobile Header (Hidden on Desktop) */}
        <div className="flex md:hidden flex-col items-center mb-10">
          <img src={gharsLogo} alt={t("login.logoAlt")} className="h-20 w-auto object-contain mb-4" />
        </div>

        <div className="w-full max-w-[500px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {!isResetRoute && view === "login" && (
            <>
              <div className="space-y-2 text-center md:text-start">
                <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-[40px]">{t("login.title")}</h1>
                <p className="text-muted-foreground text-base md:text-[17px]">{t("login.welcome")}</p>
              </div>

              {login.isError && (
                <Alert variant="destructive">
                  <AlertDescription className="font-medium text-sm">
                    {localizeErrorMessage(login.error)}
                  </AlertDescription>
                </Alert>
              )}

              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit((d) => login.mutate(d))} className="space-y-6">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                         <FormLabel className="text-[15px]">{t("login.username")}</FormLabel>
                         <FormControl>
                           <div className="relative">
                             <UserRound
                                className="pointer-events-none absolute start-4 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-slate-400"
                               aria-hidden="true"
                             />
                             <Input
                                placeholder={t("login.usernamePlaceholder")}
                               {...field}
                               dir="ltr"
                               autoComplete="username"
                                className="h-[56px] rounded-[7px] border-slate-300 ps-12 text-start text-[16px] shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                             />
                           </div>
                         </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                            <FormLabel className="text-[15px]">{t("login.password")}</FormLabel>
                          <button
                            type="button"
                            onClick={() => {
                              setView("forgot");
                            }}
                             className="text-xs font-medium text-[#278f8c] transition-colors hover:underline focus:outline-none"
                          >
                             {t("login.forgot")}
                          </button>
                        </div>
                         <FormControl>
                           <div className="relative">
                             <LockKeyhole
                                className="pointer-events-none absolute start-4 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-slate-400"
                               aria-hidden="true"
                             />
                             <Input
                                placeholder={t("login.passwordPlaceholder")}
                               type={showPassword ? "text" : "password"}
                               {...field}
                               dir="ltr"
                               autoComplete="current-password"
                                className="h-[56px] rounded-[7px] border-slate-300 ps-12 pe-12 text-start text-[16px] shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                             />
                             <button
                               type="button"
                               onClick={() => setShowPassword((visible) => !visible)}
                                className="absolute end-4 top-1/2 z-10 -translate-y-1/2 rounded-sm text-slate-400 transition-colors hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/30"
                                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                             >
                               {showPassword ? (
                                 <EyeOff className="h-[19px] w-[19px]" aria-hidden="true" />
                               ) : (
                                 <Eye className="h-[19px] w-[19px]" aria-hidden="true" />
                               )}
                             </button>
                           </div>
                         </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                   <Button type="submit" className="mt-2 h-[56px] w-full rounded-[7px] bg-brand-navy text-white text-[16px] hover:bg-[#132850]" disabled={login.isPending}>
                    {login.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                     {login.isPending ? t("login.signingIn") : t("login.submit")}
                  </Button>
                </form>
              </Form>

               <div className="space-y-4 pt-1">
                 <div className="flex items-center gap-4 text-xs text-slate-400">
                   <span className="h-px flex-1 bg-slate-200" />
                    <span>{t("login.or")}</span>
                   <span className="h-px flex-1 bg-slate-200" />
                 </div>

                 <div className="flex flex-col gap-3">
                   <button
                     type="button"
                     onClick={() => setLocation("/register")}
                     className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[7px] border border-brand-navy bg-white text-[15px] font-medium text-brand-navy transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40"
                   >
                     {t("common:actions.register", "إنشاء حساب جديد")}
                   </button>

                    {supportWhatsappHref ? (
                      <a
                        href={supportWhatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[7px] border border-[#67b8b4] bg-white text-[15px] font-medium text-brand-navy transition-colors hover:bg-[#f2fbfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67b8b4]/40"
                        data-testid="link-login-support-whatsapp"
                      >
                        <MessageCircle className="h-[18px] w-[18px] text-[#25D366]" aria-hidden="true" />
                        {t("login.support")}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSupportMessage(true)}
                        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[7px] border border-[#67b8b4] bg-white text-[15px] font-medium text-brand-navy transition-colors hover:bg-[#f2fbfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67b8b4]/40"
                      >
                        <Headset className="h-[18px] w-[18px] text-[#5ca8a5]" aria-hidden="true" />
                        {t("login.support")}
                      </button>
                    )}
                 </div>
                 {supportMessage && (
                   <p className="text-center text-xs text-slate-500" role="status">
                      {t("login.supportSoon")}
                   </p>
                 )}
               </div>

               <div className="flex items-start justify-center gap-2 pt-2 text-center text-slate-400">
                 <ShieldCheck className="mt-0.5 h-[19px] w-[19px] shrink-0 text-[#5aa9a4]" aria-hidden="true" />
                 <div className="space-y-0.5">
                    <p className="text-xs font-medium text-slate-500">{t("login.protected")}</p>
                    <p className="text-[10px]">{t("login.encryption")}</p>
                 </div>
               </div>
            </>
          )}

          {!isResetRoute && view === "forgot" && (
            <>
              <div className="space-y-3 text-center md:text-start">
                <button
                  onClick={() => setView("login")}
                  className="mb-6 flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                >
                  <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" />
                  {t("recovery.back")}
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("recovery.title")}</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">{t("recovery.description")}</p>
              </div>

              <Alert className="border-primary/20 bg-primary/5">
                <Headset className="h-5 w-5 shrink-0 text-primary" />
                <AlertDescription className="ms-2 space-y-2 text-sm leading-relaxed text-brand-navy">
                  <p>{t("recovery.employeeSupport")}</p>
                  <p>{t("recovery.adminSupport")}</p>
                </AlertDescription>
              </Alert>
            </>
          )}

          {isResetRoute && (
            <>
              <div className="space-y-3 text-center md:text-start">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("reset.title")}</h1>
                <p className="text-muted-foreground text-sm">{t("reset.description")}</p>
              </div>

              {resetSuccess ? (
                <div className="space-y-6">
                  <Alert className="border-primary/20 bg-primary/5">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <AlertDescription className="font-medium text-primary ms-2 text-sm leading-relaxed">
                      {t("reset.success")}
                    </AlertDescription>
                  </Alert>
                  <Button onClick={() => setLocation("/login")} className="w-full btn-primary">
                    {t("reset.goToLogin")}
                  </Button>
                </div>
              ) : (
                <>
                  {resetMutation.isError && (
                    <Alert variant="destructive">
                      <AlertDescription className="font-medium text-sm">
                        {localizeErrorMessage(resetMutation.error)}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Form {...resetForm}>
                    <form onSubmit={resetForm.handleSubmit((d) => resetMutation.mutate(d))} className="space-y-5">
                      <FormField
                        control={resetForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("reset.password")}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="••••••••"
                                type="password"
                                {...field}
                                dir="ltr"
                                autoComplete="new-password"
                                className="h-[52px] rounded-[7px] border-slate-300 text-start shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={resetForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("reset.confirmPassword")}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="••••••••"
                                type="password"
                                {...field}
                                dir="ltr"
                                autoComplete="new-password"
                                className="h-[52px] rounded-[7px] border-slate-300 text-start shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                       <Button type="submit" className="mt-2 h-[50px] w-full rounded-[7px] bg-brand-navy text-white hover:bg-[#132850]" disabled={resetMutation.isPending}>
                        {resetMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                         {t("reset.submit")}
                      </Button>
                    </form>
                  </Form>
                </>
              )}
            </>
          )}

        </div>
      </div>

      {/* Left Side Visually (Second element in RTL) -> Identity panel */}
      <div className="hidden md:flex md:w-[50%] bg-[#f4f7fa] flex-col items-center justify-center p-12 relative overflow-hidden order-1 md:order-2 border-e border-slate-200">
        <div className="absolute start-0 top-0 h-[42%] w-[58%] bg-hex-pattern opacity-80 pointer-events-none" />
        <div className="absolute bottom-0 end-0 h-[44%] w-[62%] bg-hex-pattern opacity-80 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <img src={gharsSymbol} alt={t("login.symbolAlt")} className="h-[140px] w-[140px] object-contain" />
          <div className="mt-2 space-y-0">
            <p className="font-brand-arabic text-[62px] font-bold leading-[1.15] text-brand-navy">{t("common:brand.arabic")}</p>
            <p className="font-brand-latin text-[56px] font-semibold leading-[1.05] text-brand-navy">Ghars</p>
          </div>
          <div className="mt-7 flex items-center gap-3 text-brand-navy">
            <span className="h-px w-6 bg-brand-navy/60" />
            <p className="text-[17px] font-medium">{t("common:brand.tagline")}</p>
            <span className="h-px w-6 bg-brand-navy/60" />
          </div>
          <p className="mt-2 font-brand-arabic text-[16px] tracking-[0.18em] text-[#5a769b]">تقنية . دقة . ثقة</p>
        </div>
      </div>

    </div>
  );
}
