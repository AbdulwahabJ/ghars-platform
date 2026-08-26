import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  CalendarPlus,
  CalendarRange,
  Clock,
  KeyRound,
  Loader2,
  ShieldCheck,
  TimerOff,
  UsersRound,
} from "lucide-react";
import { usePlatformOverview } from "@/hooks/use-platform-admin";
import { formatSaudiDateTime } from "@/lib/datetime";

export default function Overview() {
  const { t } = useTranslation("commercial");
  const { data, isLoading, isError } = usePlatformOverview();
  if (isLoading) return <Loading />;
  if (isError || !data) return <State text={t("platformAdmin.loadError")} />;
  const cards = [
    ["totalCustomers", data.metrics.totalCustomers, UsersRound, "/platform-admin/customers", "text-slate-700 bg-slate-100"],
    ["activeCustomers", data.metrics.activeCustomers, Building2, "/platform-admin/customers", "text-emerald-700 bg-emerald-50"],
    ["trialCustomers", data.metrics.trialCustomers, Clock, "/platform-admin/trials", "text-blue-700 bg-blue-50"],
    ["expiringTrials", data.metrics.expiringTrials, CalendarRange, "/platform-admin/trials", "text-orange-700 bg-orange-50"],
    ["expiredTrials", data.metrics.expiredTrials, TimerOff, "/platform-admin/trials", "text-slate-700 bg-slate-100"],
    ["suspendedCustomers", data.metrics.suspendedCustomers, Ban, "/platform-admin/customers", "text-red-700 bg-red-50"],
    ["newToday", data.metrics.newToday, CalendarPlus, "/platform-admin/customers", "text-violet-700 bg-violet-50"],
    ["newThisMonth", data.metrics.newThisMonth, ShieldCheck, "/platform-admin/customers", "text-cyan-700 bg-cyan-50"],
    ["openActivationRequests", data.metrics.openActivationRequests, KeyRound, "/platform-admin/activation-requests", "text-amber-700 bg-amber-50"],
    ["openSystemErrors", data.metrics.openSystemErrors, AlertTriangle, "/platform-admin/errors", "text-red-700 bg-red-50"],
  ] as const;
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.overview")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(([key, value, Icon, href, tone]) => (
          <Link key={key} href={href} className="group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
              <span className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></span>
              <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-slate-600 rtl:rotate-180" />
            </div>
            <p className="mt-4 text-3xl font-bold text-brand-navy">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{t(`platformAdmin.overview.${key}`)}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title={t("platformAdmin.overview.expiringTrials")}>
          {data.expiringTrials.length ? data.expiringTrials.map((tenant) => (
            <Link key={tenant.id} href={`/platform-admin/customers/${tenant.id}`} className="flex items-center justify-between border-b px-5 py-3 last:border-0 hover:bg-slate-50">
              <div><p className="font-medium">{tenant.name}</p><p className="text-xs text-slate-500">{tenant.referenceCode}</p></div>
              <span className="text-xs text-amber-700 notranslate">{tenant.trialEndsAt ? formatSaudiDateTime(tenant.trialEndsAt) : "—"}</span>
            </Link>
          )) : <State text={t("platformAdmin.overview.none")} />}
        </Panel>
        <Panel title={t("platformAdmin.overview.recentActivations")}>
          {data.recentActivations.length ? data.recentActivations.map(({ id, action, actor, tenant, createdAt }) => (
            <Link key={id} href={`/platform-admin/customers/${tenant.id}`} className="flex items-center justify-between border-b px-5 py-3 last:border-0 hover:bg-slate-50">
              <div><p className="font-medium">{tenant.name}</p><p className="text-xs text-slate-500">{t(`platformAdmin.audit.actions.${action}`)} · {actor || "—"}</p></div>
              <span className="text-xs text-slate-400 notranslate">{formatSaudiDateTime(createdAt)}</span>
            </Link>
          )) : <State text={t("platformAdmin.overview.none")} />}
        </Panel>
        <Panel title={t("platformAdmin.overview.recentErrors")}>
          {data.recentErrors.length ? data.recentErrors.map((error) => (
            <Link key={error.id} href="/platform-admin/errors" className="flex items-center justify-between border-b px-5 py-3 last:border-0 hover:bg-slate-50">
              <div><p className="font-mono text-xs">{error.referenceCode}</p><p className="text-xs text-slate-500">{error.tenantName || t("platformAdmin.platformScope")}</p></div>
              <span className={error.isResolved ? "text-xs text-emerald-700" : "text-xs text-red-700"}>{error.isResolved ? t("platformAdmin.errors.resolved") : t("platformAdmin.errors.open")}</span>
            </Link>
          )) : <State text={t("platformAdmin.overview.none")} />}
        </Panel>
        <Panel title={t("platformAdmin.overview.recentActivity")}>
          {data.recentActivity.length ? data.recentActivity.map((entry) => (
            <div key={entry.id} className="border-b px-5 py-3 last:border-0">
              <div className="flex justify-between gap-3"><p className="font-medium">{t(`platformAdmin.audit.actions.${entry.action}`, { defaultValue: t("platformAdmin.audit.unknownAction") })}</p><span className="text-xs text-slate-400 notranslate">{formatSaudiDateTime(entry.createdAt)}</span></div>
              <p className="mt-1 text-xs text-slate-500">{entry.actor || "—"} · {entry.tenantName || t("platformAdmin.platformScope")}</p>
            </div>
          )) : <State text={t("platformAdmin.overview.none")} />}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><h3 className="border-b bg-slate-50/70 px-5 py-4 font-bold text-brand-navy">{title}</h3>{children}</section>;
}
function Loading() { return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>; }
function State({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-slate-500">{text}</div>; }