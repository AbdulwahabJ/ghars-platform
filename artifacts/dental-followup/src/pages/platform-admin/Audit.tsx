import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileStack, Loader2 } from "lucide-react";
import { usePlatformAudit } from "@/hooks/use-platform-admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatSaudiDateTime } from "@/lib/datetime";

export default function Audit() {
  const { t } = useTranslation("commercial");
  const [action, setAction] = useState("ALL");
  const { data, isLoading, isError } = usePlatformAudit({ action: action === "ALL" ? undefined : action, page: 1, limit: 50 });
  return (
    <div className="space-y-6">
       <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FileStack className="h-6 w-6 text-slate-600" /><h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.audit")}</h2></div><Select value={action} onValueChange={setAction}><SelectTrigger className="w-64 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t("platformAdmin.audit.allActions")}</SelectItem>{data?.actions.map((item) => <SelectItem value={item} key={item}>{t(`platformAdmin.audit.actions.${item}`, { defaultValue: t("platformAdmin.audit.unknownAction") })}</SelectItem>)}</SelectContent></Select></div>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {isLoading ? <State loading text="" /> : isError ? <State text={t("platformAdmin.loadError")} /> : !data?.items.length ? <State text={t("platformAdmin.audit.empty")} /> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 text-start">{t("platformAdmin.columns.action")}</th><th className="p-4 text-start">{t("platformAdmin.columns.user")}</th><th className="p-4 text-start">{t("platformAdmin.columns.clinic")}</th><th className="p-4 text-start">{t("platformAdmin.columns.date")}</th></tr></thead><tbody>
            {data.items.map((entry) => <tr key={entry.id} className="border-t"><td className="p-4 font-medium">{t(`platformAdmin.audit.actions.${entry.action}`, { defaultValue: t("platformAdmin.audit.unknownAction") })}</td><td className="p-4">{entry.actor || "—"}</td><td className="p-4">{entry.tenantName || t("platformAdmin.platformScope")}</td><td className="p-4 notranslate">{formatSaudiDateTime(entry.createdAt)}</td></tr>)}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
function State({ text, loading = false }: { text: string; loading?: boolean }) { return <div className="flex h-48 items-center justify-center text-sm text-slate-500">{loading ? <Loader2 className="h-6 w-6 animate-spin" /> : text}</div>; }