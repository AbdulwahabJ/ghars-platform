import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  CaseFinanceResponse,
  ImplantCaseWithImplants,
  Patient,
  PaymentStatus,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCaseFinance, useDeleteCharge } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { localizeErrorMessage } from "@/lib/localize-error";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useEnumTranslation } from "@/i18n/use-enum-translation";
import { BaseAmountDialog } from "./BaseAmountDialog";
import { ChargeFormDialog } from "./ChargeFormDialog";
import { PaymentFormDialog } from "./PaymentFormDialog";
import { VoidPaymentDialog } from "./VoidPaymentDialog";
import { InstallmentPlanCard } from "./InstallmentPlanCard";

const STATUS_STYLES: Record<PaymentStatus, string> = {
  "لم يدفع": "bg-muted text-muted-foreground",
  "مدفوع جزئيًا": "bg-amber-100 text-amber-800 border-amber-200",
  "مدفوع بالكامل": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "رصيد زائد": "bg-red-100 text-red-800 border-red-200",
  "مؤجل ماليًا": "bg-sky-100 text-sky-800 border-sky-200",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { enumLabel } = useEnumTranslation();
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_STYLES[status])}
      data-testid="badge-payment-status"
    >
      {enumLabel("paymentStatus", status)}
    </Badge>
  );
}
interface CaseFinancePanelProps {
  patient: Patient;
  caseItem: ImplantCaseWithImplants;
  canManage: boolean;
  canRecord: boolean;
}

