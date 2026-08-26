import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PlatformTrialsInput } from "@workspace/shared";
import { Clock, Loader2, Search } from "lucide-react";
import { usePlatformTrials } from "@/hooks/use-platform-admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatSaudiDateTime } from "@/lib/datetime";

const views: PlatformTrialsInput["view"][] = ["active", "expiring", "expired", "extended"];
export default function Trials() {
  const { t } = useTranslation("commercial");
  const [view, setView] = useState<PlatformTrialsInput["view"]>("active");
  const [query, setQuery] = useState("");
  const { data, isLoading, isError } = usePlatformTrials({ view, query: query || undefined, page: 1, limit: 50 });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Clock className="h-6 w-6 text-blue-600" /><h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.trials")}</h2></div>
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute start-3 top-3 h-4 w-4 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} className="ps-9" placeholder={t("platformAdmin.search")} /></div>
        <div className="flex flex-wrap gap-2">{views.map((item) => <Button key={item} size="sm" variant={view === item ? "default" : "outline"} onClick={() => setView(item)}>{t(`platformAdmin.trials.${item}`)}</Button>)}</div>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {isLoading ? <Loading /> : isError ? <State text={t("platformAdmin.loadError")} /> : !data?.items.length ? <State text={t("platformAdmin.trials.empty")} /> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 text-start">{t("platformAdmin.columns.clinic")}</th><th className="p-4 text-start">{t("platformAdmin.columns.status")}</th><th className="p-4 text-start">{t("platformAdmin.columns.trialEnds")}</th><th className="p-4 text-start">{t("platformAdmin.columns.lastActivity")}</th></tr></thead><tbody>
            {data.items.map((tenant) => <tr key={tenant.id} className="border-t hover:bg-slate-50"><td className="p-4"><Link href={`/platform-admin/customers/${tenant.id}`} className="font-medium text-brand-navy hover:underline">{tenant.name}</Link><p className="text-xs text-slate-400">{tenant.referenceCode}</p></td><td className="p-4">{t(`statuses.${tenant.status}`)}</td><td className="p-4 notranslate">{tenant.trialEndsAt ? formatSaudiDateTime(tenant.trialEndsAt) : "—"}</td><td className="p-4 notranslate">{tenant.lastActivityAt ? formatSaudiDateTime(tenant.lastActivityAt) : "—"}</td></tr>)}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
function Loading() { return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>; }
function State({ text }: { text: string }) { return <div className="p-10 text-center text-sm text-slate-500">{text}</div>; }