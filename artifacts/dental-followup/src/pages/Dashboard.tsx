import React, { useState, useEffect, useMemo, useRef } from "react";
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

function DashboardDecorations() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0 z-0 h-full w-screen -translate-x-1/2 overflow-hidden print:hidden"
    >
      <div className="absolute left-[-10rem] top-[8rem] hidden h-[34rem] w-[34rem] rounded-full bg-cyan-300/20 blur-3xl md:block" />
      <div className="absolute right-[-11rem] top-[24rem] hidden h-[38rem] w-[38rem] rounded-full bg-blue-300/15 blur-3xl md:block" />

      <svg
        className="absolute left-[-10rem] top-[7rem] hidden h-[34rem] w-[34rem] opacity-90 md:block"
        viewBox="0 0 560 620"
        fill="none"
      >
        <defs>
          <linearGradient id="dashboard-left-orbit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f766e" stopOpacity="0.05" />
            <stop offset="0.5" stopColor="#1fa9b8" stopOpacity="0.34" />
            <stop offset="1" stopColor="#172b62" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <ellipse
          cx="245"
          cy="300"
          rx="230"
          ry="150"
          transform="rotate(-28 245 300)"
          stroke="url(#dashboard-left-orbit)"
          strokeWidth="2"
        />
        <ellipse
          cx="245"
          cy="300"
          rx="180"
          ry="112"
          transform="rotate(34 245 300)"
          stroke="#1fa9b8"
          strokeOpacity="0.2"
          strokeWidth="1.5"
        />
        <path
          d="M-18 470C80 390 120 262 218 224C303 190 357 248 446 190C491 161 526 113 575 42"
          stroke="#173e68"
          strokeOpacity="0.2"
          strokeWidth="1.5"
        />
        <path
          d="M-24 180C94 237 148 147 241 125C331 104 382 175 461 250C505 291 535 332 578 348"
          stroke="#1fa9b8"
          strokeOpacity="0.26"
          strokeWidth="1.5"
        />
        <path d="M56 390L176 308L292 344L415 254" stroke="#1fa9b8" strokeOpacity="0.18" />
        <path d="M176 308L218 224L331 175L415 254" stroke="#173e68" strokeOpacity="0.14" />
        <g fill="#1fa9b8">
          <circle cx="56" cy="390" r="5" fillOpacity="0.42" />
          <circle cx="176" cy="308" r="6" fillOpacity="0.56" />
          <circle cx="292" cy="344" r="4" fillOpacity="0.34" />
          <circle cx="415" cy="254" r="7" fillOpacity="0.48" />
          <circle cx="218" cy="224" r="4" fillOpacity="0.36" />
        </g>
        <g fill="#173e68">
          <circle cx="331" cy="175" r="4" fillOpacity="0.28" />
          <circle cx="461" cy="250" r="3" fillOpacity="0.3" />
        </g>
      </svg>

      <svg
        className="absolute right-[-11rem] top-[22rem] hidden h-[38rem] w-[38rem] opacity-90 md:block"
        viewBox="0 0 620 680"
        fill="none"
      >
        <defs>
          <radialGradient id="dashboard-right-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#1fa9b8" stopOpacity="0.18" />
            <stop offset="1" stopColor="#1fa9b8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="340" cy="310" r="180" fill="url(#dashboard-right-glow)" />
        <circle
          cx="350"
          cy="310"
          r="238"
          stroke="#173e68"
          strokeOpacity="0.18"
          strokeWidth="2"
          strokeDasharray="18 15"
        />
        <ellipse
          cx="350"
          cy="310"
          rx="238"
          ry="120"
          transform="rotate(-38 350 310)"
          stroke="#1fa9b8"
          strokeOpacity="0.3"
          strokeWidth="2"
        />
        <ellipse
          cx="350"
          cy="310"
          rx="178"
          ry="92"
          transform="rotate(42 350 310)"
          stroke="#0f766e"
          strokeOpacity="0.22"
          strokeWidth="1.5"
        />
        <path d="M110 460L240 384L358 430L488 319L581 260" stroke="#1fa9b8" strokeOpacity="0.22" />
        <path d="M240 384L286 236L410 192L488 319" stroke="#173e68" strokeOpacity="0.16" />
        <path d="M286 236L190 164M410 192L521 126M358 430L410 528" stroke="#1fa9b8" strokeOpacity="0.16" />
        <g fill="#1fa9b8">
          <circle cx="110" cy="460" r="5" fillOpacity="0.38" />
          <circle cx="240" cy="384" r="7" fillOpacity="0.55" />
          <circle cx="358" cy="430" r="4" fillOpacity="0.34" />
          <circle cx="488" cy="319" r="6" fillOpacity="0.5" />
          <circle cx="581" cy="260" r="4" fillOpacity="0.35" />
        </g>
        <g fill="#173e68">
          <circle cx="286" cy="236" r="5" fillOpacity="0.3" />
          <circle cx="410" cy="192" r="4" fillOpacity="0.32" />
          <circle cx="521" cy="126" r="3" fillOpacity="0.28" />
        </g>
      </svg>

      <div className="absolute left-4 top-[15rem] h-16 w-16 rounded-full border border-cyan-500/20 md:hidden" />
      <div className="absolute right-4 top-[32rem] h-20 w-20 rounded-full border border-blue-500/15 md:hidden" />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const greeting = saudiGreeting();
  const todayDate = formatSaudiWeekdayDate(new Date());

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
    <Shell>
      <div className="relative isolate">
        <DashboardDecorations />
        <div className="relative z-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Section A: Greeting & Search */}
        <section className="bg-primary/5 rounded-3xl p-8 md:p-12 relative border border-primary/10 print:hidden">
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-bl-full" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {greeting}، {user?.fullName}
              </h1>
              <p className="text-muted-foreground text-lg">{todayDate}</p>
            </div>
          </div>

          <div className="mt-10 max-w-3xl relative z-20" id="tour-global-search" ref={searchContainerRef}>
            <div className="relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                placeholder="ابحث عن مريض بالاسم، رقم الملف، أو رقم الجوال..." 
                className="h-14 pl-4 pr-12 text-lg rounded-2xl border-border bg-card shadow-sm focus-visible:ring-primary focus-visible:border-primary"
              />
              {isSearching && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
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
                        className={`w-full text-right px-4 py-3 transition-colors flex items-center justify-between gap-3 border-b border-border/50 last:border-0 ${
                          index === highlightIndex ? "bg-muted" : "hover:bg-muted"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate">{patient.fullName}</p>
                          <p className="text-sm text-muted-foreground mt-1" dir="ltr">{patient.fileNumber}</p>
                        </div>
                        {patient.status === 'archived' && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md shrink-0">مؤرشف</span>
                        )}
                      </button>
                    ))}
                    {searchResults.total > 5 && (
                      <button 
                        onClick={() => setLocation(`/patients?q=${encodeURIComponent(debouncedSearch)}`)}
                        className="w-full text-center py-3 text-sm text-primary font-medium hover:bg-primary/5 transition-colors"
                      >
                        عرض جميع النتائج ({searchResults.total})
                      </button>
                    )}
                  </div>
                ) : debouncedSearch.length > 0 && !isSearching ? (
                  <div className="py-8 text-center text-muted-foreground">
                    لا توجد نتائج مطابقة لـ "{debouncedSearch}"
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {/* Section B: Daily KPI summary + operational action cards */}
        <section id="tour-dashboard-overview" className="space-y-4 print:hidden">
          <h2 className="text-xl font-bold text-foreground">ملخص العمل اليومي</h2>
          {dashboard.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : dashboard.isError || !dashboard.data ? (
            <p className="text-sm text-destructive py-6 text-center">
              تعذر تحميل بيانات لوحة المتابعة. حاول تحديث الصفحة.
            </p>
          ) : (
            <>
              <KpiCards data={dashboard.data} />
              <ActionLists
                todayAppointments={dashboard.data.todayAppointments}
                overdueFollowups={dashboard.data.overdueFollowups}
                readyCases={dashboard.data.readyCases}
                contactTasks={dashboard.data.contactTasks}
              />
            </>
          )}
        </section>

        {/* Section C: filters + Operational report (workspace table) — ABOVE statistics */}
        <section className="space-y-4">
          {/* Print-only report header */}
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold">مجمع السن الرقمي الطبي</h1>
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
      </div>
    </Shell>
  );
}
