import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle,
  Hexagon,
  Info,
  Layers,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DashboardResponse } from "@workspace/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type SystemNames = {
  today: string[];
  month: string[];
};

type KpiCard = {
  id: string;
  label: string;
  icon: LucideIcon;
  today: number;
  month: number;
  systemNames?: SystemNames;
};

export function KpiCards({ data }: { data: DashboardResponse }) {
  const ws = data.workSummary;

  const cards: KpiCard[] = [
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
      systemNames: {
        today: ws.today.implantSystems.names,
        month: ws.month.implantSystems.names,
      },
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
              {c.systemNames && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="عرض أسماء أنظمة الزرعات"
                      className="mr-auto rounded-full p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    dir="rtl"
                    className="w-64 space-y-3 text-right"
                  >
                    <SystemNamesList
                      label="الأنظمة المستخدمة اليوم"
                      names={c.systemNames.today}
                    />
                    <SystemNamesList
                      label="الأنظمة المستخدمة هذا الشهر"
                      names={c.systemNames.month}
                    />
                  </PopoverContent>
                </Popover>
              )}
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

          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SystemNamesList({
  label,
  names,
}: {
  label: string;
  names: string[];
}) {
  const uniqueNames = Array.from(new Set(names));

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      {uniqueNames.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {uniqueNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          لا توجد أنظمة مستخدمة في هذه الفترة.
        </p>
      )}
    </div>
  );
}
