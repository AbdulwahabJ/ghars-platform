import React, { useState } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { usePatients } from "@/hooks/use-patients";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, UserX, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { NewPatientDialog } from "@/components/patients/NewPatientDialog";
import { formatSaudiDate } from "@/lib/datetime";

export default function PatientsList() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") || "";
  });
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(1);
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  const { data, isLoading } = usePatients({
    query: debouncedSearch,
    status: statusFilter,
    page,
    pageSize: 15,
  });

  const handleRowClick = (id: string) => {
    setLocation(`/patients/${id}`);
  };

  return (
    <Shell>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">قائمة المرضى</h1>
            <p className="text-muted-foreground mt-1">إدارة ملفات مرضى زراعة الأسنان</p>
          </div>
          <Button onClick={() => setNewPatientOpen(true)} className="btn-primary shrink-0 w-full sm:w-auto">
            <Plus className="h-5 w-5" />
            إضافة مريض جديد
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="بحث بالاسم، رقم الملف، أو الجوال..." 
              className="pl-4 pr-10 text-right w-full"
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
                {status === "active" ? "نشط" : status === "archived" ? "مؤرشف" : "الكل"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden min-h-[400px] flex flex-col relative">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p>جاري تحميل البيانات...</p>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-6">
                <UserX className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">لا يوجد مرضى</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                {searchQuery 
                  ? "لم يتم العثور على نتائج تطابق بحثك. جرب استخدام كلمات بحث مختلفة."
                  : "لم يتم تسجيل أي مرضى في هذه القائمة بعد. يمكنك البدء بإضافة مريض جديد."}
              </p>
              {!searchQuery && (
                <Button onClick={() => setNewPatientOpen(true)} className="btn-secondary">
                  <Plus className="h-5 w-5" />
                  تسجيل مريض
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-32">رقم الملف</th>
                      <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">اسم المريض</th>
                      <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-40">رقم الجوال</th>
                      <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-40">تاريخ الإضافة</th>
                      <th className="px-6 py-4 text-sm font-semibold text-muted-foreground w-24">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((patient: any) => (
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
                            {patient.status === 'active' ? 'نشط' : 'مؤرشف'}
                          </span>
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
                    إجمالي النتائج: <span className="font-bold text-foreground">{data.total}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="gap-1 h-9 px-3"
                    >
                      <ChevronRight className="h-4 w-4" />
                      السابق
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
                      التالي
                      <ChevronLeft className="h-4 w-4" />
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
