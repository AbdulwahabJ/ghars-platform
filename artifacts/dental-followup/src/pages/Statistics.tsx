import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Download, Loader2, Printer, TrendingDown, TrendingUp } from "lucide-react";
import type { ReportFilters, StatCount, StatisticsHub } from "@workspace/shared";
import { Shell } from "@/components/layout/Shell";
import {
  ALL,
  ReportFiltersBar,
  type ReportFilterState,
} from "@/components/dashboard/ReportFiltersBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useImplantOptions } from "@/hooks/use-implant-cases";
import { useStatistics } from "@/hooks/use-reports";
import { formatMoney, todayIso } from "@/lib/money";
import { reportPeriodRange } from "@/lib/report-periods";
import { useTranslation } from "react-i18next";

const CHART_COLORS = ["#1d7a8c", "#295c9b", "#d78b30", "#7a5cc7", "#517176", "#b95353"];
const countFormat = new Intl.NumberFormat("ar-SA-u-nu-latn");

function EmptyChart() {
  const { t } = useTranslation("statistics");
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      {t("noDataPeriod")}
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
  tone = "default",
}: {
  title: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/25 bg-destructive/[0.04]"
      : tone === "warning"
        ? "border-amber-500/25 bg-amber-500/[0.04]"
        : "border-border";
  return (
    <Card className={`${toneClass} shadow-sm`} data-testid={`statistics-kpi-${title}`}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums notranslate">
          {typeof value === "number" ? countFormat.format(value) : value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function DistributionList({ data, emptyLabel }: { data: StatCount[]; emptyLabel: string }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-3">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-border/70">
      {data.slice(0, 8).map((item) => (
        <li key={item.name} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="truncate notranslate">{item.name}</span>
          <span className="font-semibold tabular-nums notranslate">
            {countFormat.format(item.count)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ChartFrame({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]" dir="ltr">
        {children}
      </CardContent>
    </Card>
  );
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadCsv(
  hub: StatisticsHub,
  from: string,
  to: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const rows: Array<Array<string | number>> = [
    [t("csv.title"), t("csv.from"), from, t("csv.to"), to],
    [],
    [t("csv.metric"), t("csv.value")],
    [t("csv.patientsInCases"), hub.overview.patients],
    [t("csv.implantCases"), hub.overview.cases],
    [t("csv.implants"), hub.overview.implants],
    [t("csv.documentedProsthetics"), hub.overview.prostheticEvents],
    [t("csv.followups"), hub.overview.followups],
    [t("csv.overdueFollowups"), hub.overview.overdueFollowups],
    [t("csv.failedImplants"), hub.overview.failedImplants],
    [t("csv.needsRedoImplants"), hub.overview.needsRedoImplants],
    [],
    [t("csv.system"), t("csv.implantCount")],
    ...hub.prosthetics.byDoctor.map((item) => [item.name, item.count]),
    [],
    [t("csv.doctor"), t("csv.patients"), t("csv.cases"), t("csv.implants"), t("csv.prosthetics"), t("csv.followups")],
    ...hub.doctors.map((doctor) => [
      doctor.name,
      doctor.patients,
      doctor.cases,
      doctor.implants,
      doctor.prosthetics,
      doctor.followups,
    ]),
  ];
  if (hub.financials) {
    rows.push(
      [],
      [t("csv.financialMetrics"), t("csv.value")],
      [t("csv.treatmentValue"), hub.financials.treatmentValue],
      [t("csv.collected"), hub.financials.collected],
      [t("csv.remaining"), hub.financials.remaining],
    );
  }
  const blob = new Blob(
    [`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `statistics-${from}-to-${to}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Statistics() {
  const { t, i18n } = useTranslation("statistics");
  const isRtl = i18n.dir() === "rtl";
  const today = useMemo(() => todayIso(), []);
  const [filterState, setFilterState] = useState<ReportFilterState>({
    period: "last_3_months",
    customFrom: reportPeriodRange("last_3_months", today).from,
    customTo: today,
    treatingDoctor: ALL,
    implantSystem: ALL,
    implantStatus: ALL,
    caseStatus: ALL,
  });
  const { data: implantOptions } = useImplantOptions();

  const filters: ReportFilters = useMemo(() => {
    const range =
      filterState.period === "custom"
        ? {
            from: filterState.customFrom,
            to:
              filterState.customTo >= filterState.customFrom
                ? filterState.customTo
                : filterState.customFrom,
          }
        : filterState.period === "specific_day"
          ? {
              from: filterState.customFrom || today,
              to: filterState.customFrom || today,
            }
          : reportPeriodRange(filterState.period, today);
    return {
      ...range,
      treatingDoctor:
        filterState.treatingDoctor === ALL ? undefined : filterState.treatingDoctor,
      implantSystem:
        filterState.implantSystem === ALL ? undefined : filterState.implantSystem,
      implantStatus:
        filterState.implantStatus === ALL ? undefined : filterState.implantStatus,
      caseStatus:
        filterState.caseStatus === ALL
          ? undefined
          : (filterState.caseStatus as ReportFilters["caseStatus"]),
    };
  }, [filterState, today]);

  const statistics = useStatistics(filters);
  const data = statistics.data;
  const hub = data?.hub;

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t, i18n.language]);

  return (
    <Shell decorated>
      <div className="space-y-6 pb-8" data-testid="statistics-hub">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:mb-5">
          <div>
            <p className="text-sm font-medium text-primary">{t("analyticsCenter")}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()} data-testid="button-print-statistics">
              <Printer className={isRtl ? "ms-2 h-4 w-4" : "me-2 h-4 w-4"} />
              {t("print")}
            </Button>
            <Button
              onClick={() => hub && downloadCsv(hub, filters.from, filters.to, t)}
              disabled={!hub}
              data-testid="button-export-statistics"
            >
              <Download className={isRtl ? "ms-2 h-4 w-4" : "me-2 h-4 w-4"} />
              {t("exportCsv")}
            </Button>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-muted/35 p-4 print:hidden">
          <ReportFiltersBar
            state={filterState}
            onChange={setFilterState}
            doctorOptions={data?.doctorOptions ?? []}
            systemOptions={implantOptions?.systems ?? []}
          />
        </section>

        <div className="hidden print:block text-sm text-muted-foreground">
          {t("period")} <span className="notranslate">{filters.from}</span> {t("to")}{" "}
          <span className="notranslate">{filters.to}</span>
        </div>

        {statistics.isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        ) : statistics.isError || !hub ? (
          <Card>
            <CardContent className="py-14 text-center text-sm text-destructive">
              {t("loadError")}
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi title={t("implantCases")} value={hub.overview.cases} hint={t("periodAndFilters")} />
              <Kpi title={t("implants")} value={hub.overview.implants} hint={t("systemsUsed", { count: hub.overview.systems })} />
               <Kpi title={t("adjunctProcedures")} value={hub.overview.boneGraftProcedures} hint={t("activeClinicalRecords")} />
               <Kpi title={t("prosthetics")} value={hub.overview.prostheticEvents} hint={t("patientsCount", { count: hub.overview.prostheticPatients })} />
               <Kpi title={t("overdueFollowups")} value={hub.overview.overdueFollowups} hint={t("needsReview")} tone="warning" />
              <Kpi
                title={t("needsTreatment")}
                value={hub.overview.failedImplants + hub.overview.needsRedoImplants}
                hint={t("failedOrNeedsRedo")}
                tone={hub.overview.failedImplants > 0 ? "danger" : "default"}
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">{t("patientsCasesImplants")}</h2>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <ChartFrame title={t("caseImplantFlow", { grouping: data.overTimeGrouping === "day" ? t("daily") : t("monthly") })} className="xl:col-span-2">
                  {data.overTime.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.overTime}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.45} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                        <Tooltip />
                        <Bar dataKey="cases" name={t("cases")} fill="#295c9b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="implants" name={t("implants")} fill="#1d7a8c" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartFrame>
                <Card>
                   <CardHeader className="pb-2"><CardTitle className="text-base">{t("patientIndicators")}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                     <div className="flex justify-between text-sm"><span>{t("newPatients")}</span><strong className="tabular-nums">{hub.patients.newPatients}</strong></div>
                     <div className="flex justify-between text-sm"><span>{t("implantedPatients")}</span><strong className="tabular-nums">{hub.patients.implantedPatients}</strong></div>
                     <div className="flex justify-between text-sm"><span>{t("casePatients")}</span><strong className="tabular-nums">{hub.patients.casePatients}</strong></div>
                     <div className="flex justify-between text-sm"><span>{t("prostheticPatients")}</span><strong className="tabular-nums">{hub.patients.prostheticPatients}</strong></div>
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                 <ChartFrame title={t("implantSystems")}>
                  {data.implantSystems.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={data.implantSystems} dataKey="count" nameKey="name" innerRadius={52} outerRadius={88}>
                        {data.implantSystems.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                      </Pie><Tooltip /></PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartFrame>
                 <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("caseStatuses")}</CardTitle></CardHeader><CardContent><DistributionList data={data.caseStatuses} emptyLabel={t("noCasesPeriod")} /></CardContent></Card>
                 <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("implantStatuses")}</CardTitle></CardHeader><CardContent><DistributionList data={data.implantStatuses} emptyLabel={t("noImplantsPeriod")} /></CardContent></Card>
              </div>
            </section>

            <section className="space-y-3">
               <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t("adjunctSurgicalProcedures")}</h2></div>
              <div className="grid gap-4 lg:grid-cols-3">
                 <ChartFrame title={t("adjunctProceduresOverTime")}>
                  {hub.boneGraftProcedures.overTime.length === 0 ? <EmptyChart /> : (
                     <ResponsiveContainer width="100%" height="100%"><LineChart data={hub.boneGraftProcedures.overTime}><CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.45} /><XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} /><Tooltip /><Line type="monotone" dataKey="count" name={t("procedures")} stroke="#7c5b2b" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer>
                  )}
                </ChartFrame>
                 <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("typesAndMaterials")}</CardTitle></CardHeader><CardContent className="space-y-3"><DistributionList data={hub.boneGraftProcedures.types} emptyLabel={t("noDocumentedProcedures")} /><div className="border-t pt-2"><DistributionList data={hub.boneGraftProcedures.materials} emptyLabel={t("noRecordedMaterials")} /></div></CardContent></Card>
                 <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("proceduresSummary")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>{t("totalProcedures")}</span><b>{hub.boneGraftProcedures.total}</b></div><div className="flex justify-between"><span>{t("cases")}</span><b>{hub.boneGraftProcedures.cases}</b></div><div className="flex justify-between"><span>{t("patients")}</span><b>{hub.boneGraftProcedures.patients}</b></div><div className="mt-3 border-t pt-2"><DistributionList data={hub.boneGraftProcedures.statuses} emptyLabel={t("noRecordedCases")} /></div></CardContent></Card>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t("prostheticsFollowupsCommunications")}</h2></div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartFrame title={t("prostheticsOverTime")}>
                  {hub.prosthetics.overTime.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height="100%"><LineChart data={hub.prosthetics.overTime}><CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.45} /><XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} /><Tooltip /><Line type="monotone" dataKey="count" name={t("prosthetics")} stroke="#1d7a8c" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer>
                  )}
                </ChartFrame>
                <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("prosthetics")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>{t("temporary")}</span><b className="tabular-nums">{hub.prosthetics.temporary}</b></div><div className="flex justify-between"><span>{t("permanent")}</span><b className="tabular-nums">{hub.prosthetics.permanent}</b></div><div className="flex justify-between"><span>{t("readyForProsthetics")}</span><b className="tabular-nums">{hub.prosthetics.readyCases}</b></div><div className="mt-3 border-t pt-2"><DistributionList data={hub.prosthetics.byDoctor} emptyLabel={t("noDocumentedProsthetics")} /></div></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("followupStatus")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>{t("scheduled")}</span><b className="tabular-nums">{hub.followups.scheduled}</b></div><div className="flex justify-between"><span>{t("dueToday")}</span><b className="tabular-nums">{hub.followups.dueToday}</b></div><div className="flex justify-between text-destructive"><span>{t("overdue")}</span><b className="tabular-nums">{hub.followups.overdue}</b></div><div className="flex justify-between"><span>{t("needsRecontact")}</span><b className="tabular-nums">{hub.followups.needsRecontact}</b></div></CardContent></Card>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("followupTypes")}</CardTitle></CardHeader><CardContent><DistributionList data={hub.followups.types} emptyLabel={t("noFollowups")} /></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("followupOutcomes")}</CardTitle></CardHeader><CardContent><DistributionList data={hub.followups.outcomes} emptyLabel={t("noFollowupOutcomes")} /></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("communicationLog")}</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex justify-between text-sm"><span>{t("totalRecords")}</span><b className="tabular-nums">{hub.communications.total}</b></div><div className="flex justify-between text-sm"><span>{t("recordsWithResults")}</span><b className="tabular-nums">{hub.communications.withResults}</b></div><DistributionList data={hub.communications.results} emptyLabel={t("noCommunicationRecords")} /></CardContent></Card>
              </div>
            </section>

            {hub.financials ? (
              <section className="space-y-3" data-testid="statistics-financial-section">
                <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t("financial")}</h2></div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi title={t("treatmentValue")} value={formatMoney(hub.financials.treatmentValue)} hint={t("selectedCases")} />
                  <Kpi title={t("collectedDuringPeriod")} value={formatMoney(hub.financials.collected)} hint={t("nonVoidedPayments", { count: hub.financials.payments })} />
                  <Kpi title={t("remainingForCases")} value={formatMoney(hub.financials.remaining)} hint={t("basedOnActualRecords")} tone="warning" />
                  <Kpi title={t("discounts")} value={formatMoney(hub.financials.discounts)} hint={t("charges", { amount: formatMoney(hub.financials.charges) })} />
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <ChartFrame title={t("collectionsOverTime")} className="lg:col-span-2">
                    {hub.financials.collectionsOverTime.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height="100%"><BarChart data={hub.financials.collectionsOverTime}><CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.45} /><XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={45} /><Tooltip formatter={(v) => formatMoney(Number(v))} /><Bar dataKey="count" name={t("collected")} fill="#1d7a8c" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
                    )}
                  </ChartFrame>
                  <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("paymentMethodsAndStatuses")}</CardTitle></CardHeader><CardContent><DistributionList data={hub.financials.paymentMethods} emptyLabel={t("noPaymentsPeriod")} /><div className="mt-3 border-t pt-2"><DistributionList data={hub.financials.paymentStatuses} emptyLabel={t("noFinancialStatuses")} /></div></CardContent></Card>
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t("activityByDoctor")}</h2></div>
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-muted/60 text-muted-foreground"><tr><th className={`p-3 font-medium ${isRtl ? "text-start" : "text-start"}`}>{t("doctor")}</th><th className="p-3 text-center font-medium">{t("patients")}</th><th className="p-3 text-center font-medium">{t("cases")}</th><th className="p-3 text-center font-medium">{t("implants")}</th><th className="p-3 text-center font-medium">{t("prostheticsColumn")}</th><th className="p-3 text-center font-medium">{t("followups")}</th></tr></thead>
                    <tbody>{hub.doctors.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("noDoctorData")}</td></tr> : hub.doctors.map((doctor) => <tr key={doctor.name} className="border-t"><td className="p-3 font-medium notranslate">{doctor.name}</td><td className="p-3 text-center tabular-nums">{doctor.patients}</td><td className="p-3 text-center tabular-nums">{doctor.cases}</td><td className="p-3 text-center tabular-nums">{doctor.implants}</td><td className="p-3 text-center tabular-nums">{doctor.prosthetics}</td><td className="p-3 text-center tabular-nums">{doctor.followups}</td></tr>)}</tbody>
                  </table>
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}