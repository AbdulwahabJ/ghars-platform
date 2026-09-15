import { EXPORT_ENTITIES } from "@workspace/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dataExportUrl } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { ExportMenu } from "@/components/exports/ExportMenu";

export function ExportTab() {
  const { t } = useTranslation("admin");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("export.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("export.description")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {EXPORT_ENTITIES.map((entity) => (
            <div key={entity} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <span className="truncate text-sm">{t(`export.entities.${entity}`)}</span>
              <ExportMenu
                getUrl={(format) => dataExportUrl(entity, format)}
                formats={["pdf", "xlsx", "csv"]}
                data-testid={`button-export-${entity}`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
