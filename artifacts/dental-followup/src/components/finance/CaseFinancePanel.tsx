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
import { cn } from "@/lib/utils";
import { BaseAmountDialog } from "./BaseAmountDialog";
import { ChargeFormDialog } from "./ChargeFormDialog";
import { PaymentFormDialog } from "./PaymentFormDialog";
import { VoidPaymentDialog } from "./VoidPaymentDialog";
import { InstallmentPlanCard } from "./InstallmentPlanCard";
import { useTranslation } from "react-i18next";

const STATUS_STYLES: Record<PaymentStatus, string> = {
  "لم يدفع": "bg-muted text-muted-foreground",
  "مدفوع جزئيًا": "bg-amber-100 text-amber-800 border-amber-200",
  "مدفوع بالكامل": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "رصيد زائد": "bg-red-100 text-red-800 border-red-200",
  "مؤجل ماليًا": "bg-sky-100 text-sky-800 border-sky-200",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_STYLES[status])}
      data-testid="badge-payment-status"
    >
      {status}
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
          تعذر تحميل الملخص المالي. يرجى المحاولة مرة أخرى.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {!writable ? (
        <Alert>
          <AlertDescription>
            ملف المريض مؤرشف — البيانات المالية للعرض فقط.
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
    { label: "الرسوم الإضافية", value: formatMoney(s.chargesTotal) },
    { label: "الخصومات", value: formatMoney(s.discountsTotal) },
    { label: t("financeForms.finalTotal"), value: formatMoney(s.finalTotal), strong: true },
    { label: "المدفوع", value: formatMoney(s.paidAmount) },
    { label: "المتبقي", value: formatMoney(s.outstanding), strong: true },
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
              تنبيه: المبلغ المدفوع يتجاوز الإجمالي النهائي (رصيد زائد). لن يتم
              تعديل الإجماليات تلقائيًا — راجع الدفعات أو الرسوم.
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
  const [addOpen, setAddOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const voidPayment = data.payments.find((p) => p.id === voidTarget) ?? null;

  return (
    <Card data-testid="card-payments">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">الدفعات</CardTitle>
        {canRecord ? (
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-payment">
            <Plus className="h-4 w-4 ms-1" />
            تسجيل دفعة
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            لا توجد دفعات مسجلة لهذه الحالة.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الوصف</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">طريقة الدفع</TableHead>
                  <TableHead className="text-right">رقم المرجع</TableHead>
                  <TableHead className="text-right">المستخدم</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
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
                      {p.paymentLabel ?? "—"}
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
                    <TableCell>{p.paymentMethod ?? "—"}</TableCell>
                    <TableCell>{p.referenceNumber ?? "—"}</TableCell>
                    <TableCell>{p.createdByName ?? "—"}</TableCell>
                    <TableCell>
                      {p.isVoided ? (
                        <div>
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            ملغاة
                          </Badge>
                          {p.voidReason ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              السبب: {p.voidReason}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          سارية
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
                            إلغاء
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
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const deleteCharge = useDeleteCharge();

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteCharge.mutate(
      { id: deleteTarget, caseId: caseItem.id },
      {
        onSuccess: () => {
          toast({ title: "تم حذف الرسم." });
          setDeleteTarget(null);
        },
        onError: (err) => {
          toast({
            title: "تعذر حذف الرسم",
            description: err instanceof Error ? err.message : undefined,
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
        <CardTitle className="text-base">الرسوم الإضافية</CardTitle>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="button-add-charge">
            <Plus className="h-4 w-4 ms-1" />
            إضافة رسم
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {data.charges.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            لا توجد رسوم إضافية لهذه الحالة.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الوصف</TableHead>
                  <TableHead className="text-right">الزرعة</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  {canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.charges.map((c) => (
                  <TableRow key={c.id} data-testid={`row-charge-${c.id}`}>
                    <TableCell className="whitespace-nowrap">
                      {formatSaudiDate(c.chargeDate)}
                    </TableCell>
                    <TableCell>{c.chargeType}</TableCell>
                    <TableCell>{c.description ?? "—"}</TableCell>
                    <TableCell>{c.implantSite ? `سن ${c.implantSite}` : "—"}</TableCell>
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
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الرسم</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذا الرسم وإعادة احتساب الإجمالي النهائي. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-charge"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
