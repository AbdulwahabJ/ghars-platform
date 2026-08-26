import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivationWorkflowStatus } from "@workspace/shared";
import { KeyRound, Loader2 } from "lucide-react";
import { usePlatformActivationRequests, usePlatformUpdateActivationRequest } from "@/hooks/use-platform-admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatSaudiDateTime } from "@/lib/datetime";

const statuses: ActivationWorkflowStatus[] = ["NEW", "CONTACTED", "AWAITING_PAYMENT", "PAYMENT_RECEIVED", "ACTIVATED", "CLOSED"];
export default function ActivationRequests() {
  const { t } = useTranslation("commercial");
  const [filter, setFilter] = useState<ActivationWorkflowStatus | "ALL">("ALL");
  const { data, isLoading, isError } = usePlatformActivationRequests({ workflowStatus: filter === "ALL" ? undefined : filter, page: 1, limit: 50 });
  const update = usePlatformUpdateActivationRequest();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><KeyRound className="h-6 w-6 text-amber-600" /><h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.activationRequests")}</h2></div><Select value={filter} onValueChange={(value) => setFilter(value as ActivationWorkflowStatus | "ALL")}><SelectTrigger className="w-56 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t("platformAdmin.allStatuses")}</SelectItem>{statuses.map((status) => <SelectItem key={status} value={status}>{t(`platformAdmin.workflow.${status}`)}</SelectItem>)}</SelectContent></Select></div>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {isLoading ? <State loading text="" /> : isError ? <State text={t("platformAdmin.loadError")} /> : !data?.items.length ? <State text={t("platformAdmin.activation.empty")} /> : (
          <table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 text-start">{t("platformAdmin.columns.clinic")}</th><th className="p-4 text-start">{t("platformAdmin.columns.date")}</th><th className="p-4 text-start">{t("platformAdmin.columns.status")}</th></tr></thead><tbody>
            {data.items.map(({ request, tenant }) => <tr key={request.id} className="border-t"><td className="p-4"><p className="font-medium">{tenant.name}</p><p className="text-xs text-slate-500">{tenant.contactName || "—"} · <span dir="ltr">{tenant.contactPhone || "—"}</span></p>{request.note && <p className="mt-2 max-w-lg rounded bg-slate-50 p-2 text-xs text-slate-600">{request.note}</p>}</td><td className="p-4 notranslate">{formatSaudiDateTime(request.createdAt)}</td><td className="p-4"><Select value={request.workflowStatus} disabled={update.isPending} onValueChange={(workflowStatus) => update.mutate({ id: request.id, input: { workflowStatus: workflowStatus as ActivationWorkflowStatus } })}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{t(`platformAdmin.workflow.${status}`)}</SelectItem>)}</SelectContent></Select></td></tr>)}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
function State({ text, loading = false }: { text: string; loading?: boolean }) { return <div className="flex h-48 items-center justify-center text-sm text-slate-500">{loading ? <Loader2 className="h-6 w-6 animate-spin" /> : text}</div>; }