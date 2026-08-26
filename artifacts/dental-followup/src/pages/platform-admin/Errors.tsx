import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertOctagon, Check, Loader2, RotateCcw } from "lucide-react";
import { usePlatformErrors, usePlatformResolveError } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatSaudiDateTime } from "@/lib/datetime";

export default function Errors() {
  const { t } = useTranslation("commercial");
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const { data, isLoading, isError } = usePlatformErrors({ status: status === "all" ? undefined : status, page: 1, limit: 50 });
  const resolve = usePlatformResolveError();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><AlertOctagon className="h-6 w-6 text-red-600" /><h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.errors")}</h2></div><Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">{t("platformAdmin.errors.open")}</SelectItem><SelectItem value="resolved">{t("platformAdmin.errors.resolved")}</SelectItem><SelectItem value="all">{t("platformAdmin.allStatuses")}</SelectItem></SelectContent></Select></div>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {isLoading ? <State loading text="" /> : isError ? <State text={t("platformAdmin.loadError")} /> : !data?.items.length ? <State text={t("platformAdmin.errors.empty")} /> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 text-start">{t("platformAdmin.errors.reference")}</th><th className="p-4 text-start">{t("platformAdmin.columns.clinic")}</th><th className="p-4 text-start">{t("platformAdmin.errors.type")}</th><th className="p-4 text-start">{t("platformAdmin.columns.date")}</th><th className="p-4 text-start">{t("common:labels.actions")}</th></tr></thead><tbody>
            {data.items.map((error) => <tr key={error.id} className="border-t"><td className="p-4 font-mono text-xs">{error.referenceCode}<p className="mt-1 font-sans text-slate-500">{t("platformAdmin.errors.safeMessage")}</p></td><td className="p-4">{error.tenantName || t("platformAdmin.platformScope")}</td><td className="p-4">{t(`platformAdmin.errors.types.${error.errorType}`, { defaultValue: t("platformAdmin.errors.types.unexpected") })}<p className="text-xs text-slate-400">{t("platformAdmin.errors.requestContext", { method: error.method, route: error.route })}</p></td><td className="p-4 notranslate">{formatSaudiDateTime(error.occurredAt)}</td><td className="p-4"><Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: error.id, input: { resolved: !error.isResolved } })}>{error.isResolved ? <RotateCcw className="me-2 h-4 w-4" /> : <Check className="me-2 h-4 w-4 text-emerald-600" />}{error.isResolved ? t("platformAdmin.errors.reopen") : t("platformAdmin.errors.resolve")}</Button></td></tr>)}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
function State({ text, loading = false }: { text: string; loading?: boolean }) { return <div className="flex h-48 items-center justify-center text-sm text-slate-500">{loading ? <Loader2 className="h-6 w-6 animate-spin" /> : text}</div>; }