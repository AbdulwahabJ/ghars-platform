import { useEffect } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { UsersTab } from "@/components/admin/UsersTab";
import { SystemSettingsTab } from "@/components/admin/SystemSettingsTab";
import { LookupsTab } from "@/components/admin/LookupsTab";
import { TemplatesTab } from "@/components/admin/TemplatesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { ImportTab } from "@/components/admin/ImportTab";
import { ExportTab } from "@/components/admin/ExportTab";

const TABS = [
  { value: "users", label: "المستخدمون" },
  { value: "system", label: "إعدادات النظام" },
  { value: "lookups", label: "القوائم" },
  { value: "templates", label: "قوالب واتساب" },
  { value: "audit", label: "سجل النشاط" },
  { value: "import", label: "استيراد البيانات" },
  { value: "export", label: "تصدير البيانات" },
] as const;

export default function Settings() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Backend enforces ADMIN on every endpoint; this just avoids a dead page.
  useEffect(() => {
    if (!isLoading && user && user.role !== "ADMIN") {
      setLocation("/");
    }
  }, [isLoading, user, setLocation]);

  return (
    <Shell>
      {user?.role === "ADMIN" && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">
            الإعدادات
          </h1>
          <Tabs defaultValue="users" dir="rtl">
            <TabsList className="flex flex-wrap h-auto justify-start gap-1">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  data-testid={`tab-${t.value}`}
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="users" className="mt-6">
              <UsersTab />
            </TabsContent>
            <TabsContent value="system" className="mt-6">
              <SystemSettingsTab />
            </TabsContent>
            <TabsContent value="lookups" className="mt-6">
              <LookupsTab />
            </TabsContent>
            <TabsContent value="templates" className="mt-6">
              <TemplatesTab />
            </TabsContent>
            <TabsContent value="audit" className="mt-6">
              <AuditLogTab />
            </TabsContent>
            <TabsContent value="import" className="mt-6">
              <ImportTab />
            </TabsContent>
            <TabsContent value="export" className="mt-6">
              <ExportTab />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Shell>
  );
}
