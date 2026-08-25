import { useMemo, useState } from "react";
import { Loader2, Lock, Wallet } from "lucide-react";
import type { Patient } from "@workspace/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useImplantCases } from "@/hooks/use-implant-cases";
import { formatSaudiDate } from "@/lib/datetime";
import { CaseFinancePanel } from "./CaseFinancePanel";
import { useTranslation } from "react-i18next";
import { useEnumTranslation } from "@/i18n/use-enum-translation";

interface PaymentsTabProps {
  patient: Patient;
}

export function PaymentsTab({ patient }: PaymentsTabProps) {
  const { user } = useAuth();
  const { t } = useTranslation("operations");
  const { enumLabel } = useEnumTranslation();
  const { data, isLoading, isError } = useImplantCases(patient.id);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const canView = Boolean(user?.canViewFinancials);
  const canRecord = Boolean(user?.canRecordPayments);
  const canManage =
    user?.role === "ADMIN" || (user?.role === "DOCTOR" && canView);

  const cases = useMemo(() => data?.items ?? [], [data]);
  const activeCases = cases.filter((c) => c.status === "active");

  if (!canView && !canRecord) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center min-h-[300px]">
        <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">
          {t("finance.noAccess")}
        </p>
      </div>
    );
  }

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
            {t("financeForms.noFinancialData")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!activeCases.length) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center min-h-[300px]">
        <div className="h-16 w-16 bg-primary/5 rounded-full flex items-center justify-center mb-4 border border-primary/10">
          <Wallet className="h-8 w-8 text-primary" />
        </div>
        <p className="text-muted-foreground">
          {t("financeForms.noActiveCases")}
        </p>
      </div>
    );
  }

  const selectedCase =
    activeCases.find((c) => c.id === selectedCaseId) ?? activeCases[0];

  return (
    <div className="space-y-5">
      {activeCases.length > 1 ? (
        <div className="max-w-sm">
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            {t("financeForms.implantCase")}
          </label>
          <Select
            value={selectedCase.id}
            onValueChange={(v) => setSelectedCaseId(v)}
          >
            <SelectTrigger data-testid="select-finance-case">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeCases.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {enumLabel("caseStatus", c.caseStatus)} — {formatSaudiDate(c.createdAt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <CaseFinancePanel
        key={selectedCase.id}
        patient={patient}
        caseItem={selectedCase}
        canManage={canManage}
        canRecord={canRecord}
      />
    </div>
  );
}
