import { useEffect } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { UsersTab } from "@/components/admin/UsersTab";
import { LookupsTab } from "@/components/admin/LookupsTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { ExportTab } from "@/components/admin/ExportTab";
import { useTranslation } from "react-i18next";

const TABS = ["users", "lookups", "audit", "export"] as const;

export default function Settings() {
  const { t } = useTranslation("admin");
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Backend enforces ADMIN on every endpoint; this just avoids a dead page.
  useEffect(() => {
    if (!isLoading && user && user.role !== "ADMIN") {
      setLocation("/");
    }
  }, [isLoading, user, setLocation]);

  return (
    <Shell decorated>
      {user?.role === "ADMIN" && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">
             {t("settings.title")}
          </h1>
          <Tabs defaultValue="users" dir="rtl">
            <TabsList className="flex flex-wrap h-auto justify-start gap-1">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  data-testid={`tab-${tab}`}
                >
                  {t(`settings.tabs.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="users" className="mt-6">
              <UsersTab />
            </TabsContent>
            <TabsContent value="lookups" className="mt-6">
              <LookupsTab />
            </TabsContent>
            <TabsContent value="audit" className="mt-6">
              <AuditLogTab />
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
