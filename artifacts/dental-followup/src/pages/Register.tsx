import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { publicRegistrationInputSchema, PublicRegistrationInput } from "@workspace/shared";
import { useRegister } from "@/hooks/use-commercial";
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
import gharsSymbol from "@/assets/ghars-symbol-transparent.png";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Building2,
  UserRound,
  LockKeyhole,
  Phone,
  MapPin,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

export default function Register() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation(["commercial", "common"]);
  const { direction } = useLocale();

  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const registerMutation = useRegister();
  const { login } = useAuth();

  const form = useForm<PublicRegistrationInput>({
    resolver: zodResolver(publicRegistrationInputSchema),
    defaultValues: {
      tenantName: "",
      legalName: "",
      ownerName: "",
      username: "",
      phone: "",
      city: "",
      password: "",
      confirmPassword: "",
      locale: "ar",
    },
  });

  const onSubmit = (data: PublicRegistrationInput) => {
    registerMutation.mutate(data, {
      onSuccess: () => {
        login.mutate(
          { username: data.username, password: data.password },
          {
            onSuccess: () => setLocation("/"),
            onError: () => setSuccess(true),
          },
        );
      }
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-white" dir={direction}>
      {/* Form Side */}
      <div className="flex-1 flex flex-col items-center justify-start p-6 pt-16 sm:p-12 md:justify-center md:pt-12 relative z-10 bg-white order-2 md:order-1 overflow-y-auto">
        <div className="absolute top-8 end-8">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-[500px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-2 text-center md:text-start">
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-[36px]">{t("register.title")}</h1>
            <p className="text-muted-foreground text-base">{t("register.subtitle")}</p>
          </div>

          {success ? (
            <div className="space-y-6">
              <Alert className="border-primary/20 bg-primary/5">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                <AlertDescription className="font-medium text-primary ms-3 text-base leading-relaxed">
                  {t("register.success")}
                </AlertDescription>
              </Alert>
              <Button onClick={() => setLocation("/login")} className="w-full h-[56px] text-base btn-primary">
                {t("register.loginLink")}
              </Button>
            </div>
          ) : (
            <>
              {registerMutation.isError && (
                <Alert variant="destructive">
                  <AlertDescription className="font-medium text-sm">
                    {localizeErrorMessage(registerMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="tenantName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[14px]">{t("register.tenantName")}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building2 className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                            <Input placeholder={t("register.tenantNamePlaceholder")} {...field} autoComplete="organization" className="h-[52px] rounded-[7px] border-slate-300 ps-11 text-[15px]" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[14px]">{t("register.ownerName")}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <UserRound className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                            <Input placeholder={t("register.ownerNamePlaceholder")} {...field} autoComplete="name" className="h-[52px] rounded-[7px] border-slate-300 ps-11 text-[15px]" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px]">{t("register.username")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("register.usernamePlaceholder")} {...field} dir="ltr" autoComplete="username" className="h-[52px] rounded-[7px] border-slate-300 text-start text-[15px]" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px]">{t("register.phone")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                              <Input type="tel" placeholder={t("register.phonePlaceholder")} {...field} dir="ltr" autoComplete="tel" className="h-[52px] rounded-[7px] border-slate-300 ps-11 text-start text-[15px]" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[14px]">{t("register.city")}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MapPin className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                            <Input placeholder={t("register.cityPlaceholder")} {...field} autoComplete="address-level2" className="h-[52px] rounded-[7px] border-slate-300 ps-11 text-[15px]" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px]">{t("register.password")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <LockKeyhole className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                              <Input
                                placeholder={t("register.passwordPlaceholder")}
                                type={showPassword ? "text" : "password"}
                                {...field}
                                dir="ltr"
                                autoComplete="new-password"
                                className="h-[52px] rounded-[7px] border-slate-300 ps-11 pe-11 text-start text-[15px]"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute end-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-brand-navy"
                              >
                                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px]">{t("register.confirmPassword")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("register.passwordPlaceholder")}
                              type={showPassword ? "text" : "password"}
                              {...field}
                              dir="ltr"
                              autoComplete="new-password"
                              className="h-[52px] rounded-[7px] border-slate-300 text-start text-[15px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="locale"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[14px]">{t("register.locale")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-[52px] rounded-[7px] border-slate-300 text-[15px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ar">العربية (Arabic)</SelectItem>
                            <SelectItem value="en">English (الإنجليزية)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="mt-4 h-[56px] w-full rounded-[7px] text-[16px] btn-primary" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? <Loader2 className="me-2 h-5 w-5 animate-spin" /> : null}
                    {registerMutation.isPending ? t("register.submitting") : t("register.submit")}
                  </Button>
                </form>
              </Form>

              <div className="text-center pt-4 text-sm text-slate-500">
                {t("register.login")} {" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  {t("register.loginLink")}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Decorative Side */}
      <div className="hidden md:flex md:w-[45%] bg-[#f4f7fa] flex-col items-center justify-center p-12 relative overflow-hidden order-1 md:order-2 border-e border-slate-200">
        <div className="absolute start-0 top-0 h-[42%] w-[58%] bg-hex-pattern opacity-80 pointer-events-none" />
        <div className="absolute bottom-0 end-0 h-[44%] w-[62%] bg-hex-pattern opacity-80 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <img src={gharsSymbol} alt={t("common:brand.latin")} className="h-[140px] w-[140px] object-contain" />
          <div className="mt-2 space-y-0">
            <p className="font-brand-arabic text-[62px] font-bold leading-[1.15] text-brand-navy">{t("common:brand.arabic")}</p>
            <p className="font-brand-latin text-[56px] font-semibold leading-[1.05] text-brand-navy">{t("common:brand.latin")}</p>
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
