import { Download } from "lucide-react";
import { EXPORT_ENTITIES, EXPORT_ENTITY_LABELS } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dataExportUrl } from "@/lib/api";

export function ExportTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>تصدير كامل البيانات (CSV)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          ملفات CSV بترميز UTF-8 تُفتح مباشرة في Excel. التصدير للقراءة فقط
          ولا يتضمن أي بيانات حسّاسة (لا كلمات مرور ولا حسابات مستخدمين).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {EXPORT_ENTITIES.map((entity) => (
            <Button
              key={entity}
              variant="outline"
              className="justify-start"
              asChild
            >
              <a
                href={dataExportUrl(entity)}
                data-testid={`link-export-${entity}`}
              >
                <Download className="h-4 w-4 ml-2" />
                <span>{EXPORT_ENTITY_LABELS[entity]}</span>
              </a>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
