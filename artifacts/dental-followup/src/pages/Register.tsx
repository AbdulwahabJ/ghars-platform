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
  FormDescription,
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
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { PublicBackToHome } from "@/components/layout/PublicBackToHome";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";
import { ApiError } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { Country, City } from "country-state-city";
import type { ICountry, ICity } from "country-state-city";
import { cn } from "@/lib/utils";

type SearchOption = {
  value: string;
  label: string;
  selectedLabel?: string;
  search?: string;
};

function SearchableOptionCombobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled,
  className,
}: {
  value?: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-[52px] w-full justify-between rounded-[7px] border-slate-300 px-3 text-start font-normal", className)}
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected?.selectedLabel ?? selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.search ?? ""}`}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Check className={cn("me-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const countryRecords = Country.getAllCountries();
const countryLabel = (country: ICountry, locale: string) =>
  new Intl.DisplayNames([locale], { type: "region" }).of(country.isoCode) ?? country.name;

const cityAliases: Record<string, string> = {
  Makkah: "مكة المكرمة",
  Mecca: "مكة المكرمة",
  Jeddah: "جدة",
  Riyadh: "الرياض",
  Medina: "المدينة المنورة",
  Dubai: "دبي",
  Amman: "عمّان",
  Cairo: "القاهرة",
};
const cityCanonicalEnglishNames: Record<string, string> = {
  Mecca: "Makkah",
};

export default function Register() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation(["commercial", "common"]);
  const { direction } = useLocale();
  const locale = direction === "rtl" ? "ar" : "en";

  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasFieldServerError, setHasFieldServerError] = useState(false);
  const [phoneCountryManuallyChanged, setPhoneCountryManuallyChanged] = useState(false);

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
      countryCode: "SA",
      phoneCountryCode: "SA",
      cityDisplayName: "",
      city: "",
      password: "",
      confirmPassword: "",
      locale: "ar",
    },
  });

  const onSubmit = (data: PublicRegistrationInput) => {
    form.clearErrors();
    setHasFieldServerError(false);
    registerMutation.mutate(data, {
      onSuccess: () => {
        login.mutate(
          { username: data.username, password: data.password },
          {
            onSuccess: () => setLocation("/dashboard"),
            onError: () => setSuccess(true),
          },
        );
      },
      onError: (error) => {
        if (!(error instanceof ApiError)) return;

        const allowedFields = new Set<keyof PublicRegistrationInput>([
          "tenantName",
          "legalName",
          "ownerName",
          "username",
          "phone",
          "city",
          "cityDisplayName",
          "countryCode",
          "phoneCountryCode",
          "email",
          "password",
          "confirmPassword",
          "locale",
        ]);
        const payload = error.data as {
          details?: Array<{ field?: unknown; path?: unknown; code?: unknown }>;
        } | undefined;
        const candidates = payload?.details?.length
          ? payload.details
          : [{ field: error.field, code: error.code }];
        let applied = false;

        for (const candidate of candidates) {
          const field = typeof candidate.field === "string"
            ? candidate.field
            : typeof candidate.path === "string"
              ? candidate.path.split(".")[0]
              : undefined;
          if (
            field &&
            allowedFields.has(field as keyof PublicRegistrationInput) &&
            typeof candidate.code === "string"
          ) {
            form.setError(field as keyof PublicRegistrationInput, {
              type: "server",
              message: `errors.${candidate.code}`,
            });
            applied = true;
          }
        }
        setHasFieldServerError(applied);
      },
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-white" dir={direction}>
      {/* Form Side */}
      <div className="flex-1 flex flex-col items-center justify-start p-6 pt-16 sm:p-12 md:justify-center md:pt-12 relative z-10 bg-white order-2 md:order-1 overflow-y-auto">
        <div className="absolute top-8 end-8">
          <LanguageSwitcher />
        </div>
        <PublicBackToHome className="absolute top-8 start-8" />

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
              {registerMutation.isError && !hasFieldServerError && (
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
                            <Input {...field} autoComplete="organization" className="h-[52px] rounded-[7px] border-slate-300 ps-11 text-[15px]" />
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
                          <FormDescription className="text-xs leading-5">
                            {t("register.usernameHint")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField
                      control={form.control}
                      name="countryCode"
                      render={({ field }) => {
                        const countryOptions = countryRecords.map((country) => ({
                          value: country.isoCode,
                          label: `${country.flag} ${countryLabel(country, locale)}`,
                          search: `${country.name} ${country.isoCode}`,
                        }));
                        return (
                          <FormItem>
                            <FormLabel className="text-[14px]">{t("register.country")}</FormLabel>
                            <FormControl>
                              <SearchableOptionCombobox
                                value={field.value}
                                onChange={(value) => {
                                  field.onChange(value);
                                  form.setValue("cityDisplayName", "");
                                  form.setValue("city", "");
                                  if (!phoneCountryManuallyChanged) form.setValue("phoneCountryCode", value);
                                }}
                                options={countryOptions}
                                placeholder={t("register.countryPlaceholder")}
                                searchPlaceholder={t("register.search")}
                                emptyLabel={t("register.noResults")}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name="cityDisplayName"
                      render={({ field }) => {
                        const selectedCountry = form.watch("countryCode") || "SA";
                        const cities = Array.from(
                          new Map(
                            ((City.getCitiesOfCountry(selectedCountry) ?? []) as ICity[])
                              .map((city) => [city.name.trim().toLocaleLowerCase(), city]),
                          ).values(),
                        );
                        const cityOptions = cities.map((city) => ({
                          value: cityCanonicalEnglishNames[city.name] ?? city.name,
                          label: locale === "ar"
                            ? cityAliases[city.name] ?? city.name
                            : cityCanonicalEnglishNames[city.name] ?? city.name,
                          search: city.name,
                        }));
                        return (
                          <FormItem>
                            <FormLabel className="text-[14px]">{t("register.city")}</FormLabel>
                            <FormControl>
                              <SearchableOptionCombobox
                                value={field.value}
                                onChange={(value) => {
                                  field.onChange(value);
                                  form.setValue("city", value);
                                }}
                                options={cityOptions}
                                disabled={!selectedCountry}
                                placeholder={t("register.cityPlaceholder")}
                                searchPlaceholder={t("register.search")}
                                emptyLabel={t("register.noResults")}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => {
                      const phoneCountry = form.watch("phoneCountryCode");
                      const phoneOptions = countryRecords.map((country) => ({
                        value: country.isoCode,
                        label: `${country.flag} +${country.phonecode} ${countryLabel(country, locale)}`,
                         selectedLabel: `${country.flag} +${country.phonecode}`,
                        search: `${country.name} ${country.isoCode} ${country.phonecode}`,
                      }));
                      return (
                        <FormItem>
                          <FormLabel className="text-[14px]">{t("register.phone")}</FormLabel>
                          <div className="flex gap-2">
                            <FormField
                              control={form.control}
                              name="phoneCountryCode"
                              render={({ field: phoneCountryField }) => (
                                <SearchableOptionCombobox
                                  value={phoneCountry}
                                  onChange={(value) => {
                                    setPhoneCountryManuallyChanged(true);
                                    phoneCountryField.onChange(value);
                                  }}
                                  options={phoneOptions}
                                  placeholder={t("register.callingCode")}
                                  searchPlaceholder={t("register.search")}
                                  emptyLabel={t("register.noResults")}
                                  className="w-[148px] shrink-0 sm:w-[170px]"
                                />
                              )}
                            />
                            <FormControl>
                              <div className="relative min-w-0 flex-1">
                                <Phone className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <Input type="tel" placeholder={t("register.phonePlaceholder")} {...field} dir="ltr" autoComplete="tel" className="h-[52px] rounded-[7px] border-slate-300 ps-11 text-start text-[15px]" />
                              </div>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-[52px] rounded-[7px] border-slate-300 text-[15px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ar">{t("register.localeArabic")}</SelectItem>
                            <SelectItem value="en">{t("register.localeEnglish")}</SelectItem>
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
          <p className="mt-2 font-brand-arabic text-[16px] tracking-[0.18em] text-[#5a769b]">{t("common:brand.values")}</p>
        </div>
      </div>
    </div>
  );
}
