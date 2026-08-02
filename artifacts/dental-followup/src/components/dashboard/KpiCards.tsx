import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import type { DashboardResponse } from "@workspace/shared";

/**
 * Operational KPI cards, computed live from non-archived records.
 * Financial cards render only when the backend included them (financial-view
 * permission) — the API omits them entirely for unauthorized users.
 */
export function KpiCards({ data }: { data: DashboardResponse }) {
  const k = data.kpis;
  const cards: Array<{ label: string; value: string }> = [
    { label: "المرضى النشطون", value: String(k.activePatients) },
    { label: "حالات الزراعة النشطة", value: String(k.activeCases) },
    { label: "إجمالي الزرعات النشطة", value: String(k.activeImplants) },
    { label: "مواعيد اليوم", value: String(k.todayAppointments) },
    { label: "المتابعات المتأخرة", value: String(k.overdueFollowups) },
    { label: "حالات جاهزة للتركيب", value: String(k.readyCases) },
    {
      label: "الزرعات الفاشلة أو التي تحتاج إعادة",
      value: String(k.failedOrRedoImplants),
    },
    { label: "مهام التواصل المستحقة", value: String(k.contactTasksDue) },
    ...(data.financials
      ? [
          {
            label: "المقبوض هذا الشهر",
            value: formatMoney(data.financials.collectedThisMonth),
          },
          {
            label: "إجمالي المبالغ المتبقية",
            value: formatMoney(data.financials.totalOutstanding),
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.label} data-testid={`kpi-${c.label}`}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1.5 leading-snug">
              {c.label}
            </p>
            <p className="text-lg font-bold tabular-nums notranslate">
              {c.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
