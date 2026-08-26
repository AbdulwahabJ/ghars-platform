import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Building2, Clock, KeyRound, Loader2 } from "lucide-react";
import { usePlatformOverview } from "@/hooks/use-platform-admin";
import { formatSaudiDateTime } from "@/lib/datetime";

export default function Overview() {
  const { t } = useTranslation("commercial");
  const { data, isLoading, isError } = usePlatformOverview();
  if (isLoading) return <Loading />;
  if (isError || !data) return <State text={t("platformAdmin.loadError")} />;
  const cards = [
    ["activeCustomers", data.metrics.activeCustomers, Building2, "/platform-admin/customers", "text-emerald-700 bg-emerald-50"],
    ["trialCustomers", data.metrics.trialCustomers, Clock, "/platform-admin/trials", "text-blue-700 bg-blue-50"],
    ["openActivationRequests", data.metrics.openActivationRequests, KeyRound, "/platform-admin/activation-requests", "text-amber-700 bg-amber-50"],
    ["openSystemErrors", data.metrics.openSystemErrors, AlertTriangle, "/platform-admin/errors", "text-red-700 bg-red-50"],
  ] as const;
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.overview")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={t("platformAdmin.overview.expiringTrials")}>
          {data.expiringTrials.length ? data.expiringTrials.map((tenant) => (
            <Link key={tenant.id} href={`/platform-admin/customers/${tenant.id}`} className="flex items-center justify-between border-b px-5 py-3 last:border-0 hover:bg-slate-50">
              <div><p className="font-medium">{tenant.name}</p><p className="text-xs text-slate-500">{tenant.referenceCode}</p></div>
              <span className="text-xs text-amber-700 notranslate">{tenant.trialEndsAt ? formatSaudiDateTime(tenant.trialEndsAt) : "—"}</span>
            </Link>
          )) : <State text={t("platformAdmin.overview.none")} />}
        </Panel>
        <Panel title={t("platformAdmin.overview.recentActivity")}>
          {data.recentActivity.length ? data.recentActivity.map((entry) => (
            <div key={entry.id} className="border-b px-5 py-3 last:border-0">
              <div className="flex justify-between gap-3"><p className="font-medium">{entry.summary || entry.action}</p><span className="text-xs text-slate-400 notranslate">{formatSaudiDateTime(entry.createdAt)}</span></div>
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