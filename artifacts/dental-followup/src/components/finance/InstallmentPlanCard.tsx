import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, ChevronDown, ChevronUp, Pencil, Plus, Save } from "lucide-react";
import {
  PAYMENT_METHODS,
  addCalendarMonths,
  splitInstallmentAmount,
  type CaseFinanceResponse,
  type PaymentInput,
} from "@workspace/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import { useCreatePayment, useSaveInstallmentPlan } from "@/hooks/use-finance";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { formatMoney, todayIso } from "@/lib/money";
import { PaymentFormDialog } from "./PaymentFormDialog";

const STATUS_STYLES = {
  "مدفوع": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "مدفوع جزئيًا": "bg-amber-100 text-amber-800 border-amber-200",
  "مستحق اليوم": "bg-sky-100 text-sky-800 border-sky-200",
  "متأخر": "bg-red-100 text-red-800 border-red-200",
  "مجدول": "bg-muted text-muted-foreground",
} as const;

export function InstallmentPlanCard({
  data,
  caseId,
  canManage,
  canRecord,
}: {
  data: CaseFinanceResponse;
  caseId: string;
  canManage: boolean;
  canRecord: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generalPaymentOpen, setGeneralPaymentOpen] = useState(false);
  const plan = data.installmentPlan;

  return (
    <Card data-testid="card-installment-plan">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">خطة التقسيط</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            الخطة للمتابعة فقط؛ التحصيل يعتمد على الدفعات الفعلية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canRecord ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGeneralPaymentOpen(true)}
              data-testid="button-add-general-payment"
            >
              <Plus className="ms-1 h-4 w-4" />
              دفعة عامة
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant={plan ? "outline" : "default"}
              onClick={() => setEditing((value) => !value)}
              data-testid="button-toggle-installment-plan"
            >
              {plan ? <Pencil className="ms-1 h-4 w-4" /> : <Plus className="ms-1 h-4 w-4" />}
              {plan ? "تعديل الخطة" : "إنشاء خطة"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <PlanEditor
            caseId={caseId}
            data={data}
            onComplete={() => setEditing(false)}
          />
        ) : null}

        {!plan && !editing ? (
          <div className="rounded-lg border border-dashed p-5 text-center">
            <CalendarClock className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">لا توجد خطة تقسيط حالية.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              أنشئ جدول الاستحقاقات دون تغيير إجمالي الحالة أو المدفوع.
            </p>
          </div>
        ) : null}

        {plan ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="المبلغ المجدول" value={formatMoney(plan.totalAmount)} />
              <Metric label="عدد الأقساط" value={String(plan.installmentCount)} />
              <Metric label="أول استحقاق" value={formatSaudiDate(plan.firstDueDate)} />
              <Metric
                label="المسدد من الخطة"
                value={formatMoney(
                  plan.installments.reduce((sum, installment) => sum + installment.paidAmount, 0),
                )}
              />
            </div>
            <div className="divide-y rounded-lg border">
              {plan.installments.map((installment) => (
                <InstallmentRow
                  key={installment.id}
                  installment={installment}
                  caseId={caseId}
                  canRecord={canRecord}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="border-t pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium"
            onClick={() => setHistoryOpen((value) => !value)}
            data-testid="button-toggle-payment-history"
          >
            <span>سجل الدفعات ({data.payments.length})</span>
            {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {historyOpen ? (
            <div className="mt-3 space-y-2">
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد دفعات مسجلة.</p>
              ) : (
                data.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className={payment.isVoided ? "line-through text-muted-foreground" : ""}>
                        {formatMoney(payment.amount)}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">—</span>
                      <span>{formatSaudiDate(payment.paymentDate)}</span>
                      {payment.installmentId ? (
                        <Badge variant="outline" className="ms-2 text-xs">مرتبطة بقسط</Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {payment.isVoided ? "ملغاة" : payment.paymentMethod ?? "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
      <PaymentFormDialog
        open={generalPaymentOpen}
        onOpenChange={setGeneralPaymentOpen}
        caseId={caseId}
      />
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/45 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PlanEditor({
  caseId,
  data,
  onComplete,
}: {
  caseId: string;
  data: CaseFinanceResponse;
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const savePlan = useSaveInstallmentPlan();
  const current = data.installmentPlan;
  const [totalAmount, setTotalAmount] = useState("");
  const [count, setCount] = useState("3");
  const [firstDueDate, setFirstDueDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTotalAmount(String(current?.totalAmount ?? data.summary.finalTotal ?? ""));
    setCount(String(current?.installmentCount ?? 3));
    setFirstDueDate(current?.firstDueDate ?? todayIso());
  }, [current, data.summary.finalTotal]);

  const preview = useMemo(() => {
    const amount = Number(totalAmount);
    const installmentCount = Number(count);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 60) {
      return [];
    }
    return splitInstallmentAmount(amount, installmentCount).map((value, index) => ({
      value,
      date: addCalendarMonths(firstDueDate, index),
    }));
  }, [totalAmount, count, firstDueDate]);

  const submit = () => {
    const amount = Number(totalAmount);
    const installmentCount = Number(count);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل مبلغًا مجدولًا أكبر من صفر.");
      return;
    }
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 60) {
      setError("عدد الأقساط يجب أن يكون بين 1 و60.");
      return;
    }
    if (amount > data.summary.finalTotal) {
      setError("المبلغ المجدول لا يمكن أن يتجاوز الإجمالي النهائي للحالة.");
      return;
    }
    savePlan.mutate(
      {
        caseId,
        data: {
          totalAmount: Math.round(amount * 100) / 100,
          installmentCount,
          firstDueDate,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "تم حفظ خطة التقسيط." });
          onComplete();
        },
        onError: (err) => {
          toast({
            title: "تعذر حفظ خطة التقسيط",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3" data-testid="installment-plan-editor">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="installment-total">المبلغ المجدول (ر.س)</Label>
          <Input id="installment-total" type="number" min={0.01} step="0.01" value={totalAmount} onChange={(event) => { setTotalAmount(event.target.value); setError(null); }} data-testid="input-installment-total" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="installment-count">عدد الأقساط</Label>
          <Input id="installment-count" type="number" min={1} max={60} step={1} value={count} onChange={(event) => { setCount(event.target.value); setError(null); }} data-testid="input-installment-count" />
        </div>
        <div className="space-y-1.5">
          <Label>أول تاريخ استحقاق</Label>
          <OperationalDatePicker value={firstDueDate} onChange={setFirstDueDate} data-testid="input-installment-first-date" />
        </div>
      </div>
      {preview.length ? (
        <div className="rounded-md border bg-background px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">معاينة الجدول قبل الحفظ</p>
          <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((item, index) => (
              <div key={`${item.date}-${index}`} className="flex justify-between rounded bg-muted/45 px-2 py-1.5">
                <span>قسط {index + 1} — {formatSaudiDate(item.date)}</span>
                <strong className="tabular-nums">{formatMoney(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={!preview.length || savePlan.isPending} data-testid="button-save-installment-plan">
          {savePlan.isPending ? <CalendarClock className="ms-1 h-4 w-4 animate-spin" /> : <Save className="ms-1 h-4 w-4" />}
          حفظ الخطة
        </Button>
        <Button size="sm" variant="outline" onClick={onComplete}>إلغاء</Button>
      </div>
    </div>
  );
}

function InstallmentRow({
  installment,
  caseId,
  canRecord,
}: {
  installment: NonNullable<CaseFinanceResponse["installmentPlan"]>["installments"][number];
  caseId: string;
  canRecord: boolean;
}) {
  const { toast } = useToast();
  const createPayment = useCreatePayment();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("شبكة");
  const [error, setError] = useState<string | null>(null);
  const isPaid = installment.outstanding <= 0;

  const openPayment = () => {
    setAmount(String(Math.max(0, installment.outstanding)));
    setPaymentDate(todayIso());
    setError(null);
    setPaying(true);
  };
  const submitPayment = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > installment.outstanding) {
      setError("أدخل مبلغًا لا يتجاوز المتبقي من القسط.");
      return;
    }
    const data: PaymentInput = {
      amount: Math.round(value * 100) / 100,
      paymentDate,
      paymentLabel: "دفعة إضافية",
      paymentMethod,
      referenceNumber: null,
      note: `قسط رقم ${installment.sequence}`,
      installmentId: installment.id,
    };
    createPayment.mutate(
      { caseId, data },
      {
        onSuccess: () => {
          toast({ title: "تم تسجيل دفعة القسط." });
          setPaying(false);
        },
        onError: (err) => {
          toast({
            title: "تعذر تسجيل دفعة القسط",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="p-3" data-testid={`row-installment-${installment.id}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{installment.sequence}</span>
          <div>
            <p className="text-sm font-medium">استحقاق {formatSaudiDate(installment.dueDate)}</p>
            <p className="text-xs text-muted-foreground">
              مجدول: <span className="tabular-nums">{formatMoney(installment.amount)}</span>
              {" — "}مسدد: <span className="tabular-nums">{formatMoney(installment.paidAmount)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_STYLES[installment.status]}>{installment.status}</Badge>
          {!isPaid && canRecord ? (
            <Button size="sm" variant="outline" onClick={openPayment} data-testid={`button-pay-installment-${installment.id}`}>
              <Plus className="ms-1 h-3.5 w-3.5" />
              تسجيل دفعة
            </Button>
          ) : isPaid ? <Check className="h-4 w-4 text-emerald-600" /> : null}
        </div>
      </div>
      {paying ? (
        <div className="mt-3 grid items-end gap-2 rounded-md bg-muted/40 p-2.5 sm:grid-cols-4">
          <div className="space-y-1"><Label className="text-xs">المبلغ</Label><Input type="number" min={0.01} max={installment.outstanding} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null); }} data-testid={`input-installment-payment-${installment.id}`} /></div>
          <div className="space-y-1"><Label className="text-xs">التاريخ</Label><OperationalDatePicker value={paymentDate} onChange={setPaymentDate} /></div>
          <div className="space-y-1"><Label className="text-xs">الطريقة</Label><Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as (typeof PAYMENT_METHODS)[number])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex gap-2"><Button size="sm" onClick={submitPayment} disabled={createPayment.isPending}>{createPayment.isPending ? <CalendarClock className="h-4 w-4 animate-spin" /> : "حفظ"}</Button><Button size="sm" variant="ghost" onClick={() => setPaying(false)}>إلغاء</Button></div>
          {error ? <p className="text-xs text-destructive sm:col-span-4">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}