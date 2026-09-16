import { useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FileUp,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Undo2,
  FileText,
} from "lucide-react";
import {
  UniversalImportBatch,
  UniversalImportDestination,
  UNIVERSAL_IMPORT_DESTINATIONS,
} from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useUniversalImportAnalyze,
  useUniversalImportPatchMapping,
  useUniversalImportCommitBatch,
  useUniversalImportRollbackBatch,
} from "@/hooks/use-admin";
import { localizeErrorMessage } from "@/lib/localize-error";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

export function UploadStep({
  onAnalyzed,
}: {
  onAnalyzed: (batch: UniversalImportBatch) => void;
}) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const analyze = useUniversalImportAnalyze();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast({
        variant: "destructive",
        title: t("import.fileTooLargeTitle", "File too large"),
        description: t("import.fileTooLargeDescription", "Maximum size is 8MB."),
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const isCsv = file.type.includes("csv") || file.name.endsWith(".csv") || file.name.endsWith(".txt");

    const reader = new FileReader();
    reader.onload = () => {
      let content = "";
      if (isCsv) {
        content = reader.result as string;
      } else {
        const result = reader.result as string;
        content = result.split(",")[1] ?? result;
      }

      analyze.mutate(
        {
          filename: file.name,
          mime: file.type || "application/octet-stream",
          content,
        },
        {
          onSuccess: (batch) => {
            onAnalyzed(batch);
          },
          onError: (err) => {
            toast({
              variant: "destructive",
              title: t("import.operationFailed"),
              description: localizeErrorMessage(err),
            });
          },
          onSettled: () => {
            if (fileRef.current) fileRef.current.value = "";
          },
        }
      );
    };

    if (isCsv) {
      reader.readAsText(file, "utf-8");
    } else {
      reader.readAsDataURL(file);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("import.universal.uploadTitle", "Step 1: Upload Source")}</CardTitle>
        <CardDescription>
          {t(
            "import.universal.uploadDesc",
            "Upload an XLSX, CSV, PDF, PNG, or JPG file. We will automatically analyze the columns and prepare a mapping."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 text-center space-y-4">
          <FileUp className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("import.universal.dropzone", "Drag and drop your file here, or click to browse.")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("import.universal.supportedFormats", "Supports .xlsx, .csv, .pdf, .png, .jpg up to 8MB.")}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
            data-testid="input-universal-import-file"
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={analyze.isPending}
            data-testid="button-universal-import-upload"
          >
            {analyze.isPending && <Loader2 className="h-4 w-4 animate-spin ms-2" />}
            {t("import.chooseFile")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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

  // Local state for editable mappings
  const [mappings, setMappings] = useState<Record<string, UniversalImportDestination>>(() => {
    const initial: Record<string, UniversalImportDestination> = {};
    for (const m of batch.mappings) {
      initial[m.source] = m.destination;
    }
    return initial;
  });

  const uniqueImplantSystems = useMemo(() => {
    const sysCol = Object.keys(mappings).find((src) => mappings[src] === "implant.system");
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
  }, [mappings, batch.rows]);

  const [valueMappings, setValueMappings] = useState<Record<string, string>>({});

  const handleSave = () => {
    const patchPayload = {
      mappings: Object.entries(mappings).map(([source, destination]) => ({
        source,
        destination,
      })),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("import.universal.mappingTitle", "Step 2: Map Columns")}</CardTitle>
        <CardDescription>
          {t(
            "import.universal.mappingDesc",
            "Review how we matched your columns to the system fields. Adjust any incorrect mappings."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("import.universal.sourceColumn", "Source Column")}</TableHead>
                <TableHead>{t("import.universal.confidence", "Confidence")}</TableHead>
                <TableHead>{t("import.universal.destinationField", "System Field")}</TableHead>
                <TableHead>{t("import.universal.reason", "Reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.mappings.map((m) => (
                <TableRow key={m.source} className={m.requiresReview ? "bg-muted/50" : ""}>
                  <TableCell className="font-medium">{m.source}</TableCell>
                  <TableCell>
                    {m.confidence >= 0.9 ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        {Math.round(m.confidence * 100)}%
                      </Badge>
                    ) : m.confidence > 0 ? (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600 dark:text-yellow-400 dark:border-yellow-400">
                        {Math.round(m.confidence * 100)}%
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("import.universal.manual", "Manual")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={mappings[m.source]}
                      onValueChange={(val) =>
                        setMappings((prev) => ({ ...prev, [m.source]: val as UniversalImportDestination }))
                      }
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIVERSAL_IMPORT_DESTINATIONS.map((dest) => (
                          <SelectItem key={dest} value={dest}>
                            {t(`import.universal.destinations.${dest}`, dest)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {uniqueImplantSystems.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">
              {t("import.universal.implantSystemMappingTitle", "Implant System Mapping")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("import.universal.implantSystemMappingDesc", "Map unique values found in your source file to system values (e.g. ROT to Rotec).")}
            </p>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("import.universal.rawSystemValue", "Raw Value")}</TableHead>
                    <TableHead>{t("import.universal.mappedSystemValue", "Mapped Value")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniqueImplantSystems.map((val) => (
                    <TableRow key={val}>
                      <TableCell className="font-medium">{val}</TableCell>
                      <TableCell>
                        <Input
                          placeholder={val}
                          value={valueMappings[val] || ""}
                          onChange={(e) =>
                            setValueMappings((prev) => ({ ...prev, [val]: e.target.value }))
                          }
                          className="max-w-[300px]"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

        <div className="flex justify-end gap-3 pt-4">
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

export function ReviewStep({
  batch,
  onNext,
  onCancel,
}: {
  batch: UniversalImportBatch;
  onNext: (batch: UniversalImportBatch, error?: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const commit = useUniversalImportCommitBatch();

  const committedSet = useMemo(() => new Set(batch.committedRowNumbers || []), [batch.committedRowNumbers]);

  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => {
    // By default, select all READY rows that are not yet committed
    return new Set(batch.rows.filter((r) => r.status === "READY" && !committedSet.has(r.rowNumber)).map((r) => r.rowNumber));
  });

  const patch = useUniversalImportPatchMapping();

  const handleApproveRow = (rowNumber: number) => {
    patch.mutate(
      {
        id: batch.id,
        input: {
          version: batch.version,
          mappings: [],
          rowApprovals: [{ rowNumber, approved: true }],
        },
      },
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

  const toggleRow = (fileNumber: string) => {
    // Find all READY uncommitted rows for this fileNumber
    const patientReadyRows = batch.rows.filter(
      (r) => r.status === "READY" && r.proposed.patient.fileNumber === fileNumber && !committedSet.has(r.rowNumber)
    );
    if (patientReadyRows.length === 0) return;

    setSelectedRows((prev) => {
      const next = new Set(prev);
      // Check if the first one is selected to determine toggle direction
      const isSelected = next.has(patientReadyRows[0].rowNumber);
      patientReadyRows.forEach((r) => {
        if (isSelected) next.delete(r.rowNumber);
        else next.add(r.rowNumber);
      });
      return next;
    });
  };

  const selectAllInView = (rowsInView: typeof batch.rows, selected: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      // We only toggle uncommitted READY rows in the current view
      rowsInView.forEach((r) => {
        if (r.status === "READY" && !committedSet.has(r.rowNumber)) {
          const patientReadyRows = batch.rows.filter(
            (pr) => pr.status === "READY" && pr.proposed.patient.fileNumber === r.proposed.patient.fileNumber && !committedSet.has(pr.rowNumber)
          );
          patientReadyRows.forEach((pr) => {
            if (selected) next.add(pr.rowNumber);
            else next.delete(pr.rowNumber);
          });
        }
      });
      return next;
    });
  };

  const handleCommit = (pilot: boolean) => {
    const rowNumbers = Array.from(selectedRows);
    if (rowNumbers.length === 0) {
      toast({
        variant: "destructive",
        title: t("import.universal.noSelectionTitle", "No rows selected"),
        description: t("import.universal.noSelectionDesc", "Please select at least one READY row to import."),
      });
      return;
    }

    // Count distinct patients selected
    const selectedFileNumbers = new Set(
      batch.rows
        .filter((r) => selectedRows.has(r.rowNumber))
        .map((r) => r.proposed.patient.fileNumber)
    );

    if (pilot && selectedFileNumbers.size > 5) {
      toast({
        variant: "destructive",
        title: t("import.universal.pilotLimitExceededTitle", "Too many rows for Pilot"),
        description: t("import.universal.pilotLimitExceededDesc", "Pilot import is limited to 5 selected rows. Please reduce your selection."),
      });
      return;
    }

    commit.mutate(
      { id: batch.id, input: { rowNumbers, pilot, version: batch.version } },
      {
        onSuccess: (res) => {
          onNext(res.batch);
        },
        onError: (err: any) => {
          if (err?.data?.batch?.status === "PARTIAL_FAILED") {
            onNext(err.data.batch, err.data.error);
            return;
          }
          toast({
            variant: "destructive",
            title: t("import.operationFailed"),
            description: localizeErrorMessage(err),
          });
        },
      }
    );
  };

  const renderTable = (rows: typeof batch.rows) => {
    const readyRowsInView = rows.filter(r => r.status === "READY");
    const allSelected = readyRowsInView.length > 0 && readyRowsInView.every(r => selectedRows.has(r.rowNumber));

    return (
      <div className="border rounded-md overflow-x-auto max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => selectAllInView(rows, !!c)}
                  disabled={readyRowsInView.length === 0}
                />
              </TableHead>
              <TableHead className="w-16">#</TableHead>
              <TableHead className="w-24">{t("import.status", "Status")}</TableHead>
              <TableHead>{t("import.universal.patient", "Patient")}</TableHead>
              <TableHead>{t("import.universal.case", "Case")}</TableHead>
              <TableHead>{t("import.universal.implants", "Implants")}</TableHead>
              <TableHead>{t("import.universal.rawSource", "Raw Source")}</TableHead>
              <TableHead>{t("import.universal.warnings", "Warnings")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {t("import.universal.noRows", "No rows match this filter.")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const isCommitted = committedSet.has(r.rowNumber);
                const disabled = r.status !== "READY" || isCommitted;
                return (
                  <TableRow key={r.rowNumber} className={r.status === "BLOCKED" || r.status === "DUPLICATE" ? "bg-red-50/50 dark:bg-red-950/20 opacity-75" : isCommitted ? "opacity-50 bg-green-50/50 dark:bg-green-950/20" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={isCommitted || selectedRows.has(r.rowNumber)}
                        onCheckedChange={() => !isCommitted && toggleRow(r.proposed.patient.fileNumber)}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>{r.rowNumber}</TableCell>
                    <TableCell>
                      {isCommitted ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"><CheckCircle2 className="w-3 h-3 me-1"/> {t("import.universal.badges.imported", "Imported")}</Badge>
                      ) : r.status === "READY" ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"><CheckCircle2 className="w-3 h-3 me-1"/> {t("import.universal.badges.ready", "Ready")}</Badge>
                      ) : r.status === "REVIEW_REQUIRED" ? (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600 dark:text-yellow-400 dark:border-yellow-400"><AlertTriangle className="w-3 h-3 me-1"/> {t("import.universal.badges.review", "Review")}</Badge>
                      ) : r.status === "BLOCKED" ? (
                        <Badge variant="destructive"><XCircle className="w-3 h-3 me-1"/> {t("import.universal.badges.blocked", "Blocked")}</Badge>
                      ) : r.status === "DUPLICATE" ? (
                        <Badge variant="outline"><XCircle className="w-3 h-3 me-1"/> {t("import.universal.badges.duplicate", "Duplicate")}</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.proposed.patient.name}</div>
                      <div className="text-xs text-muted-foreground">{t("import.universal.filePrefix", "File")}: {r.proposed.patient.fileNumber}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.proposed.case.procedureDate}</div>
                      <div className="text-xs text-muted-foreground">{r.proposed.case.treatingDoctor}</div>
                    </TableCell>
                    <TableCell>
                      {r.proposed.implants.map((imp, i) => (
                        <div key={i} className="text-xs border rounded px-1 py-0.5 inline-block m-0.5 bg-muted">
                          {imp.site} {imp.size ? `(${imp.size})` : ""} {imp.system ? `[${imp.system}]` : ""}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>
                      <div
                        className="text-[10px] text-muted-foreground line-clamp-3 max-w-[200px]"
                        title={Object.entries(r.raw).map(([k, v]) => `${k}: ${v}`).join("\n")}
                      >
                        {Object.entries(r.raw).map(([k, v]) => (
                          <span key={k} className="me-2 mb-1 inline-block">
                            <span className="font-medium text-foreground/70">{k}:</span> {v}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {r.warnings.map((w, i) => {
                        const isPhoneDup = w.includes("uses this phone number");
                        return (
                          <div key={i} className="text-xs text-destructive flex items-start flex-col gap-1 mb-1">
                            <div className="flex items-start gap-1">
                              <span className="shrink-0">•</span> <span>{w}</span>
                            </div>
                            {isPhoneDup && r.status === "REVIEW_REQUIRED" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] self-end mt-1"
                                onClick={() => handleApproveRow(r.rowNumber)}
                                disabled={patch.isPending}
                              >
                                {patch.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("import.universal.approveRow", "Approve (Separate Patient)")}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                      {r.proposed.legacyNotes.map((n, i) => (
                        <div key={`n-${i}`} className="text-xs text-muted-foreground flex items-start gap-1 mb-1">
                          <span className="shrink-0 mt-0.5"><FileText className="h-3 w-3" /></span> <span>{n}</span>
                        </div>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card className="flex flex-col h-full max-h-[85vh]">
      <CardHeader className="pb-4 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{t("import.universal.reviewTitle", "Step 3: Review Data")}</CardTitle>
            <CardDescription>
              {t("import.universal.reviewDesc", "Review the parsed records. Only READY rows can be imported.")}
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary">{batch.summary.totalRows} {t("import.universal.badges.total", "Total")}</Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">{batch.summary.ready} {t("import.universal.badges.ready", "Ready")}</Badge>
            <Badge variant="outline" className="text-yellow-600 border-yellow-600 dark:text-yellow-400 dark:border-yellow-400">{batch.summary.reviewRequired} {t("import.universal.badges.review", "Review")}</Badge>
            <Badge variant="destructive">{batch.summary.blocked} {t("import.universal.badges.blocked", "Blocked")}</Badge>
            {(batch.summary.duplicate ?? 0) > 0 && <Badge variant="outline">{batch.summary.duplicate} {t("import.universal.badges.duplicate", "Duplicate")}</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0 space-y-4">
        <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0 flex-wrap h-auto">
            <TabsTrigger value="all">{t("import.universal.tabs.all", "All Rows")}</TabsTrigger>
            <TabsTrigger value="ready">{t("import.universal.tabs.ready", "Ready")}</TabsTrigger>
            <TabsTrigger value="review">{t("import.universal.tabs.review", "Review Required")}</TabsTrigger>
            <TabsTrigger value="blocked">{t("import.universal.tabs.blocked", "Blocked")}</TabsTrigger>
            {(batch.summary.duplicate ?? 0) > 0 && <TabsTrigger value="duplicate">{t("import.universal.tabs.duplicate", "Duplicate")}</TabsTrigger>}
          </TabsList>

          <TabsContent value="all" className="flex-1 min-h-0 m-0 mt-4 data-[state=active]:flex flex-col">
            {renderTable(batch.rows)}
          </TabsContent>
          <TabsContent value="ready" className="flex-1 min-h-0 m-0 mt-4 data-[state=active]:flex flex-col">
            {renderTable(batch.rows.filter(r => r.status === "READY"))}
          </TabsContent>
          <TabsContent value="review" className="flex-1 min-h-0 m-0 mt-4 data-[state=active]:flex flex-col">
            {renderTable(batch.rows.filter(r => r.status === "REVIEW_REQUIRED"))}
          </TabsContent>
          <TabsContent value="blocked" className="flex-1 min-h-0 m-0 mt-4 data-[state=active]:flex flex-col">
            {renderTable(batch.rows.filter(r => r.status === "BLOCKED"))}
          </TabsContent>
          <TabsContent value="duplicate" className="flex-1 min-h-0 m-0 mt-4 data-[state=active]:flex flex-col">
            {renderTable(batch.rows.filter(r => r.status === "DUPLICATE"))}
          </TabsContent>
        </Tabs>
      </CardContent>

      <div className="p-6 pt-0 shrink-0 border-t mt-auto bg-card">
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm font-medium">
            {selectedRows.size} {t("import.universal.rowsSelected", "READY rows selected for import.")}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onCancel} disabled={commit.isPending}>
              {t("import.cancel", "Cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleCommit(true)}
              disabled={commit.isPending || selectedRows.size === 0}
            >
              {commit.isPending && <Loader2 className="h-4 w-4 animate-spin ms-2" />}
              {t("import.universal.pilot", "Pilot Import (Max 5)")}
            </Button>
            <Button
              onClick={() => handleCommit(false)}
              disabled={commit.isPending || selectedRows.size === 0}
            >
              {commit.isPending && <Loader2 className="h-4 w-4 animate-spin ms-2" />}
              {t("import.universal.commit", "Commit Selected")}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ResultStep({
  batch,
  partialError,
  onReset,
  onContinue,
}: {
  batch: UniversalImportBatch;
  partialError?: string;
  onReset: () => void;
  onContinue?: () => void;
}) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const rollback = useUniversalImportRollbackBatch();

  const handleRollback = () => {
    rollback.mutate(batch.id, {
      onSuccess: () => {
        toast({
          title: t("import.universal.rollbackSuccessTitle", "Rollback Successful"),
          description: t("import.universal.rollbackSuccessDesc", "All imported records have been safely removed."),
        });
        onReset();
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: t("import.universal.rollbackFailed", "Rollback Failed"),
          description: localizeErrorMessage(err),
        });
      }
    });
  };

  const isRolledBack = batch.status === "ROLLED_BACK";
  const isPartial = batch.status === "PARTIAL_FAILED";
  const isPilotCommitted = batch.status === "PILOT_COMMITTED";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isRolledBack
            ? t("import.universal.rolledBackTitle", "Import Rolled Back")
            : isPartial
              ? t("import.universal.partialTitle", "Step 4: Import Partially Failed")
              : isPilotCommitted
                ? t("import.universal.pilotCommittedTitle", "Step 4: Pilot Verification")
                : t("import.universal.resultTitle", "Step 4: Import Complete")}
        </CardTitle>
        <CardDescription>
          {isRolledBack
            ? t("import.universal.rolledBackDesc", "The import was successfully reversed.")
            : isPartial
              ? t("import.universal.partialDesc", "Some records failed to import. See details below.")
              : isPilotCommitted
                ? t("import.universal.pilotCommittedDesc", "Please verify the pilot import before continuing.")
                : t("import.universal.resultDesc", "Your data has been imported successfully.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        <Alert variant={isRolledBack ? "destructive" : isPartial ? "destructive" : "default"} className={!isRolledBack && !isPartial ? "bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-100 dark:border-green-900" : ""}>
          {isRolledBack ? <Undo2 className="h-5 w-5" /> : isPartial ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          <AlertTitle>
            {isRolledBack
              ? t("import.universal.statusRolledBack", "Data removed")
              : isPartial
                ? t("import.universal.statusPartial", "Import Halted")
                : isPilotCommitted
                  ? t("import.universal.statusPilotSuccess", "Pilot Successful")
                  : t("import.universal.statusSuccess", "Import Successful")}
          </AlertTitle>
          <AlertDescription>
            {batch.summary.pilot && <span className="font-bold me-1">({t("import.universal.pilotMode", "Pilot Mode")})</span>}
            {isPartial
              ? t("import.universal.summaryMsgPartial", {
                  count: batch.summary.committedRows || 0,
                })
              : isPilotCommitted
                ? t("import.universal.summaryMsgPilot", {
                    count: batch.summary.committedRows || 0,
                  })
                : t("import.universal.summaryMsg", {
                    count: batch.summary.committedRows || 0,
                    patients: batch.summary.patients,
                    implants: batch.summary.implants,
                  })}
            {isPartial && (
              <div className="mt-2 text-sm space-y-1">
                <div>
                  <span className="font-medium">{t("import.universal.errorPrefix", "Error:")}</span> {partialError ?? t("import.universal.partialHint", "A patient group failed processing. You can safely rollback the rows that did import.")}
                </div>
                {!partialError && (
                  <div>{t("import.universal.partialHint", "A patient group failed processing. You can safely rollback the rows that did import.")}</div>
                )}
                {partialError && (
                  <div>{t("import.universal.partialHint2", "You can safely rollback the rows that did import successfully.")}</div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>

        {!isRolledBack && (
          <div className="flex gap-4 p-4 border rounded-lg bg-muted/30 items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm">{t("import.universal.safeRollback", "Safe Rollback")}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {t("import.universal.rollbackExpl", "If you noticed an issue, you can safely undo this import. This will delete the inserted patients, cases, and implants as long as they haven't been modified yet.")}
              </p>
            </div>
            <Button variant="destructive" onClick={handleRollback} disabled={rollback.isPending}>
              {rollback.isPending && <Loader2 className="h-4 w-4 animate-spin ms-2" />}
              <Undo2 className="h-4 w-4 ms-2" />
              {t("import.universal.undoImport", "Undo Import")}
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          {isPilotCommitted && onContinue && (
            <Button onClick={onContinue} variant="default">
              {t("import.universal.continueImport", "Continue Import")}
              <ArrowRight className="h-4 w-4 ms-2" />
            </Button>
          )}
          <Button onClick={onReset} variant={isPilotCommitted ? "outline" : "default"}>
            {t("import.universal.startNew", "Start New Import")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
