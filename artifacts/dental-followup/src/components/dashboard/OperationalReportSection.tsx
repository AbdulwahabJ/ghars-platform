import { Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import { buildPatientFollowupsPath, buildPatientPath } from "@/lib/patient-links";
import { operationalExportUrl } from "@/lib/api";
import { ExportMenu } from "@/components/exports/ExportMenu";
import { formatSaudiDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type {
  OperationalReportResponse,
  ReportFilters,
} from "@workspace/shared";
import { useTranslation } from "react-i18next";
import { useEnumTranslation } from "@/i18n/use-enum-translation";

/**
 * Filtered operational report: on-screen table + CSV export + browser print.
 * Financial columns appear only when the backend included them for this user.
 */
export function OperationalReportSection({
  data,
  isLoading,
  isError,
  filters,
}: {
  data: OperationalReportResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  filters: ReportFilters;
}) {
  const { t } = useTranslation("guidance");
  const { enumLabel } = useEnumTranslation();
  const showFinance = Boolean(data?.financialsIncluded);

  return (
    <Card data-testid="card-operational-report">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">
          {t("dashboard.operationalReport", { count: data?.rows.length ?? 0 })}
        </CardTitle>
        <div className="flex gap-2 print:hidden">
          <ExportMenu
            getUrl={(format) => operationalExportUrl(filters, format)}
            formats={["pdf", "xlsx"]}
            disabled={!data || data.rows.length === 0}
            data-testid="button-export-operational"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() => window.print()}
            data-testid="button-print-operational"
          >
            <Printer className="h-4 w-4" />
            <span>{t("dashboard.print")}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-destructive py-6 text-center">
            {t("dashboard.reportLoadError")}
          </p>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-5">
            {t("dashboard.noFilteredCases")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("dashboard.patient")}</TableHead>
                  <TableHead className="text-start">{t("dashboard.fileNumber")}</TableHead>
                  <TableHead className="text-start">{t("dashboard.caseStatus")}</TableHead>
                  <TableHead className="text-start">{t("dashboard.treatingDoctor")}</TableHead>
                  <TableHead className="text-start">{t("dashboard.procedureDate")}</TableHead>
                  <TableHead className="text-start">{t("dashboard.implants")}</TableHead>
                  <TableHead className="text-start">{t("dashboard.systems")}</TableHead>
                  <TableHead className="text-start">{t("dashboard.nextFollowup")}</TableHead>
                  <TableHead className="text-start print:hidden"> </TableHead>
                  {showFinance && (
                    <>
                       <TableHead className="text-start">{t("dashboard.remaining")}</TableHead>
                       <TableHead className="text-start">{t("dashboard.paymentStatus")}</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.caseId} data-testid={`report-row-${r.caseId}`}>
                    <TableCell className="font-medium notranslate">
                      {r.patientName}
                      <span className="flex gap-1 mt-1">
                        {r.isOverdue && (
                          <Badge variant="destructive" className="text-[10px]">
                             {t("dashboard.overdue")}
                          </Badge>
                        )}
                        {r.isReady && (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">
                             {t("dashboard.readyForProsthesis")}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell dir="ltr">{r.fileNumber}</TableCell>
                    <TableCell>{enumLabel("caseStatus", r.caseStatus)}</TableCell>
                    <TableCell className="notranslate">{r.treatingDoctor}</TableCell>
                    <TableCell>
                      {r.procedureDate ? formatSaudiDate(r.procedureDate) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.implantCount}</TableCell>
                    <TableCell className="notranslate">
                      {r.implantSystems.length > 0
                        ? r.implantSystems.join("، ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {r.nextFollowupAt ? formatSaudiDate(r.nextFollowupAt) : "—"}
                    </TableCell>
                    <TableCell className="print:hidden">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={
                            r.nextFollowupAt || r.isOverdue
                              ? buildPatientFollowupsPath(r.patientId)
                              : buildPatientPath(r.patientId)
                          }
                        >
                          {t("dashboard.openPatient")}
                        </Link>
                      </Button>
                    </TableCell>
                    {showFinance && (
                      <>
                        <TableCell className="tabular-nums">
                          {r.finance ? formatMoney(r.finance.remaining) : "—"}
                        </TableCell>
                        <TableCell>
                          {r.finance ? enumLabel("paymentStatus", r.finance.paymentStatus) : "—"}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
