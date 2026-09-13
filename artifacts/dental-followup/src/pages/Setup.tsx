import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { setupInputSchema } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { z } from "zod";
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
import { useToast } from "@/hooks/use-toast";
import gharsLogo from "@/assets/ghars-logo.png";
import { Loader2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { PublicBackToHome } from "@/components/layout/PublicBackToHome";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

type SetupFormValues = z.infer<typeof setupInputSchema> & {
  confirmPassword: string;
};

export default function Setup() {
  const [, setLocation] = useLocation();
  const { setup, setupStatus } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation("auth");
  const { direction } = useLocale();
  const setupFormSchema = setupInputSchema.extend({
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t("setup.passwordMismatch"),
    path: ["confirmPassword"],
  });

  useEffect(() => {
    if (setupStatus && !setupStatus.setupRequired) {
      setLocation("/login");
    }
  }, [setLocation, setupStatus]);
  
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      setupKey: "",
      username: "",
      fullName: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: SetupFormValues) => {
    const { confirmPassword, ...setupData } = data;
    setup.mutate(setupData, {
      onSuccess: () => {
        toast({
          title: t("setup.successTitle"),
          description: t("setup.successDescription"),
        });
        setLocation("/login");
      },
      onError: (error: Error) => {
        toast({
          variant: "destructive",
          title: t("common:errors.generic"),
          description: localizeErrorMessage(error),
        });
      },
    });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4" dir={direction}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8 relative overflow-hidden">
        <div className="absolute top-4 end-4">
          <LanguageSwitcher />
        </div>
        <PublicBackToHome className="absolute top-4 start-4" />
        {/* Subtle decorative background elements */}
        <div className="absolute top-0 end-0 w-32 h-32 bg-primary/5 rounded-bl-full pointer-events-none" />
        <div className="absolute bottom-0 start-0 w-24 h-24 bg-accent/5 rounded-tr-full pointer-events-none" />
        
        <div className="flex flex-col items-center mb-8 relative z-10">
          <img src={gharsLogo} alt={t("login.logoAlt")} className="h-24 w-20 object-contain mb-4" />
          <h1 className="text-2xl font-bold text-foreground text-center">
            {t("setup.title")}
          </h1>
          <p className="text-muted-foreground text-center mt-2 text-sm">
            <span dir="ltr" className="inline-flex items-baseline text-start">
              <span dir="rtl" className="font-semibold text-brand-navy">غرس</span>
              <span className="mx-1 text-brand-blue-gray"> | </span>
              <span className="font-brand-latin">Ghars</span>
            </span>
            <span className="block mt-1">{t("setup.description")}</span>
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 relative z-10">
            <FormField
              control={form.control}
              name="setupKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("setup.setupKey")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("setup.setupKeyPlaceholder")} type="password" {...field} dir="ltr" className="text-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("setup.fullName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("setup.fullNamePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("setup.username")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("setup.usernamePlaceholder")} {...field} dir="ltr" className="text-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("setup.password")}</FormLabel>
                  <FormControl>
                    <Input placeholder="••••••••" type="password" {...field} dir="ltr" className="text-start" />
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
                  <FormLabel>{t("setup.confirmPassword")}</FormLabel>
                  <FormControl>
                    <Input placeholder="••••••••" type="password" {...field} dir="ltr" className="text-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full btn-primary mt-6" disabled={setup.isPending}>
              {setup.isPending ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                   <span>{t("setup.submitting")}</span>
                </>
              ) : (
                 <span>{t("setup.submit")}</span>
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
