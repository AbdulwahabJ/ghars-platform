import { Link } from "wouter";
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  History,
  PhoneCall,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSaudiDateTime } from "@/lib/datetime";
import type {
  DashboardActivity,
  DashboardListItem,
} from "@workspace/shared";

/** Arabic labels for audit actions shown in آخر النشاطات. */
const ACTION_LABELS: Record<string, string> = {
  patient_create: "إضافة مريض",
  patient_update: "تعديل بيانات مريض",
  patient_archive: "أرشفة ملف مريض",
  patient_restore: "استعادة ملف مريض",
  implant_case_create: "إضافة حالة زراعة",
  implant_case_update: "تعديل حالة زراعة",
  implant_case_archive: "أرشفة حالة زراعة",
  implant_case_restore: "استعادة حالة زراعة",
  implant_create: "إضافة زرعة",
  implant_update: "تعديل زرعة",
  implant_archive: "أرشفة زرعة",
  case_base_amount_update: "تحديث مبلغ العلاج الأساسي",
  charge_create: "إضافة رسم",
  charge_delete: "حذف رسم",
  discount_create: "إضافة خصم",
  discount_delete: "حذف خصم",
  payment_create: "تسجيل دفعة",
  payment_void: "إلغاء دفعة",
  finance_export: "تصدير تقرير مالي",
  report_export: "تصدير التقرير التشغيلي",
  followup_created: "إضافة متابعة",
  followup_updated: "تعديل متابعة",
  followup_completed: "إتمام متابعة",
  followup_postponed: "تأجيل متابعة",
  followup_cancelled: "إلغاء متابعة",
  whatsapp_opened: "فتح واتساب",
  communication_result: "تسجيل نتيجة تواصل",
  login_success: "تسجيل دخول",
  logout: "تسجيل خروج",
  user_create: "إنشاء مستخدم",
};

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
  recentActivities,
}: {
  todayAppointments: DashboardListItem[];
  overdueFollowups: DashboardListItem[];
  readyCases: DashboardListItem[];
  contactTasks: DashboardListItem[];
  recentActivities: DashboardActivity[];
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
      <Card className="lg:col-span-2" data-testid="list-recent-activities">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            آخر النشاطات
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">
              لا توجد نشاطات مسجلة بعد.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {recentActivities.map((a, i) => (
                <li key={i} className="px-6 py-2.5">
                  <p className="text-sm">
                    <span className="font-medium">
                      {ACTION_LABELS[a.action] ?? a.action}
                    </span>
                    {a.summary ? (
                      <span className="text-muted-foreground notranslate">
                        {" "}
                        — {a.summary}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.userName ? (
                      <span className="notranslate">{a.userName} — </span>
                    ) : null}
                    {formatSaudiDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
