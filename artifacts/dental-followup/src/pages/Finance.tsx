import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, Lock, Printer } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type FinanceFilters,
} from "@workspace/shared";
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import { Shell } from "@/components/layout/Shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import { useFinanceOverview } from "@/hooks/use-finance";
import { useImplantOptions } from "@/hooks/use-implant-cases";
import { financeExportUrl } from "@/lib/api";
import { ExportMenu } from "@/components/exports/ExportMenu";
import { formatSaudiDate } from "@/lib/datetime";
import { formatMoney, todayIso } from "@/lib/money";
import { useTranslation } from "react-i18next";
import { useEnumTranslation } from "@/i18n/use-enum-translation";
import "@/i18n/locales/ar/operations";
import "@/i18n/locales/en/operations";

/* ------------------------------------------------------------------ */
/* Period presets                                                      */
/* ------------------------------------------------------------------ */

const PERIOD_IDS = ["today", "yesterday", "this_week", "this_month", "last_month", "custom"] as const;
type PeriodId = (typeof PERIOD_IDS)[number];
const PERIOD_TRANSLATION_KEYS: Record<PeriodId, string> = {
  today: "finance.today", yesterday: "finance.yesterday", this_week: "finance.thisWeek",
  this_month: "finance.thisMonth", last_month: "finance.lastMonth", custom: "finance.customPeriod",
};

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodRange(period: PeriodId, today: string): { from: string; to: string } {
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = shiftDays(today, -1);
      return { from: y, to: y };
    }
    case "this_week": {
      // Saudi work week starts on Sunday.
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      return { from: shiftDays(today, -dow), to: today };
    }
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const firstOfThis = `${today.slice(0, 7)}-01`;
      const lastOfPrev = shiftDays(firstOfThis, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
    default:
      return { from: today, to: today };
  }
}

const ALL = "__all__";
const CHART_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"];

/* ------------------------------------------------------------------ */

