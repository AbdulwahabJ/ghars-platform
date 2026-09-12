import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Users, Clock, Key, AlertOctagon, Activity, FileStack, Settings, LogOut, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation("commercial");
  const { direction } = useLocale();
  const { logout, isPlatformAdmin } = useAuth();

  if (!isPlatformAdmin) return null;

  const menu = [
    { href: "/platform-admin", icon: LayoutDashboard, label: t("platformAdmin.nav.overview", "Overview") },
    { href: "/platform-admin/customers", icon: Users, label: t("platformAdmin.nav.customers", "Customers") },
    { href: "/platform-admin/trials", icon: Clock, label: t("platformAdmin.nav.trials", "Trials") },
    { href: "/platform-admin/activation-requests", icon: Key, label: t("platformAdmin.nav.activationRequests", "Activation Requests") },
    { href: "/platform-admin/errors", icon: AlertOctagon, label: t("platformAdmin.nav.errors", "System Errors") },
    { href: "/platform-admin/health", icon: Activity, label: t("platformAdmin.nav.health", "System Health") },
    { href: "/platform-admin/landing", icon: ImageIcon, label: t("platformAdmin.nav.landing", "Landing Page Content") },
    { href: "/platform-admin/audit", icon: FileStack, label: t("platformAdmin.nav.audit", "Audit Log") },
    { href: "/platform-admin/settings", icon: Settings, label: t("platformAdmin.nav.settings", "Settings") },
  ];

  return (
    <div className="min-h-[100dvh] flex overflow-x-hidden bg-[#f4f7fa]" dir={direction}>
      <aside className="hidden w-64 bg-brand-navy text-white md:flex flex-col fixed inset-y-0 z-50">
        <div className="h-16 flex items-center px-6 border-b border-white/10 gap-3 shrink-0">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <h1 className="text-lg font-bold tracking-wide">{t("platformAdmin.title", "Platform Admin")}</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {menu.map((item) => {
            const isActive = location === item.href || (item.href !== "/platform-admin" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-primary text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                <item.icon className="h-5 w-5" />
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10 shrink-0">
          <div className="mb-2 flex justify-start">
            <LanguageSwitcher />
          </div>
          <Button variant="ghost" onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation("/login") })} className="w-full justify-start gap-2 text-slate-300 hover:text-white hover:bg-white/10">
            <LogOut className="h-5 w-5" />
            {t("common:actions.logout", "Logout")}
          </Button>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-50 bg-brand-navy text-white shadow-lg md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
            <span className="truncate font-bold">{t("platformAdmin.title")}</span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation("/login") })} className="text-slate-200 hover:bg-white/10 hover:text-white" aria-label={t("common:actions.logout")}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-white/10 px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menu.map((item) => {
            const isActive = location === item.href || (item.href !== "/platform-admin" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex min-w-[88px] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] ${isActive ? "bg-primary text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                <item.icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden pt-32 transition-all duration-300 md:pt-0 md:ltr:ml-64 md:rtl:mr-64">
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
