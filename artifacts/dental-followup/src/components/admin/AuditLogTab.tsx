import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { AuditFilters } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuditLogs } from "@/hooks/use-admin";
import { auditExportUrl } from "@/lib/api";
import { formatSaudiDateTime } from "@/lib/datetime";
import { useTranslation } from "react-i18next";

const ALL = "__all__";

function RecentActivitiesPreview() {
  const { t } = useTranslation("admin");
  const { data, isLoading } = useAuditLogs({ limit: 6, page: 1 });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">{t("audit.recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">{t("audit.recent")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.id} className="px-6 py-2.5">
              <p className="text-sm">
                <span className="font-medium">
                   {t(`audit.actions.${item.action}`, { defaultValue: item.action })}
                </span>
                {item.summary ? (
                  <span className="text-muted-foreground notranslate"> — {item.summary}</span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.userName ? <span className="notranslate">{item.userName} — </span> : null}
                {formatSaudiDateTime(item.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AuditLogTab() {
  const { t } = useTranslation("admin");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [entityType, setEntityType] = useState(ALL);
  const [fileNumber, setFileNumber] = useState("");
  const [page, setPage] = useState(1);
  const debouncedFileNumber = useDebounce(fileNumber, 400);

  const filters: Partial<AuditFilters> = {
    from: from || undefined,
    to: to || undefined,
    userId: userId === ALL ? undefined : userId,
    action: action === ALL ? undefined : action,
    entityType: entityType === ALL ? undefined : entityType,
    fileNumber: debouncedFileNumber.trim() || undefined,
    page,
    limit: 25,
  };

  const { data, isLoading, isFetching } = useAuditLogs(filters);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const resetPage = () => setPage(1);

  return (
    <>
    <RecentActivitiesPreview />
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle>{t("audit.title")}</CardTitle>
        <Button variant="outline" asChild>
          <a href={auditExportUrl(filters)} data-testid="link-audit-export">
            <Download className="h-4 w-4 ml-1" />
            <span>{t("audit.exportCsv")}</span>
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label htmlFor="audit-from">{t("audit.from")}</Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">{t("audit.to")}</Label>
            <Input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("audit.user")}</Label>
            <Select
              dir="rtl"
              value={userId}
              onValueChange={(v) => {
                setUserId(v);
                resetPage();
              }}
            >
              <SelectTrigger data-testid="select-audit-user">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("audit.all")}</SelectItem>
                {(data?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("audit.action")}</Label>
            <Select
              dir="rtl"
              value={action}
              onValueChange={(v) => {
                setAction(v);
                resetPage();
              }}
            >
              <SelectTrigger data-testid="select-audit-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("audit.all")}</SelectItem>
                {(data?.actions ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    <span dir="ltr">{a}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("audit.entityType")}</Label>
            <Select
              dir="rtl"
              value={entityType}
              onValueChange={(v) => {
                setEntityType(v);
                resetPage();
              }}
            >
              <SelectTrigger data-testid="select-audit-entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("audit.all")}</SelectItem>
                {(data?.entityTypes ?? []).map((t) => (
                  <SelectItem key={t} value={t}>
                    <span dir="ltr">{t}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-file">{t("audit.fileNumber")}</Label>
            <Input
              id="audit-file"
              value={fileNumber}
              onChange={(e) => {
                setFileNumber(e.target.value);
                resetPage();
              }}
              placeholder={t("audit.fileNumberPlaceholder")}
              data-testid="input-audit-filenumber"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t("audit.time")}</TableHead>
                    <TableHead className="text-right">{t("audit.user")}</TableHead>
                    <TableHead className="text-right">{t("audit.action")}</TableHead>
                    <TableHead className="text-right">{t("audit.description")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.items ?? []).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        {t("audit.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatSaudiDateTime(item.createdAt)}
                      </TableCell>
                      <TableCell>{item.userName ?? "—"}</TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {item.action}
                      </TableCell>
                      <TableCell>{item.summary ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("audit.total", { count: data?.total ?? 0 })}
                {isFetching && " …"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("audit.previous")}
                </Button>
                <span className="text-sm">
                  {t("audit.page", { page, totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("audit.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
    </>
  );
}
