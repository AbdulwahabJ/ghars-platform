import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Download, Loader2, Lock, Printer } from "lucide-react";
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
import { formatSaudiDate } from "@/lib/datetime";
import { formatMoney, todayIso } from "@/lib/money";

/* ------------------------------------------------------------------ */
/* Period presets                                                      */
/* ------------------------------------------------------------------ */

const PERIODS = [
  { id: "today", label: "اليوم" },
  { id: "yesterday", label: "أمس" },
  { id: "this_week", label: "هذا الأسبوع" },
  { id: "this_month", label: "هذا الشهر" },
  { id: "last_month", label: "الشهر الماضي" },
  { id: "custom", label: "فترة مخصصة" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

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
      <Shell>
        <div className="flex flex-col items-center justify-center p-12 text-center min-h-[60vh]">
          <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-6">
            <Lock className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">التقارير المالية</h1>
          <p className="text-muted-foreground">
            ليست لديك صلاحية الوصول إلى البيانات المالية.
          </p>
        </div>
      </Shell>
    );
  }

  const kpis = data?.kpis;
  const kpiCards = kpis
    ? [
        { label: "المقبوض خلال الفترة", value: formatMoney(kpis.collectedInPeriod) },
        { label: "قيمة الحالات خلال الفترة", value: formatMoney(kpis.caseValueInPeriod) },
        { label: "الرسوم الإضافية", value: formatMoney(kpis.chargesInPeriod) },
        { label: "الخصومات", value: formatMoney(kpis.discountsInPeriod) },
        { label: "إجمالي المتبقي", value: formatMoney(kpis.totalOutstanding) },
        { label: "عدد الدفعات", value: String(kpis.paymentsCount) },
        {
          label: "عدد المرضى أصحاب المبالغ المتبقية",
          value: String(kpis.patientsWithBalanceCount),
        },
      ]
    : [];

  return (
    <Shell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Print-only header */}
        <div className="hidden print:block text-center border-b border-border pb-4 mb-4">
          <h1 className="text-xl font-bold">مجمع السن الرقمي الطبي — التقرير المالي</h1>
          <p className="text-sm mt-1">
            الفترة: {formatSaudiDate(filters.from)} — {formatSaudiDate(filters.to)}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <h1 className="text-2xl font-bold text-foreground">التقارير المالية</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(financeExportUrl(filters), "_blank")}
              disabled={!data}
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4 ms-1" />
              تصدير CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={!data}
              data-testid="button-print"
            >
              <Printer className="h-4 w-4 ms-1" />
              طباعة
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="print:hidden">
          <CardContent className="pt-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={period === p.id ? "default" : "outline"}
                  onClick={() => setPeriod(p.id)}
                  data-testid={`button-period-${p.id}`}
                >
                  {p.label}
                </Button>
              ))}
              {period === "custom" ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-40"
                    data-testid="input-custom-from"
                  />
                  <span className="text-muted-foreground text-sm">إلى</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-40"
                    data-testid="input-custom-to"
                  />
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Input
                placeholder="اسم المريض"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                data-testid="input-filter-patient"
              />
              <Input
                placeholder="رقم الملف"
                value={fileNumber}
                onChange={(e) => setFileNumber(e.target.value)}
                data-testid="input-filter-file-number"
              />
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="select-filter-method">
                  <SelectValue placeholder="طريقة الدفع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل طرق الدفع</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue placeholder="حالة الدفع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل حالات الدفع</SelectItem>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={implantSystem} onValueChange={setImplantSystem}>
                <SelectTrigger data-testid="select-filter-system">
                  <SelectValue placeholder="نظام الزرعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الأنظمة</SelectItem>
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
              تعذر تحميل التقرير المالي. يرجى المحاولة مرة أخرى.
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
                    التحصيل عبر الزمن (
                    {data.collectionGrouping === "day" ? "يومي" : "شهري"})
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]" dir="ltr">
                  {data.collectionSeries.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      لا توجد دفعات خلال الفترة المحددة.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.collectionSeries}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={70} />
                        <Tooltip
                          formatter={(value) => [formatMoney(Number(value)), "المبلغ"]}
                        />
                        <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">توزيع طرق الدفع</CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]" dir="ltr">
                  {data.methodDistribution.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      لا توجد دفعات خلال الفترة المحددة.
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
                          label={(entry) => entry.method}
                        >
                          {data.methodDistribution.map((entry, i) => (
                            <Cell
                              key={entry.method}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [formatMoney(Number(value)), "المبلغ"]}
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
                  الدفعات ({data.payments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    لا توجد دفعات مطابقة للفلاتر المحددة.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">المريض</TableHead>
                          <TableHead className="text-right">رقم الملف</TableHead>
                          <TableHead className="text-right">رقم الحالة</TableHead>
                          <TableHead className="text-right">وصف الدفعة</TableHead>
                          <TableHead className="text-right">المبلغ</TableHead>
                          <TableHead className="text-right">طريقة الدفع</TableHead>
                          <TableHead className="text-right">المستخدم</TableHead>
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
                            <TableCell>{p.paymentLabel ?? "—"}</TableCell>
                            <TableCell className="tabular-nums whitespace-nowrap">
                              {formatMoney(p.amount)}
                            </TableCell>
                            <TableCell>{p.paymentMethod ?? "—"}</TableCell>
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
