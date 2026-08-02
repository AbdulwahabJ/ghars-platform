import { Download, Loader2, Printer } from "lucide-react";
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
import { operationalExportUrl } from "@/lib/api";
import { formatSaudiDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type {
  OperationalReportResponse,
  ReportFilters,
} from "@workspace/shared";

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
  const showFinance = Boolean(data?.financialsIncluded);

  return (
    <Card data-testid="card-operational-report">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">
          التقرير التشغيلي ({data?.rows.length ?? 0})
        </CardTitle>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() => window.open(operationalExportUrl(filters), "_blank")}
            data-testid="button-export-operational"
          >
            <Download className="h-4 w-4" />
            <span>تصدير CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() => window.print()}
            data-testid="button-print-operational"
          >
            <Printer className="h-4 w-4" />
            <span>طباعة</span>
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
            تعذر تحميل التقرير التشغيلي. حاول تحديث الصفحة.
          </p>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-5">
            لا توجد حالات مطابقة للفلاتر المحددة.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المريض</TableHead>
                  <TableHead className="text-right">رقم الملف</TableHead>
                  <TableHead className="text-right">حالة الحالة</TableHead>
                  <TableHead className="text-right">الطبيب المعالج</TableHead>
                  <TableHead className="text-right">تاريخ العملية</TableHead>
                  <TableHead className="text-right">الزرعات</TableHead>
                  <TableHead className="text-right">الأنظمة</TableHead>
                  <TableHead className="text-right">المتابعة القادمة</TableHead>
                  <TableHead className="text-right print:hidden"> </TableHead>
                  {showFinance && (
                    <>
                      <TableHead className="text-right">المتبقي</TableHead>
                      <TableHead className="text-right">حالة السداد</TableHead>
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
                            متأخرة
                          </Badge>
                        )}
                        {r.isReady && (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">
                            جاهزة للتركيب
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell dir="ltr">{r.fileNumber}</TableCell>
                    <TableCell className="notranslate">{r.caseStatus}</TableCell>
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
                        <Link href={`/patients/${r.patientId}`}>فتح الملف</Link>
                      </Button>
                    </TableCell>
                    {showFinance && (
                      <>
                        <TableCell className="tabular-nums">
                          {r.finance ? formatMoney(r.finance.remaining) : "—"}
                        </TableCell>
                        <TableCell className="notranslate">
                          {r.finance?.paymentStatus ?? "—"}
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
