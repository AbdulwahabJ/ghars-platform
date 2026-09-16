import React, { useState } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { usePatients } from "@/hooks/use-patients";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, UserX, Loader2, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { NewPatientDialog } from "@/components/patients/NewPatientDialog";
import { formatSaudiDate } from "@/lib/datetime";
import { Patient } from "@workspace/shared";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";

export default function PatientsList() {
  const { t } = useClinicalTranslation();
  const { t: commonT } = useTranslation("common");
  const { direction } = useLocale();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") || "";
  });
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(1);
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  const { data, isLoading, isError, refetch } = usePatients({
    query: debouncedSearch,
    status: statusFilter,
    page,
    pageSize: 15,
  });

  const handleRowClick = (id: string) => {
    setLocation(`/patients/${id}`);
  };

  return (
    <Shell decorated>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("patient.list")}</h1>
            <p className="text-muted-foreground mt-1">{t("patient.manage")}</p>
          </div>
          <Button
            id="tour-new-patient-btn"
            onClick={() => setNewPatientOpen(true)}
            className="btn-primary shrink-0 w-full sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            {t("patient.add")}
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="tour-global-search"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder={t("patient.search")}
              className="ps-4 pe-10 text-start w-full"
            />
          </div>
          
          <div className="flex bg-muted p-1 rounded-xl w-full md:w-auto">
            {(["active", "archived", "all"] as const).map(status => (
              <button
                key={status}
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`flex-1 md:flex-none px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                  statusFilter === status 
                    ? "bg-card text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-black/5"
                }`}
              >
                {status === "active" ? t("patient.active") : status === "archived" ? t("patient.archived") : t("patient.all")}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden min-h-[400px] flex flex-col relative">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p>{t("patient.loading")}</p>
            </div>
          ) : isError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mb-4" />
              <p className="text-foreground font-medium mb-4">
                {commonT("errors.sectionLoadFailed")}
              </p>
              <Button variant="outline" onClick={() => void refetch()}>
                {commonT("actions.retry")}
              </Button>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-6">
                <UserX className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{t("patient.empty")}</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                {searchQuery 
                  ? t("patient.noResults")
                  : t("patient.emptyDescription")}
              </p>
              {!searchQuery && (
                <Button onClick={() => setNewPatientOpen(true)} className="btn-secondary">
                  <Plus className="h-5 w-5" />
                  {t("patient.register")}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                       <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-32">{t("patient.fileNumber")}</th>
                       <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">{t("patient.fullName")}</th>
                       <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-40">{t("patient.mobile")}</th>
                       <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-40">{t("patient.addedAt")}</th>
                       <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-24">{t("patient.status")}</th>
                       <th className="px-2 py-4 w-10"><span className="sr-only">{t("patient.openFile")}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((patient: Patient) => (
                      <tr 
                        key={patient.id} 
                        onClick={() => handleRowClick(patient.id)}
                        className="hover:bg-muted/50 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-4 font-mono text-sm text-muted-foreground" dir="ltr">{patient.fileNumber}</td>
                        <td className="px-6 py-4 font-medium text-foreground group-hover:text-primary transition-colors">
                          {patient.fullName}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground" dir="ltr">{patient.mobileNumber || "-"}</td>
                        <td className="px-6 py-4 text-muted-foreground text-sm">{formatSaudiDate(patient.createdAt)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            patient.status === 'active' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-slate-100 text-slate-800'
                          }`}>
                             {patient.status === 'active' ? t("patient.active") : t("patient.archived")}
                          </span>
                        </td>
                        <td className="px-2 py-4 text-end">
                          {direction === "rtl" ? <ChevronLeft className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" /> : <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {data.total > data.pageSize && (
                <div className="border-t border-border p-4 flex items-center justify-between mt-auto">
                  <div className="text-sm text-muted-foreground">
                     {t("patient.totalResults", { count: data.total })}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="gap-1 h-9 px-3"
                    >
                      {direction === "rtl" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                       {t("patient.previous")}
                    </Button>
                    <div className="flex items-center justify-center px-4 font-medium text-sm">
                      {page} / {Math.ceil(data.total / data.pageSize)}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= Math.ceil(data.total / data.pageSize)}
                      className="gap-1 h-9 px-3"
                    >
                       {t("patient.next")}
                       {direction === "rtl" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <NewPatientDialog open={newPatientOpen} onOpenChange={setNewPatientOpen} />
    </Shell>
  );
}
