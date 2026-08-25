import { Link } from "wouter";
import {
  AlarmClock,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSaudiDateTime } from "@/lib/datetime";
import type { DashboardListItem } from "@workspace/shared";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("guidance");
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
                    <span className="text-muted-foreground font-normal me-2" dir="ltr">
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
                  <Link href={`/patients/${item.patientId}?tab=followup`}>{t("dashboard.openPatient")}</Link>
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
}: {
  todayAppointments: DashboardListItem[];
  overdueFollowups: DashboardListItem[];
}) {
  const { t } = useTranslation("guidance");
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ListCard
        title={t("dashboard.todayAppointments")}
        icon={<CalendarDays className="h-4 w-4 text-primary" />}
        items={todayAppointments}
        emptyText={t("dashboard.noTodayAppointments")}
        testId="list-today-appointments"
      />
      <ListCard
        title={t("dashboard.overdueFollowups")}
        icon={<AlarmClock className="h-4 w-4 text-destructive" />}
        items={overdueFollowups}
        emptyText={t("dashboard.noOverdueFollowups")}
        testId="list-overdue-followups"
      />
    </div>
  );
}
