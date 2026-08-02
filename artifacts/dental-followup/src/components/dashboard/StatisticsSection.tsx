import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatisticsResponse } from "@workspace/shared";

const CHART_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#64748b", "#ef4444"];

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      لا توجد بيانات خلال الفترة المحددة.
    </div>
  );
}

/**
 * Filtered clinical statistics: at most three charts (spec limit), with the
 * remaining distributions rendered as compact count tiles.
 */
export function StatisticsSection({
  data,
  isLoading,
  isError,
}: {
  data: StatisticsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive py-6 text-center">
        تعذر تحميل الإحصائيات. حاول تحديث الصفحة.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card data-testid="chart-over-time">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              الحالات والزرعات عبر الزمن (
              {data.overTimeGrouping === "day" ? "يومي" : "شهري"})
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]" dir="ltr">
            {data.overTime.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.overTime}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cases" name="حالات" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="implants" name="زرعات" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card data-testid="chart-implant-systems">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">توزيع أنظمة الزرعات</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]" dir="ltr">
            {data.implantSystems.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.implantSystems}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    label={(entry) => entry.name}
                  >
                    {data.implantSystems.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card data-testid="chart-case-statuses">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">توزيع حالات الحالات</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]" dir="ltr">
            {data.caseStatuses.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.caseStatuses} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={110}
                    orientation="right"
                  />
                  <Tooltip />
                  <Bar dataKey="count" name="عدد" fill="#8b5cf6" radius={[4, 0, 0, 4]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Non-chart tiles: implant statuses, follow-up outcomes, failure counts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="tile-implant-statuses">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">توزيع حالات الزرعات</CardTitle>
          </CardHeader>
          <CardContent>
            {data.implantStatuses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد زرعات خلال الفترة المحددة.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.implantStatuses.map((s) => (
                  <li key={s.name} className="flex justify-between text-sm">
                    <span className="notranslate">{s.name}</span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card data-testid="tile-followup-outcomes">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">نتائج المتابعات</CardTitle>
          </CardHeader>
          <CardContent>
            {data.followupOutcomes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد نتائج متابعات خلال الفترة المحددة.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.followupOutcomes.map((s) => (
                  <li key={s.name} className="flex justify-between text-sm">
                    <span className="notranslate">{s.name}</span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card data-testid="tile-failure-counts">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الفشل وإعادة الزراعة</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between">
                <span>زرعات فاشلة</span>
                <span className="font-semibold tabular-nums">
                  {data.failedImplants}
                </span>
              </li>
              <li className="flex justify-between">
                <span>زرعات تحتاج إعادة</span>
                <span className="font-semibold tabular-nums">
                  {data.needsRedoImplants}
                </span>
              </li>
              <li className="flex justify-between">
                <span>حالات إعادة زراعة</span>
                <span className="font-semibold tabular-nums">
                  {data.reimplantationCases}
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
