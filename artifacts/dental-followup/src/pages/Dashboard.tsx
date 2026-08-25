import React, { useState, useEffect, useMemo, useRef, useId } from "react";
import { useLocation } from "wouter";
import {
  saudiGreeting,
  formatSaudiWeekdayDate,
  formatSaudiDateTime,
} from "@/lib/datetime";
import { useAuth } from "@/hooks/use-auth";
import { Shell } from "@/components/layout/Shell";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { usePatients } from "@/hooks/use-patients";
import { Patient, type ReportFilters } from "@workspace/shared";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useDashboard,
  useOperationalReport,
  useStatistics,
} from "@/hooks/use-reports";
import { useImplantOptions } from "@/hooks/use-implant-cases";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ActionLists } from "@/components/dashboard/ActionLists";
import {
  ALL,
  type ReportFilterState,
} from "@/components/dashboard/ReportFiltersBar";
import { StatisticsSection } from "@/components/dashboard/StatisticsSection";
import { OperationalTable } from "@/components/dashboard/OperationalTable";
import { reportPeriodRange } from "@/lib/report-periods";
import { todayIso } from "@/lib/money";
import { useTranslation } from "react-i18next";
import "@/i18n/locales/ar/operations";
import "@/i18n/locales/en/operations";

export default function Dashboard() {
  const { t } = useTranslation("operations");
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const greeting = saudiGreeting();
  const todayDate = formatSaudiWeekdayDate(new Date());
  const heroArcGradientId = useId();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading: isSearching } = usePatients({ 
    query: debouncedSearch,
    pageSize: 5
  });

  const today = useMemo(() => todayIso(), []);
  const dashboard = useDashboard();
  const { data: implantOptions } = useImplantOptions();

  const [filterState, setFilterState] = useState<ReportFilterState>({
    period: "this_month",
    customFrom: `${todayIso().slice(0, 7)}-01`,
    customTo: todayIso(),
    treatingDoctor: ALL,
    implantSystem: ALL,
    implantStatus: ALL,
    caseStatus: ALL,
  });
  const [operationalSearch, setOperationalSearch] = useState("");
  const debouncedOperationalSearch = useDebounce(operationalSearch, 275);

  const reportFilters: ReportFilters = useMemo(() => {
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
        filterState.treatingDoctor === ALL
          ? undefined
          : filterState.treatingDoctor,
      implantSystem:
        filterState.implantSystem === ALL
          ? undefined
          : filterState.implantSystem,
      implantStatus:
        filterState.implantStatus === ALL
          ? undefined
          : filterState.implantStatus,
      caseStatus:
        filterState.caseStatus === ALL
          ? undefined
          : (filterState.caseStatus as ReportFilters["caseStatus"]),
      search: debouncedOperationalSearch.trim() || undefined,
    };
  }, [debouncedOperationalSearch, filterState, today]);

  const statistics = useStatistics(reportFilters);
  const report = useOperationalReport(reportFilters);

  const [prevSearch, setPrevSearch] = useState(debouncedSearch);
  if (prevSearch !== debouncedSearch) {
    setPrevSearch(debouncedSearch);
    setIsSearchOpen(debouncedSearch.length > 0);
    setHighlightIndex(-1);
  }

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handlePatientSelect = (id: string) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setLocation(`/patients/${id}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = searchResults?.items ?? [];
    if (e.key === "Escape") {
      setIsSearchOpen(false);
      setHighlightIndex(-1);
      return;
    }
    if (!isSearchOpen || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0 && highlightIndex < items.length) {
      e.preventDefault();
      handlePatientSelect(items[highlightIndex].id);
    }
  };

  return (
    <Shell decorated>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Section A: Greeting & Search */}
        <section className="bg-primary/5 rounded-3xl p-8 md:p-12 relative border border-primary/10 print:hidden">
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute top-0 end-0 w-64 h-64 bg-primary/5 rounded-bl-full" />
          </div>
          
          <div className="relative z-10 grid gap-8 md:min-h-[350px] md:grid-cols-[minmax(0,1fr)_minmax(220px,36%)] md:items-center md:gap-10">
            {/* Right: greeting, date, and the existing patient search */}
            <div className="order-2 min-w-0 md:order-none">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {greeting}، {user?.fullName}
              </h1>
              <p className="text-muted-foreground text-lg">{todayDate}</p>

              <div className="mt-10 w-full max-w-3xl relative z-20" id="tour-global-search" ref={searchContainerRef}>
                <div className="relative">
                  <Search className="absolute end-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => debouncedSearch.length > 0 && setIsSearchOpen(true)}
                    onKeyDown={handleSearchKeyDown}
                    role="combobox"
                    aria-expanded={isSearchOpen}
                    aria-controls="global-search-results"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      isSearchOpen && highlightIndex >= 0
                        ? `global-search-option-${highlightIndex}`
                        : undefined
                    }
                    placeholder={t("dashboard.searchPatients")}
                    className="h-14 ps-4 pe-12 text-lg rounded-2xl border-border bg-card shadow-sm focus-visible:ring-primary focus-visible:border-primary"
                  />
                  {isSearching && (
                    <div className="absolute start-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>

                {isSearchOpen && (
                  <div
                    id="global-search-results"
                    role="listbox"
                    className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden max-h-96 overflow-y-auto"
                  >
                    {searchResults?.items && searchResults.items.length > 0 ? (
                      <div className="py-2">
                        {searchResults.items.map((patient: Patient, index: number) => (
                          <button
                            key={patient.id}
                            id={`global-search-option-${index}`}
                            role="option"
                            aria-selected={index === highlightIndex}
                            onClick={() => handlePatientSelect(patient.id)}
                            onMouseEnter={() => setHighlightIndex(index)}
                            className={`w-full text-start px-4 py-3 transition-colors flex items-center justify-between gap-3 border-b border-border/50 last:border-0 ${
                              index === highlightIndex ? "bg-muted" : "hover:bg-muted"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate">{patient.fullName}</p>
                              <p className="text-sm text-muted-foreground mt-1" dir="ltr">{patient.fileNumber}</p>
                            </div>
                            {patient.status === 'archived' && (
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md shrink-0">{t("dashboard.archived")}</span>
                            )}
                          </button>
                        ))}
                        {searchResults.total > 5 && (
                          <button
                            onClick={() => setLocation(`/patients?q=${encodeURIComponent(debouncedSearch)}`)}
                            className="w-full text-center py-3 text-sm text-primary font-medium hover:bg-primary/5 transition-colors"
                          >
                            {t("dashboard.viewAllResults", { count: searchResults.total })}
                          </button>
                        )}
                      </div>
                    ) : debouncedSearch.length > 0 && !isSearching ? (
                      <div className="py-8 text-center text-muted-foreground">
                        {t("dashboard.noSearchResults", { query: debouncedSearch })}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Left: signed-in user portrait composition */}
            {user && (
              <div className="hero-portrait-composition order-1 md:order-none">
                <div className="hero-portrait-visual">
                  {/* Soft pulsing glow halo */}
                  <div
                    aria-hidden="true"
                    className="hero-decor hero-decor-halo h-[210px] w-[210px] sm:h-[250px] sm:w-[250px] md:h-[320px] md:w-[320px] lg:h-[380px] lg:w-[380px]"
                  />
                  {/* Slow-morphing abstract shape behind the portrait */}
                  <div
                    aria-hidden="true"
                    className="hero-decor hero-decor-blob h-[168px] w-[148px] sm:h-[204px] sm:w-[180px] md:h-[268px] md:w-[234px] lg:h-[322px] lg:w-[280px]"
                  />
                  {/* Orbit strokes inspired by the logo language */}
                  <div
                    aria-hidden="true"
                    className="hero-decor hero-decor-orbit-a h-[190px] w-[138px] sm:h-[230px] sm:w-[166px] md:h-[300px] md:w-[220px] lg:h-[360px] lg:w-[264px]"
                  />
                  <div
                    aria-hidden="true"
                    className="hero-decor hero-decor-orbit-b h-[160px] w-[178px] sm:h-[194px] sm:w-[216px] md:h-[252px] md:w-[282px] lg:h-[304px] lg:w-[338px]"
                  />
                  {/* Curved connection line with network nodes */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 200 260"
                    fill="none"
                    className="hero-decor hero-decor-arc h-[200px] w-[154px] sm:h-[240px] sm:w-[185px] md:h-[314px] md:w-[242px] lg:h-[376px] lg:w-[290px]"
                  >
                    <defs>
                      <linearGradient id={heroArcGradientId} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="rgb(31 169 184)" stopOpacity="0" />
                        <stop offset="0.4" stopColor="rgb(31 169 184)" stopOpacity="0.55" />
                        <stop offset="1" stopColor="rgb(23 62 104)" stopOpacity="0.3" />
                      </linearGradient>
                    </defs>
                    <path
                      className="hero-decor-arc-path"
                      d="M28 26C132 8 196 92 178 190C170 230 146 250 118 256"
                      stroke={`url(#${heroArcGradientId})`}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <circle cx="28" cy="26" r="3" fill="rgb(31 169 184 / 0.7)" />
                    <circle cx="187" cy="128" r="2.5" fill="rgb(23 62 104 / 0.4)" />
                    <circle cx="118" cy="256" r="3" fill="rgb(31 169 184 / 0.5)" />
                  </svg>
                  {/* Glowing network dots */}
                  <span aria-hidden="true" className="hero-decor-node hero-decor-node-1" />
                  <span aria-hidden="true" className="hero-decor-node hero-decor-node-2" />
                  <span aria-hidden="true" className="hero-decor-node hero-decor-node-3" />
                  {user.avatarData ? (
                    <UserAvatar
                      fullName={user.fullName}
                      avatarData={user.avatarData}
                      size="hero"
                      shape="frameless"
                      imageFit="natural"
                      className="hero-portrait-avatar"
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section B: Daily KPI summary + operational action cards */}
        <section id="tour-dashboard-overview" className="space-y-4 print:hidden">
          <div>
            <h2 className="text-xl font-bold text-foreground">{t("dashboard.workSummary")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("dashboard.todayAndMonth")}</p>
          </div>
          {dashboard.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : dashboard.isError || !dashboard.data ? (
            <p className="text-sm text-destructive py-6 text-center">
              {t("dashboard.dashboardLoadError")}
            </p>
          ) : (
            <>
              <KpiCards data={dashboard.data} />
              <ActionLists
                todayAppointments={dashboard.data.todayAppointments}
                overdueFollowups={dashboard.data.overdueFollowups}
              />
            </>
          )}
        </section>

        {/* Section C: filters + Operational report (workspace table) — ABOVE statistics */}
        <section className="space-y-4">
          {/* Print-only report header */}
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold text-brand-navy">غرس | Ghars</h1>
            <p className="text-sm mt-1">نظام إدارة ومتابعة زراعة الأسنان</p>
            <p className="text-sm mt-1">التقرير التشغيلي</p>
            <p className="text-sm text-muted-foreground mt-1">
              الفترة: {reportFilters.from} إلى {reportFilters.to} — تاريخ
              الإنشاء: {formatSaudiDateTime(new Date())}
            </p>
          </div>

          <OperationalTable
            data={report.data}
            isLoading={report.isLoading}
            isError={report.isError}
            isFetching={report.isFetching}
            filters={reportFilters}
            searchValue={operationalSearch}
            onSearchChange={setOperationalSearch}
            filterState={filterState}
            onFilterChange={setFilterState}
            doctorOptions={statistics.data?.doctorOptions ?? []}
            systemOptions={implantOptions?.systems ?? []}
          />
        </section>

        {/* Section D: Statistics and charts — below operational report */}
        <section className="space-y-4 print:hidden">
          <StatisticsSection
            data={statistics.data}
            isLoading={statistics.isLoading}
            isError={statistics.isError}
          />
        </section>
      </div>
    </Shell>
  );
}
