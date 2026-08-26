import { useTranslation } from "react-i18next";
import { Activity, AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { usePlatformHealth } from "@/hooks/use-platform-admin";
import { formatSaudiDateTime } from "@/lib/datetime";

export default function Health() {
  const { t } = useTranslation("commercial");
  const { data, isLoading, isError } = usePlatformHealth();
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (isError || !data) return <div className="p-10 text-center text-slate-500">{t("platformAdmin.loadError")}</div>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Activity className="h-6 w-6 text-emerald-600" /><h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.health")}</h2></div><div className="text-end text-xs text-slate-500"><p>{data.environment} · {data.applicationVersion}</p><p className="notranslate">{formatSaudiDateTime(data.checkedAt)}</p></div></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">{t("platformAdmin.health.overall")}</p>
        <p className="mt-1 text-xl font-bold text-brand-navy">{t(`platformAdmin.health.statuses.${data.overall}`)}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(data.components).map(([name, component]) => {
          const Icon = component.status === "healthy" ? CheckCircle2 : component.status === "warning" ? AlertCircle : XCircle;
          const tone = component.status === "healthy" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : component.status === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700";
          return <article key={name} className={`rounded-2xl border p-5 ${tone}`}><div className="flex items-center gap-3"><Icon className="h-5 w-5" /><h3 className="font-bold">{t(`platformAdmin.health.components.${name}`, { defaultValue: name })}</h3></div><p className="mt-3 text-sm opacity-90">{t(`platformAdmin.health.messages.${component.messageCode}`, { count: component.value ?? 0 })}</p><p className="mt-2 text-xs font-semibold">{t(`platformAdmin.health.statuses.${component.status}`)}</p>{component.latencyMs !== undefined && <p className="mt-2 font-mono text-xs">{component.latencyMs} ms</p>}</article>;
        })}
      </div>
    </div>
  );
}