export function CaseFinancePanel({
  patient,
  caseItem,
  canManage,
  canRecord,
}: CaseFinancePanelProps) {
  const { t } = useTranslation("operations");
  const { data, isLoading, isError } = useCaseFinance(caseItem.id);
  const writable = patient.status !== "archived";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t("financeForms.summaryLoadError")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {!writable ? (
        <Alert>
          <AlertDescription>
            {t("financeForms.archivedReadOnly")}
          </AlertDescription>
        </Alert>
      ) : null}
      <SummaryCard data={data} caseItem={caseItem} canManage={canManage && writable} />
      <InstallmentPlanCard
        data={data}
        caseId={caseItem.id}
        canManage={canManage && writable}
        canRecord={canRecord && writable}
      />
      <PaymentsSection
        data={data}
        caseItem={caseItem}
        canRecord={canRecord && writable}
        canManage={canManage && writable}
      />
      <ChargesSection data={data} caseItem={caseItem} canManage={canManage && writable} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SummaryCard({
  data,
  caseItem,
  canManage,
}: {
  data: CaseFinanceResponse;
  caseItem: ImplantCaseWithImplants;
  canManage: boolean;
}) {
  const { t } = useTranslation("operations");
  const [baseOpen, setBaseOpen] = useState(false);
  const s = data.summary;

  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: t("financeForms.baseTreatment"), value: formatMoney(s.baseTreatmentAmount) },
    { label: t("financeForms.additionalCharges"), value: formatMoney(s.chargesTotal) },
    { label: t("financeForms.discounts"), value: formatMoney(s.discountsTotal) },
    { label: t("financeForms.finalTotal"), value: formatMoney(s.finalTotal), strong: true },
    { label: t("financeForms.summaryPaid"), value: formatMoney(s.paidAmount) },
    { label: t("financeForms.outstanding"), value: formatMoney(s.outstanding), strong: true },
  ];

  return (
    <Card data-testid="card-finance-summary">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{t("financeForms.summary")}</CardTitle>
        <div className="flex items-center gap-2">
          <PaymentStatusBadge status={s.paymentStatus} />
          {canManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBaseOpen(true)}
              data-testid="button-edit-base-amount"
            >
              <Pencil className="h-4 w-4 ms-1" />
               {t("financeForms.baseTreatment")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {s.isOverpaid ? (
          <Alert variant="destructive" data-testid="alert-overpaid">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("financeForms.overpaidWarning")}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {rows.map((r) => (
            <div
              key={r.label}
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <p className="text-xs text-muted-foreground mb-1">{r.label}</p>
              <p
                className={cn(
                  "text-sm tabular-nums",
                  r.strong ? "font-bold text-foreground" : "font-medium",
                )}
              >
                {r.value}
              </p>
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-muted-foreground">{t("financeForms.paymentRate")}</p>
            <p className="text-xs font-medium tabular-nums">
              {s.paymentPercent == null ? "—" : `${s.paymentPercent}%`}
            </p>
          </div>
          <Progress
            value={s.paymentPercent == null ? 0 : Math.min(s.paymentPercent, 100)}
            className="h-2"
          />
        </div>
      </CardContent>
      <BaseAmountDialog
        open={baseOpen}
        onOpenChange={setBaseOpen}
        caseId={caseItem.id}
        current={s.baseTreatmentAmount}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function PaymentsSection({
  data,
  caseItem,
  canRecord,
  canManage,
}: {
  data: CaseFinanceResponse;
  caseItem: ImplantCaseWithImplants;
  canRecord: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation("operations");
  const { enumLabel } = useEnumTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const voidPayment = data.payments.find((p) => p.id === voidTarget) ?? null;

  return (
    <Card data-testid="card-payments">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{t("financeForms.payments")}</CardTitle>
        {canRecord ? (
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-payment">
            <Plus className="h-4 w-4 ms-1" />
            {t("financeForms.recordPayment")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("financeForms.noPayments")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("financeForms.date")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.description")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.amount")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.method")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.referenceNumber")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.user")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.status")}</TableHead>
                  {canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <TableRow
                    key={p.id}
                    className={cn(p.isVoided && "opacity-60")}
                    data-testid={`row-payment-${p.id}`}
                  >
                    <TableCell className="whitespace-nowrap">
                      {formatSaudiDate(p.paymentDate)}
                    </TableCell>
                    <TableCell>
                      {p.paymentLabel ? enumLabel("paymentLabel", p.paymentLabel) : "—"}
                      {p.note ? (
                        <p className="text-xs text-muted-foreground mt-0.5">{p.note}</p>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums whitespace-nowrap",
                        p.isVoided && "line-through",
                      )}
                    >
                      {formatMoney(p.amount)}
                    </TableCell>
                    <TableCell>{p.paymentMethod ? enumLabel("paymentMethod", p.paymentMethod) : "—"}</TableCell>
                    <TableCell>{p.referenceNumber ?? "—"}</TableCell>
                    <TableCell>{p.createdByName ?? "—"}</TableCell>
                    <TableCell>
                      {p.isVoided ? (
                        <div>
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            {t("financeForms.voided")}
                          </Badge>
                          {p.voidReason ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("financeForms.reason")}: {p.voidReason}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {t("financeForms.active")}
                        </Badge>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        {!p.isVoided ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setVoidTarget(p.id)}
                            data-testid={`button-void-payment-${p.id}`}
                          >
                            <Ban className="h-4 w-4 ms-1" />
                            {t("financeForms.cancel")}
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <PaymentFormDialog open={addOpen} onOpenChange={setAddOpen} caseId={caseItem.id} />
      <VoidPaymentDialog
        open={Boolean(voidTarget)}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null);
        }}
        caseId={caseItem.id}
        payment={voidPayment}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ChargesSection({
  data,
  caseItem,
  canManage,
}: {
  data: CaseFinanceResponse;
  caseItem: ImplantCaseWithImplants;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const { t } = useTranslation("operations");
  const { enumLabel } = useEnumTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const deleteCharge = useDeleteCharge();

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteCharge.mutate(
      { id: deleteTarget, caseId: caseItem.id },
      {
        onSuccess: () => {
          toast({ title: t("financeForms.chargeDeleted") });
          setDeleteTarget(null);
        },
        onError: (err) => {
          toast({
            title: t("financeForms.chargeDeleteFailed"),
            description: localizeErrorMessage(err),
            variant: "destructive",
          });
          setDeleteTarget(null);
        },
      },
    );
  };

  return (
    <Card data-testid="card-charges">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{t("financeForms.additionalCharges")}</CardTitle>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="button-add-charge">
            <Plus className="h-4 w-4 ms-1" />
            {t("financeForms.addCharge")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {data.charges.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("financeForms.noCharges")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("financeForms.date")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.chargeType")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.description")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.implant")}</TableHead>
                  <TableHead className="text-start">{t("financeForms.amount")}</TableHead>
                  {canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.charges.map((c) => (
                  <TableRow key={c.id} data-testid={`row-charge-${c.id}`}>
                    <TableCell className="whitespace-nowrap">
                      {formatSaudiDate(c.chargeDate)}
                    </TableCell>
                    <TableCell>{enumLabel("chargeType", c.chargeType)}</TableCell>
                    <TableCell>{c.description ?? "—"}</TableCell>
                    <TableCell>{c.implantSite ? t("financeForms.implantTooth", { site: c.implantSite }) : "—"}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatMoney(c.amount)}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-8 w-8"
                          onClick={() => setDeleteTarget(c.id)}
                          data-testid={`button-delete-charge-${c.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <ChargeFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        caseItem={caseItem}
      />
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="text-start">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("financeForms.deleteChargeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("financeForms.deleteChargeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t("financeForms.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-charge"
            >
              {t("financeForms.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
