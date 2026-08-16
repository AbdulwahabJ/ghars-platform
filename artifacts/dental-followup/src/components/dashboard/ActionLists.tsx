import { Link } from "wouter";
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  PhoneCall,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSaudiDateTime } from "@/lib/datetime";
import type { DashboardListItem } from "@workspace/shared";

function ListCard({
  title,
  icon,
  items,
  emptyText,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  items: DashboardListItem[];
  emptyText: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <span className="text-muted-foreground font-normal text-sm">
            ({items.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item, i) => (
              <li
                key={`${item.patientId}-${i}`}
                className="px-6 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate notranslate">
                    {item.patientName}
                    <span className="text-muted-foreground font-normal mr-2" dir="ltr">
                      {item.fileNumber}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="notranslate">{item.title}</span>
                    {item.at ? ` — ${formatSaudiDateTime(item.at)}` : ""}
                    {item.assignedUserName ? (
                      <span className="notranslate"> — {item.assignedUserName}</span>
                    ) : null}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  data-testid={`link-open-patient-${item.patientId}`}
                >
                  <Link href={`/patients/${item.patientId}`}>فتح الملف</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ActionLists({
  todayAppointments,
  overdueFollowups,
  readyCases,
  contactTasks,
}: {
  todayAppointments: DashboardListItem[];
  overdueFollowups: DashboardListItem[];
  readyCases: DashboardListItem[];
  contactTasks: DashboardListItem[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ListCard
        title="مواعيد اليوم"
        icon={<CalendarDays className="h-4 w-4 text-primary" />}
        items={todayAppointments}
        emptyText="لا توجد مواعيد متابعة اليوم."
        testId="list-today-appointments"
      />
      <ListCard
        title="المتابعات المتأخرة"
        icon={<AlarmClock className="h-4 w-4 text-destructive" />}
        items={overdueFollowups}
        emptyText="لا توجد متابعات متأخرة."
        testId="list-overdue-followups"
      />
      <ListCard
        title="حالات جاهزة للتركيب"
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        items={readyCases}
        emptyText="لا توجد حالات جاهزة للتركيب حاليًا."
        testId="list-ready-cases"
      />
      <ListCard
        title="مهام التواصل المستحقة"
        icon={<PhoneCall className="h-4 w-4 text-amber-600" />}
        items={contactTasks}
        emptyText="لا توجد مهام تواصل مستحقة."
        testId="list-contact-tasks"
      />
    </div>
  );
}
