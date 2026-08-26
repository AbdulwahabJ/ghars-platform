import React from "react";
import { Link, useLocation } from "wouter";
import { PublicUser } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import {
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  Play,
  Info,
  BookOpen,
  Building2,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotifications } from "@/hooks/use-followups";
import { useAppSettings } from "@/hooks/use-settings";
import { formatSaudiDateTime, formatSaudiDate } from "@/lib/datetime";
import gharsSymbol from "@/assets/ghars-symbol.png";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  user: PublicUser;
}

export function Header({ user }: HeaderProps) {
  const [location, setLocation] = useLocation();
  const { logout, currentTenant, memberships, isPlatformAdmin, switchTenant } = useAuth();
  const { settings } = useAppSettings();
  const { data: notifications } = useNotifications();
  const { t } = useTranslation(["common", "commercial"]);
  const { direction } = useLocale();
  const notificationItems = notifications?.items ?? [];
  const notificationCount = notifications?.totalCount ?? 0;
  const displaySystemName =
    settings.systemName === "نظام متابعة زراعة الأسنان – د. همام"
      ? (currentTenant?.name || "غرس | Ghars")
      : settings.systemName;

  const roleName =
    user.role === "ADMIN"
      ? t("roles.admin")
      : user.role === "DOCTOR"
      ? t("roles.doctor")
      : t("roles.assistant");

  const navItems = [
    { label: t("nav.dashboard"), path: "/" },
    { label: t("nav.patients"), path: "/patients" },
    { label: t("nav.statistics"), path: "/statistics" },
    ...(user.role === "ADMIN" ? [{ label: t("nav.settings"), path: "/settings" }] : []),
  ];

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => setLocation("/login"),
    });
  };

  const startTour = () => {
    window.dispatchEvent(new CustomEvent('start-tour'));
  };

  const showShortcuts = () => {
    window.dispatchEvent(new CustomEvent('show-shortcuts'));
  };

  const showQuickHelp = () => {
    window.dispatchEvent(new CustomEvent('show-quick-help'));
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-40 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4">
        {/* Brand: start edge in both locales */}
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <img
            src={settings.clinicLogo ?? gharsSymbol}
            alt={t("brand.latin")}
            className="h-11 w-10 rounded-md object-contain"
          />
          <span className="font-semibold text-lg text-brand-navy tracking-tight hidden sm:block">
            {displaySystemName?.includes(" | ") ? (
              <span dir="ltr" className="inline-flex items-baseline text-start">
                <span dir="rtl" className="font-brand-arabic">
                  {displaySystemName.split(" | ")[0]}
                </span>
                <span className="mx-1 text-brand-blue-gray"> | </span>
                <span className="font-brand-latin text-[0.9em]">
                  {displaySystemName.split(" | ")[1]}
                </span>
              </span>
            ) : (
              displaySystemName
            )}
          </span>
        </div>

        {/* Center: Tabs stay in their own grid column to prevent overlap with edge actions. */}
        <nav className="hidden md:flex items-center gap-1 justify-self-center h-full" data-testid="nav-tabs" id="tour-nav-tabs">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location === "/"
                : location.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`px-4 h-full flex items-center border-b-2 font-medium transition-colors hover:text-primary ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions: end edge in both locales */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 justify-self-end">
          <LanguageSwitcher />

          {/* Help Menu */}
          <DropdownMenu dir={direction}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" id="tour-help-icon">
                    <HelpCircle className="h-5 w-5" />
                    <span className="sr-only">{t("help.menuLabel")}</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("help.menuLabel")}</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t("help.title")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={startTour} className="cursor-pointer gap-2">
                <Play className="h-4 w-4" />
                <span>{t("help.tour")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={showQuickHelp} className="cursor-pointer gap-2">
                <Info className="h-4 w-4" />
                <span>{t("help.quick")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={showShortcuts} className="cursor-pointer gap-2">
                <BookOpen className="h-4 w-4" />
                <span>{t("help.shortcuts")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <DropdownMenu dir={direction}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-primary relative"
                    data-testid="button-notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {notificationCount > 0 ? (
                      <span
                        className="absolute -top-0.5 -start-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[18px] text-center font-bold notranslate"
                        data-testid="badge-notification-count"
                      >
                        {notificationCount > 99 ? "+99" : notificationCount}
                      </span>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("common:notifications.title")}</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
              {notificationItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Bell className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">{t("common:notifications.empty")}</p>
                </div>
              ) : (
                <>
                  <DropdownMenuLabel>{t("common:notifications.count", { count: notificationCount })}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notificationItems.map((item, idx) => (
                    <DropdownMenuItem
                      key={`${item.kind}-${item.followupId ?? item.implantCaseId ?? idx}`}
                      className="cursor-pointer flex flex-col items-start gap-0.5 py-2"
                      onClick={() => setLocation(`/patients/${item.patientId}?tab=followup`)}
                      data-testid={`notification-item-${idx}`}
                    >
                      <span className="text-sm font-medium notranslate">{item.patientName}</span>
                      <span className="text-xs text-muted-foreground">{item.reason}</span>
                      {item.dueAt ? (
                        <span className="text-[11px] text-muted-foreground">
                          {formatSaudiDateTime(item.dueAt)}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu with Tenant Switcher */}
          <DropdownMenu dir={direction}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2 hover:bg-muted">
                <UserAvatar
                  fullName={user.fullName}
                  avatarData={user.avatarData}
                  size="sm"
                />
                <div className="text-start hidden sm:block max-w-[9rem]">
                  <p className="text-sm font-medium leading-none text-foreground truncate">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{roleName}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-1.5 sm:hidden">
                <p className="text-sm font-medium leading-none text-foreground">{user.fullName}</p>
                <p className="text-xs text-muted-foreground mt-1">{roleName}</p>
              </div>
              <DropdownMenuSeparator className="sm:hidden" />

              {currentTenant && (
                <div className="px-2 py-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {t("commercial:header.tenant")}
                  </div>
                  <div className="bg-slate-50 p-2 rounded-md border border-slate-100 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-brand-navy shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{currentTenant.name}</span>
                  </div>
                  {currentTenant.status === 'TRIAL' && currentTenant.trialEndsAt && (
                    <div className="mt-1.5 text-[11px] text-amber-600 font-medium">
                      {t("commercial:header.trialEnds")} <span className="notranslate">{formatSaudiDate(currentTenant.trialEndsAt)}</span>
                    </div>
                  )}
                </div>
              )}

              {memberships.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{t("commercial:header.switchTenant")}</DropdownMenuLabel>
                  {memberships.map((m) => (
                    <DropdownMenuItem
                      key={m.tenant.id}
                      disabled={m.tenant.id === currentTenant?.id || switchTenant.isPending}
                      className="cursor-pointer gap-2"
                      onClick={() => switchTenant.mutate({ tenantId: m.tenant.id }, {
                        onSuccess: () => {
                          setLocation("/");
                        }
                      })}
                    >
                      {m.tenant.id === currentTenant?.id ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <div className="h-4 w-4" />}
                      <span className="truncate flex-1">{m.tenant.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {isPlatformAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/platform-admin")} className="cursor-pointer gap-2 text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700">
                    <ShieldCheck className="h-4 w-4" />
                    <span>{t("commercial:header.platformAdmin")}</span>
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer gap-2 focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="h-4 w-4" />
                <span>{t("common:actions.logout")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Nav Menu */}
          <DropdownMenu dir={direction}>
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {navItems.map((item) => (
                <DropdownMenuItem key={item.path} asChild>
                  <Link href={item.path} className="w-full cursor-pointer">
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
