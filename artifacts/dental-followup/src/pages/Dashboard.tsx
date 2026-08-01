import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { saudiGreeting, formatSaudiWeekdayDate } from "@/lib/datetime";
import { useAuth } from "@/hooks/use-auth";
import { Shell } from "@/components/layout/Shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Loader2, Info } from "lucide-react";
import { usePatients } from "@/hooks/use-patients";
import { NewPatientDialog } from "@/components/patients/NewPatientDialog";
import { useDebounce } from "@/hooks/use-debounce";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const greeting = saudiGreeting();
  const todayDate = formatSaudiWeekdayDate(new Date());

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  const { data: searchResults, isLoading: isSearching } = usePatients({ 
    query: debouncedSearch,
    pageSize: 5
  });

  useEffect(() => {
    setIsSearchOpen(debouncedSearch.length > 0);
  }, [debouncedSearch]);

  const handlePatientSelect = (id: string) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setLocation(`/patients/${id}`);
  };

  return (
    <Shell>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Section A: Greeting & Search */}
        <section className="bg-primary/5 rounded-3xl p-8 md:p-12 relative overflow-hidden border border-primary/10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-bl-full pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {greeting}، {user?.fullName}
              </h1>
              <p className="text-muted-foreground text-lg">{todayDate}</p>
            </div>
            
            <Button 
              onClick={() => setNewPatientOpen(true)}
              className="btn-primary shrink-0 shadow-sm"
              id="tour-new-patient-btn"
            >
              <Plus className="h-5 w-5" />
              تسجيل حالة زراعة جديدة
            </Button>
          </div>

          <div className="mt-10 max-w-3xl relative" id="tour-global-search">
            <div className="relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
              <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                {searchResults?.items && searchResults.items.length > 0 ? (
                  <div className="py-2">
                    {searchResults.items.map((patient: any) => (
                      <button
                        key={patient.id}
                        onClick={() => handlePatientSelect(patient.id)}
                        className="w-full text-right px-4 py-3 hover:bg-muted transition-colors flex items-center justify-between border-b border-border/50 last:border-0"
                      >
                        <div>
                          <p className="font-semibold text-foreground">{patient.fullName}</p>
                          <p className="text-sm text-muted-foreground mt-1" dir="ltr">{patient.fileNumber}</p>
                        </div>
                        {patient.status === 'archived' && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">مؤرشف</span>
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

        {/* Section B: Placeholder for Phase 2 Cards */}
        <section id="tour-dashboard-overview" className="bg-card rounded-3xl p-8 border border-border shadow-sm flex flex-col items-center justify-center min-h-[300px] text-center">
          <div className="h-16 w-16 bg-light-blue rounded-full flex items-center justify-center mb-6">
            <Info className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-3">ملخص العمل اليومي</h2>
          <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
            سيتم تفعيل لوحة الإحصائيات التشغيلية والمالية (مثل المواعيد، المتابعات، والحالات المتأخرة) في مرحلة قادمة.
            <br />
            يمكنك حالياً البدء بتسجيل المرضى وإدارة ملفاتهم.
          </p>
        </section>
      </div>

      <NewPatientDialog open={newPatientOpen} onOpenChange={setNewPatientOpen} />
    </Shell>
  );
}
