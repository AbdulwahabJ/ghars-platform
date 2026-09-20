import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { UniversalImportBatch, UniversalImportDestination, UNIVERSAL_IMPORT_DESTINATIONS } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUniversalImportPatchMapping } from "@/hooks/use-admin";
import { localizeErrorMessage } from "@/lib/localize-error";

export function MappingStep({
  batch,
  onNext,
  onCancel,
}: {
  batch: UniversalImportBatch;
  onNext: (batch: UniversalImportBatch) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const patch = useUniversalImportPatchMapping();

  const isCombinedNameMobile = (source: string) =>
    ["name+mobile", "اسم المريض والجوال"].includes(source.trim().toLowerCase());

  // Local state for editable mappings - ONLY for those needing review
  const [mappings, setMappings] = useState<Record<string, UniversalImportDestination>>(() => {
    const initial: Record<string, UniversalImportDestination> = {};
    for (const m of batch.mappings) {
      if (m.requiresReview) {
        initial[m.source] = m.destination;
      }
    }
    return initial;
  });

  const uniqueImplantSystems = useMemo(() => {
    // Only care about mapping if implant.system is actually used in the FULL batch mappings
    const sysCol = batch.mappings.find(m => (mappings[m.source] || m.destination) === "implant.system")?.source;
    if (!sysCol) return [];
    const vals = new Set<string>();
    batch.rows.forEach(r => {
      const rawStr = r.raw[sysCol];
      if (rawStr) {
        const parts = rawStr.split(/[,\n;؛|/]+/).map((p) => p.trim()).filter(Boolean);
        parts.forEach((p) => vals.add(p));
      }
    });
    return Array.from(vals).sort();
  }, [mappings, batch.mappings, batch.rows]);

  const [valueMappings, setValueMappings] = useState<Record<string, string>>({});

  const handleSave = () => {
    // Merge reviewed mappings with existing valid mappings
    const allMappings = batch.mappings.map(m => {
      if (mappings[m.source]) {
        return { source: m.source, destination: mappings[m.source] };
      }
      return { source: m.source, destination: m.destination };
    });

    const patchPayload = {
      mappings: allMappings,
      valueMappings: Object.entries(valueMappings)
        .filter(([_, dest]) => dest.trim() !== "")
        .map(([source, destination]) => ({ source, destination: destination.trim() })),
      version: batch.version,
    };

    patch.mutate(
      { id: batch.id, input: patchPayload },
      {
        onSuccess: (updatedBatch) => {
          onNext(updatedBatch);
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: t("import.operationFailed"),
            description: localizeErrorMessage(err),
          });
        },
      }
    );
  };

  const reviewMappings = batch.mappings.filter(m => m.requiresReview);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("import.universal.mappingTitle", "Step 2: Map Columns")}</CardTitle>
        <CardDescription>
          {t(
            "import.universal.mappingDescUncertain",
            "We couldn't automatically determine these columns. Please tell us what they contain."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {reviewMappings.length > 0 && (
          <div className="space-y-4">
            {reviewMappings.map((m) => (
              <div key={m.source} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-muted/30 p-4 rounded-lg border">
                <div>
                  <p className="font-medium text-sm text-foreground">{t("import.universal.questionWhatIs", "What is the column '{{col}}'?", { col: m.source })}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("import.universal.sourceColumn", "Source Column")}: <span className="font-mono text-xs font-semibold px-1 py-0.5 bg-background rounded border">{m.source}</span>
                  </p>
                </div>
                <Select
                  value={mappings[m.source]}
                  onValueChange={(val) =>
                    setMappings((prev) => ({ ...prev, [m.source]: val as UniversalImportDestination }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIVERSAL_IMPORT_DESTINATIONS.map((dest) => (
                      <SelectItem key={dest} value={dest}>
                        {dest === "patient.name" && isCombinedNameMobile(m.source)
                          ? t("import.universal.combinedNameMobile", "Patient Name + Mobile Number")
                          : t(`import.universal.destinations.${dest}`, dest)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {uniqueImplantSystems.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-semibold text-sm">
              {t("import.universal.implantSystemMappingTitle", "Implant System Mapping")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("import.universal.implantSystemMappingDesc", "Map unique values found in your source file to system values (e.g. ROT to Rotec).")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {uniqueImplantSystems.map((val) => (
                <div key={val} className="flex items-center gap-3 bg-muted/20 p-2 rounded-md border">
                   <div className="flex-1 text-sm font-medium truncate" title={val}>{val}</div>
                   <div className="flex-1">
                     <Input
                        placeholder={t("import.universal.mappedSystemValue", "Mapped Value")}
                        value={valueMappings[val] || ""}
                        onChange={(e) =>
                          setValueMappings((prev) => ({ ...prev, [val]: e.target.value }))
                        }
                      />
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.values(mappings).includes("finance.preserve_summary") && (
          <Alert className="bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-900/20 dark:text-blue-100 dark:border-blue-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("import.universal.financePreserveExpl", "Preserving financial data will only create a historical note on the case. It will NEVER create payment or charge records.")}
            </AlertDescription>
          </Alert>
        )}

        {Object.values(mappings).includes("finance.ignore") && (
          <Alert>
            <AlertDescription>
              {t("import.universal.financeIgnoreExpl", "This financial column will be entirely ignored during import.")}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-3 pt-6">
          <Button variant="ghost" onClick={onCancel}>
            {t("import.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={patch.isPending}>
            {patch.isPending && <Loader2 className="h-4 w-4 animate-spin ms-2" />}
            {t("import.universal.nextReview", "Next: Review Data")}
            <ArrowRight className="h-4 w-4 ms-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}