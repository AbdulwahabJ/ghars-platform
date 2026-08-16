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
  ReportFiltersBar,
  type ReportFilterState,
} from "@/components/dashboard/ReportFiltersBar";
import { StatisticsSection } from "@/components/dashboard/StatisticsSection";
import { OperationalTable } from "@/components/dashboard/OperationalTable";
import { reportPeriodRange } from "@/lib/report-periods";
import { todayIso } from "@/lib/money";

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
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
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
          <ReportFiltersBar
            state={filterState}
            onChange={setFilterState}
            doctorOptions={statistics.data?.doctorOptions ?? []}
            systemOptions={implantOptions?.systems ?? []}
          />

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
