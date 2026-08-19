import { Card, CardContent } from "@/components/ui/card";
import { Users, Hexagon, Layers, UserCheck, CheckCircle } from "lucide-react";
import type { DashboardResponse } from "@workspace/shared";

export function KpiCards({ data }: { data: DashboardResponse }) {
  const ws = data.workSummary;

  const cards = [
    {
      id: "implanted-patients",
      label: "المرضى الذين تم زرعهم",
      icon: Users,
      today: ws.today.implantedPatients,
      month: ws.month.implantedPatients,
    },
    {
      id: "implants",
      label: "عدد الزرعات",
      icon: Hexagon,
      today: ws.today.implants,
      month: ws.month.implants,
    },
    {
      id: "systems",
      label: "الأنظمة المستخدمة",
      icon: Layers,
      today: ws.today.implantSystems?.count ?? 0,
      month: ws.month.implantSystems?.count ?? 0,
      names: Array.from(new Set([
          ...ws.today.implantSystems.names,
          ...ws.month.implantSystems.names
      ]))
    },
    {
      id: "prosthetic-patients",
      label: "مرضى التركيب",
      icon: UserCheck,
      today: ws.today.prostheticPatients,
      month: ws.month.prostheticPatients,
    },
    {
      id: "completed-prosthetics",
      label: "التركيبات التي تمت",
      icon: CheckCircle,
      today: ws.today.completedProsthetics,
      month: ws.month.completedProsthetics,
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.id} data-testid={`kpi-${c.id}`} className="shadow-sm">
          <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/5 text-primary rounded-md shrink-0">
                <c.icon className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold text-foreground leading-snug">
                {c.label}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 divide-x divide-x-reverse divide-border/50">
              <div className="flex flex-col justify-end">
                <span className="text-[11px] text-muted-foreground mb-1 font-medium">اليوم</span>
                <span className="text-xl font-bold tabular-nums text-foreground leading-none notranslate">
                  {c.today}
                </span>
              </div>
              <div className="flex flex-col justify-end pr-3">
                <span className="text-[11px] text-muted-foreground mb-1 font-medium">هذا الشهر</span>
                <span className="text-xl font-bold tabular-nums text-primary leading-none notranslate">
                  {c.month}
                </span>
              </div>
            </div>

            {c.names && c.names.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {c.names.map(name => (
                  <span key={name} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-[4px] leading-none whitespace-nowrap">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