export default function Finance() {
  const { t, i18n } = useTranslation("operations");
  const locale = (i18n.language === "en" ? "en" : "ar") as "en" | "ar";
  const { enumLabel } = useEnumTranslation();
  const { user } = useAuth();
  const { data: options } = useImplantOptions();

  const today = useMemo(() => todayIso(), []);
  const [period, setPeriod] = useState<PeriodId>("this_month");
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [patientName, setPatientName] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(ALL);
  const [paymentStatus, setPaymentStatus] = useState<string>(ALL);
  const [implantSystem, setImplantSystem] = useState<string>(ALL);

  const debouncedName = useDebounce(patientName, 400);
  const debouncedFile = useDebounce(fileNumber, 400);

  const canView = Boolean(user?.canViewFinancials);

  const filters: FinanceFilters = useMemo(() => {
    const range =
      period === "custom"
        ? {
            from: customFrom || today,
            to: customTo && customTo >= (customFrom || today) ? customTo : (customFrom || today),
          }
        : periodRange(period, today);
    return {
      ...range,
      patientName: debouncedName.trim() || undefined,
      fileNumber: debouncedFile.trim() || undefined,
      paymentMethod:
        paymentMethod === ALL
          ? undefined
          : (paymentMethod as FinanceFilters["paymentMethod"]),
      paymentStatus:
        paymentStatus === ALL
          ? undefined
          : (paymentStatus as FinanceFilters["paymentStatus"]),
      implantSystem: implantSystem === ALL ? undefined : implantSystem,
    };
  }, [
    period,
    customFrom,
    customTo,
    today,
    debouncedName,
    debouncedFile,
    paymentMethod,
    paymentStatus,
    implantSystem,
  ]);

  const { data, isLoading, isError } = useFinanceOverview(filters, canView);

  if (!canView) {
    return (
      <Shell decorated>
        <div className="flex flex-col items-center justify-center p-12 text-center min-h-[60vh]">
          <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-6">
            <Lock className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">{t("finance.title")}</h1>
          <p className="text-muted-foreground">
            {t("finance.noAccess")}
          </p>
        </div>
      </Shell>
    );
  }

  const kpis = data?.kpis;
  const kpiCards = kpis
    ? [
        { label: t("finance.collected"), value: formatMoney(kpis.collectedInPeriod, locale) },
        { label: t("finance.caseValue"), value: formatMoney(kpis.caseValueInPeriod, locale) },
        { label: t("finance.charges"), value: formatMoney(kpis.chargesInPeriod, locale) },
        { label: t("finance.discounts"), value: formatMoney(kpis.discountsInPeriod, locale) },
        { label: t("finance.outstanding"), value: formatMoney(kpis.totalOutstanding, locale) },
        { label: t("finance.paymentsCount"), value: String(kpis.paymentsCount) },
        {
          label: t("finance.balancePatients"),
          value: String(kpis.patientsWithBalanceCount),
        },
      ]
    : [];

  return (
    <Shell decorated>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Print-only header */}
        <div className="hidden print:block text-center border-b border-border pb-4 mb-4">
          <h1 className="text-xl font-bold text-brand-navy">{t("finance.printTitle")}</h1>
          <p className="text-sm mt-1">
            {t("finance.printPeriod", { from: formatSaudiDate(filters.from), to: formatSaudiDate(filters.to) })}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <h1 className="text-2xl font-bold text-foreground">{t("finance.title")}</h1>
          <div className="flex items-center gap-2">
            <ExportMenu
              getUrl={(format) => financeExportUrl(filters, format)}
              formats={["pdf", "xlsx"]}
              disabled={!data}
              data-testid="button-export-finance"
            />
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={!data}
              data-testid="button-print"
            >
              <Printer className="h-4 w-4 ms-1" />
              {t("finance.print")}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="print:hidden">
          <CardContent className="pt-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {PERIOD_IDS.map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant={period === id ? "default" : "outline"}
                  onClick={() => setPeriod(id)}
                  data-testid={`button-period-${id}`}
                >
                  {t(PERIOD_TRANSLATION_KEYS[id])}
                </Button>
              ))}
              {period === "custom" ? (
                <div className="flex items-center gap-2">
                  <div className="w-40">
                    <OperationalDatePicker
                      value={customFrom}
                      onChange={setCustomFrom}
                      data-testid="input-custom-from"
                    />
                  </div>
                  <span className="text-muted-foreground text-sm">{t("finance.to")}</span>
                  <div className="w-40">
                    <OperationalDatePicker
                      value={customTo}
                      onChange={setCustomTo}
                      data-testid="input-custom-to"
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Input
                placeholder={t("finance.patientName")}
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                data-testid="input-filter-patient"
              />
              <Input
                placeholder={t("finance.fileNumber")}
                value={fileNumber}
                onChange={(e) => setFileNumber(e.target.value)}
                data-testid="input-filter-file-number"
              />
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="select-filter-method">
                  <SelectValue placeholder={t("finance.paymentMethodPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("finance.allPaymentMethods")}</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {enumLabel("paymentMethod", m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue placeholder={t("finance.paymentStatusPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("finance.allPaymentStatuses")}</SelectItem>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {enumLabel("paymentStatus", s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={implantSystem} onValueChange={setImplantSystem}>
                <SelectTrigger data-testid="select-filter-system">
                  <SelectValue placeholder={t("finance.implantSystemPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("finance.allSystems")}</SelectItem>
                  {(options?.systems ?? []).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading && !data ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("finance.financeLoadError")}
            </AlertDescription>
          </Alert>
        ) : data ? (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {kpiCards.map((k) => (
                <Card key={k.label} data-testid={`kpi-${k.label}`}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1.5 leading-snug">
                      {k.label}
                    </p>
                    <p className="text-lg font-bold tabular-nums">{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {t("finance.collectionOverTime", { grouping: t(data.collectionGrouping === "day" ? "finance.daily" : "finance.monthly") })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]" dir="ltr">
                  {data.collectionSeries.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      {t("finance.noPaymentsPeriod")}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.collectionSeries}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(value) => String(value)} />
                        <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(value) => formatMoney(Number(value), locale)} />
                        <Tooltip
                          formatter={(value) => [formatMoney(Number(value), locale), t("finance.amount")]}
                        />
                        <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("finance.paymentMethodDistribution")}</CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]" dir="ltr">
                  {data.methodDistribution.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      {t("finance.noPaymentsPeriod")}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.methodDistribution}
                          dataKey="amount"
                          nameKey="method"
                          innerRadius={55}
                          outerRadius={90}
                          label={(entry) => enumLabel("paymentMethod", entry.method)}
                        >
                          {data.methodDistribution.map((entry, i) => (
                            <Cell
                              key={entry.method}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [formatMoney(Number(value), locale), t("finance.amount")]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Payments table */}
            <Card data-testid="card-finance-payments">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t("finance.payments", { count: data.payments.length })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {t("finance.noPaymentsFilters")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-start">{t("finance.date")}</TableHead>
                          <TableHead className="text-start">{t("finance.patient")}</TableHead>
                          <TableHead className="text-start">{t("finance.fileNumber")}</TableHead>
                          <TableHead className="text-start">{t("finance.caseNumber")}</TableHead>
                          <TableHead className="text-start">{t("finance.paymentDescription")}</TableHead>
                          <TableHead className="text-start">{t("finance.amount")}</TableHead>
                          <TableHead className="text-start">{t("finance.paymentMethod")}</TableHead>
                          <TableHead className="text-start">{t("finance.user")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.payments.map((p) => (
                          <TableRow key={p.id} data-testid={`row-finance-payment-${p.id}`}>
                            <TableCell className="whitespace-nowrap">
                              {formatSaudiDate(p.paymentDate)}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/patients/${p.patientId}`}
                                className="text-primary hover:underline"
                                data-testid={`link-patient-${p.patientId}`}
                              >
                                {p.patientName}
                              </Link>
                            </TableCell>
                            <TableCell>{p.fileNumber}</TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {p.implantCaseId.slice(0, 8)}
                            </TableCell>
                            <TableCell>{p.paymentLabel ? enumLabel("paymentLabel", p.paymentLabel) : "—"}</TableCell>
                            <TableCell className="tabular-nums whitespace-nowrap">
                              {formatMoney(p.amount, locale)}
                            </TableCell>
                            <TableCell>{p.paymentMethod ? enumLabel("paymentMethod", p.paymentMethod) : "—"}</TableCell>
                            <TableCell>{p.createdByName ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
