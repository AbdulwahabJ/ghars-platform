import { useState } from "react";
import { Loader2, Plus, Stethoscope } from "lucide-react";
import type { Patient } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CaseCard } from "./CaseCard";
import { CaseFormDialog } from "./CaseFormDialog";
import { useImplantCases } from "@/hooks/use-implant-cases";
import { useAuth } from "@/hooks/use-auth";

interface ImplantsTabProps {
  patient: Patient;
}

export function ImplantsTab({ patient }: ImplantsTabProps) {
  const { user } = useAuth();
  const { data, isLoading, isError } = useImplantCases(patient.id);
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  const patientArchived = patient.status === "archived";
  const canArchive = user?.role === "ADMIN" || user?.role === "DOCTOR";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            تعذر تحميل حالات الزراعة. يرجى المحاولة مرة أخرى.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const cases = data.items;
  const activeCases = cases.filter((c) => c.status === "active");
  const archivedCases = cases.filter((c) => c.status === "archived");

  return (
    <div className="p-5 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">حالات الزراعة</h2>
          <p className="text-sm text-muted-foreground">
            يمكن تسجيل أكثر من حالة زراعة لنفس المريض.
          </p>
        </div>
        {!patientArchived && (
          <Button className="btn-primary" onClick={() => setNewCaseOpen(true)}>
            <Plus className="h-4 w-4 ml-2" />
            تسجيل حالة زراعة جديدة
          </Button>
        )}
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 bg-muted/30 rounded-2xl border border-dashed border-border">
          <div className="h-16 w-16 bg-primary/5 rounded-full flex items-center justify-center mb-4">
            <Stethoscope className="h-8 w-8 text-primary" />
          </div>
          <p className="font-semibold text-foreground mb-1">
            لا توجد حالات زراعة مسجلة لهذا المريض بعد.
          </p>
          {!patientArchived && (
            <p className="text-sm text-muted-foreground">
              اضغط تسجيل حالة زراعة جديدة للبدء.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {activeCases.map((caseItem) => (
            <CaseCard
              key={caseItem.id}
              caseItem={caseItem}
              patientId={patient.id}
              allCases={cases}
              canArchive={canArchive}
              readOnly={patientArchived}
            />
          ))}
          {archivedCases.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground border-t border-border pt-5">
                الحالات المؤرشفة ({archivedCases.length})
              </h3>
              {archivedCases.map((caseItem) => (
                <CaseCard
                  key={caseItem.id}
                  caseItem={caseItem}
                  patientId={patient.id}
                  allCases={cases}
                  canArchive={canArchive}
                  readOnly={patientArchived}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <CaseFormDialog
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        patientId={patient.id}
        otherCases={cases}
      />
    </div>
  );
}
