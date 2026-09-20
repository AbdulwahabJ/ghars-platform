import { useState, useMemo, Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  FileText,
  ChevronDown,
  ChevronRight,
  Edit2,
  Save,
  X,
  Plus,
  Trash2
} from "lucide-react";
import { UniversalImportBatch } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUniversalImportPatchMapping, useUniversalImportCommitBatch } from "@/hooks/use-admin";
import { localizeErrorMessage } from "@/lib/localize-error";

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
  const patch = useUniversalImportPatchMapping();
  
  const importMode = "clinical_only" as const;
  const committedSet = useMemo(() => new Set(batch.committedRowNumbers || []), [batch.committedRowNumbers]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => {
    return new Set(batch.rows.filter((r) => r.status === "READY" && !committedSet.has(r.rowNumber)).map((r) => r.rowNumber));
  });
  
  const [filter, setFilter] = useState<"ALL" | "READY" | "REVIEW_REQUIRED" | "BLOCKED" | "DUPLICATE">("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Editing state
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);

  // Finance editing dialog
  const [financeEditingRow, setFinanceEditingRow] = useState<number | null>(null);
  const [financeDraft, setFinanceDraft] = useState<any>(null);
  const [pendingCommit, setPendingCommit] = useState<boolean | null>(null);

  const uiNumber = (value: number) => value.toLocaleString("en-US");
  const money = (cents: number | null | undefined) => cents == null ? "—" : (cents / 100).toFixed(2);
  
  const warningLabel = (warning: string) => {
    const code = warning.split(":")[0].trim().replace(/[^a-zA-Z0-9_.-]/g, "");
    const translated = t(`import.universal.warningCodes.${code}`, { defaultValue: "" });
    if (translated) return translated;
    if (warning.includes("Financial source text")) return t("import.universal.warningCodes.FINANCE_SOURCE_REVIEW");
    if (warning.includes("requires review")) return t("import.universal.warningCodes.SOURCE_REVIEW_REQUIRED");
    return warning;
  };

  const toggleRowSelection = (fileNumber: string) => {
    const patientReadyRows = batch.rows.filter(
      (r) => r.status === "READY" && r.proposed.patient.fileNumber === fileNumber && !committedSet.has(r.rowNumber)
    );
    if (patientReadyRows.length === 0) return;

    setSelectedRows((prev) => {
      const next = new Set(prev);
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

  const toggleExpand = (rowNumber: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
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
    const selectedFileNumbers = new Set(
      batch.rows.filter((r) => selectedRows.has(r.rowNumber)).map((r) => r.proposed.patient.fileNumber)
    );
    if (pilot && selectedFileNumbers.size > 5) {
      toast({
        variant: "destructive",
        title: t("import.universal.pilotLimitExceededTitle", "Too many rows for Pilot"),
        description: t("import.universal.pilotLimitExceededDesc", "Pilot import is limited to 5 distinct patients. Please reduce your selection."),
      });
      return;
    }
    commit.mutate(
      { id: batch.id, input: { rowNumbers, pilot, version: batch.version, mode: importMode } },
      {
        onSuccess: (res) => onNext(res.batch),
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

  const handleApproveRow = (rowNumber: number) => {
    patch.mutate(
      { id: batch.id, input: { version: batch.version, mappings: [], rowApprovals: [{ rowNumber, approved: true }] } },
      {
        onSuccess: (updatedBatch) => onNext(updatedBatch),
        onError: (err) => toast({ variant: "destructive", title: t("import.operationFailed"), description: localizeErrorMessage(err) }),
      }
    );
  };

  const startEdit = (row: typeof batch.rows[number]) => {
    setEditingRow(row.rowNumber);
    setEditDraft({
      patient: { ...row.proposed.patient },
      case: { ...row.proposed.case },
      implants: row.proposed.implants.map(i => ({ ...i }))
    });
    setExpandedRows(prev => new Set(prev).add(row.rowNumber));
  };

  const saveEdit = (rowNumber: number) => {
    patch.mutate(
      {
        id: batch.id,
        input: {
          version: batch.version,
          mappings: [],
          rowCorrections: [{
            rowNumber,
            patient: editDraft.patient,
            case: editDraft.case,
            implants: editDraft.implants
          }]
        }
      },
      {
        onSuccess: (updatedBatch) => {
          setEditingRow(null);
          onNext(updatedBatch);
        },
        onError: (err) => toast({ variant: "destructive", title: t("import.operationFailed"), description: localizeErrorMessage(err) }),
      }
    );
  };

  const startFinanceEdit = (row: typeof batch.rows[number]) => {
    setFinanceEditingRow(row.rowNumber);
    setFinanceDraft({
      total: row.proposed.finance.historicalTotalAmount == null ? "" : String(row.proposed.finance.historicalTotalAmount / 100),
      paid: row.proposed.finance.historicalPaidAmount == null ? "" : String(row.proposed.finance.historicalPaidAmount / 100),
      opening: row.proposed.finance.openingRemainingBalance == null ? "" : String(row.proposed.finance.openingRemainingBalance / 100),
      status: row.proposed.finance.historicalPaymentStatus || "__none__",
    });
  };

  const saveFinanceCorrection = () => {
    if (!financeEditingRow) return;
    const cents = (key: string) => {
      const value = financeDraft[key]?.trim() ?? "";
      if (!value) return null;
      const parsed = Number(value.replace(",", "."));
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : NaN;
    };
    const total = cents("total");
    const paid = cents("paid");
    const opening = cents("opening");
    if ([total, paid, opening].some((value) => Number.isNaN(value))) {
      toast({ variant: "destructive", title: t("import.universal.invalidAmount"), description: t("import.universal.invalidAmountDesc") });
      return;
    }
    const derivedOpening = opening == null && total != null && paid != null ? total - paid : opening;
    if (derivedOpening != null && derivedOpening < 0) {
      toast({ variant: "destructive", title: t("import.universal.contradictoryFinance"), description: t("import.universal.paidExceedsTotal") });
      return;
    }
    if (total != null && paid != null && derivedOpening != null && total !== paid + derivedOpening) {
      toast({ variant: "destructive", title: t("import.universal.contradictoryFinance"), description: t("import.universal.totalMismatch") });
      return;
    }
    const verified = total != null && paid != null && derivedOpening != null &&
      total === paid + derivedOpening &&
      (
        (financeDraft.status === "UNPAID" && paid === 0) ||
        (financeDraft.status === "PAID_IN_FULL" && derivedOpening === 0 && paid === total) ||
        (financeDraft.status === "PARTIALLY_PAID" && paid > 0 && derivedOpening > 0)
      );
    patch.mutate({
      id: batch.id,
      input: {
        version: batch.version,
        mappings: [],
        financeCorrections: [{
          rowNumber: financeEditingRow,
          historicalTotalAmount: total,
          historicalPaidAmount: paid,
          openingRemainingBalance: derivedOpening,
          historicalPaymentStatus: (financeDraft.status === "__none__" ? null : financeDraft.status) as "UNKNOWN" | "UNPAID" | "PARTIALLY_PAID" | "PAID_IN_FULL" | "REVIEW_REQUIRED" | null,
          isVerified: verified,
        }],
      },
    }, { onSuccess: (updatedBatch) => { setFinanceEditingRow(null); onNext(updatedBatch); } });
  };

  const filteredRows = batch.rows.filter(r => filter === "ALL" || r.status === filter);
  const readyRowsInView = filteredRows.filter(r => r.status === "READY");
  const allSelected = readyRowsInView.length > 0 && readyRowsInView.every(r => selectedRows.has(r.rowNumber));

  const plan = (r: typeof batch.rows[number]) => (
    <div className="rounded-md border bg-muted/20 p-3 text-sm flex gap-6 flex-wrap">
      <div className="space-y-1 min-w-[150px]">
        <div className="font-semibold text-muted-foreground text-xs uppercase">{t("import.universal.importPlan", "Import Plan")}</div>
        <div>✓ {t("import.universal.planCreatePatientCase", "Patient & Case")}</div>
        <div>✓ {t("import.universal.planImplants", { count: uiNumber(r.importPlan.implantCount) })}</div>
        <div>✓ {t("import.universal.planPayments", "Payment records: 0")}</div>
      </div>
      <div className="space-y-1 min-w-[150px] pt-5">
        <div>{t("import.universal.planOpening", { amount: money(r.importPlan.openingRemainingBalance) })}</div>
        <div className="flex items-center gap-1">{r.importPlan.preserveLegacyNote ? "✓" : "—"} {t("import.universal.planNote", "Legacy Note")}</div>
      </div>
    </div>
  );

  return (
    <Card className="flex flex-col border-none shadow-none h-full">
      <CardHeader className="px-0 pt-0 pb-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">{t("import.universal.reviewTitle", "Step 3: Review Data")}</CardTitle>
            <CardDescription className="text-base mt-1">
              {t("import.universal.reviewDesc", "Review the parsed records. Only READY rows can be imported.")}
            </CardDescription>
          </div>
          
          {/* Summary Filters */}
          <div className="flex gap-2 flex-wrap">
            <Button variant={filter === "ALL" ? "default" : "outline"} size="sm" onClick={() => setFilter("ALL")} className="h-8">
              {batch.summary.totalRows} {t("import.universal.badges.total", "Total")}
            </Button>
            <Button variant={filter === "READY" ? "secondary" : "outline"} size="sm" onClick={() => setFilter("READY")} className="h-8 bg-green-100 hover:bg-green-200 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-100 dark:border-green-800 dark:hover:bg-green-900/50">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {batch.summary.ready} {t("import.universal.badges.ready", "Ready")}
            </Button>
            <Button variant={filter === "REVIEW_REQUIRED" ? "secondary" : "outline"} size="sm" onClick={() => setFilter("REVIEW_REQUIRED")} className="h-8 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-800 dark:hover:bg-yellow-900/50">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {batch.summary.reviewRequired} {t("import.universal.badges.review", "Review")}
            </Button>
            <Button variant={filter === "BLOCKED" ? "secondary" : "outline"} size="sm" onClick={() => setFilter("BLOCKED")} className="h-8 bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-100 dark:border-red-800 dark:hover:bg-red-900/50">
              <XCircle className="w-3.5 h-3.5 mr-1" /> {batch.summary.blocked} {t("import.universal.badges.blocked", "Blocked")}
            </Button>
            {(batch.summary.duplicate ?? 0) > 0 && (
              <Button variant={filter === "DUPLICATE" ? "secondary" : "outline"} size="sm" onClick={() => setFilter("DUPLICATE")} className="h-8">
                {batch.summary.duplicate} {t("import.universal.badges.duplicate", "Duplicate")}
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4 mt-4 bg-muted/40 p-3 rounded-lg border">
          <div className="text-sm text-muted-foreground">{t("import.universal.rowsSelected", "READY rows selected for import.")}: <span className="font-semibold text-foreground">{selectedRows.size}</span></div>
        </div>
      </CardHeader>

      <CardContent className="px-0 py-0 flex-1 min-h-[400px]">
        <div className="border rounded-md overflow-auto max-h-[600px] bg-background">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm backdrop-blur">
              <TableRow>
                <TableHead className="w-12 text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) => selectAllInView(filteredRows, !!c)}
                    disabled={readyRowsInView.length === 0}
                  />
                </TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead className="w-28">{t("import.status", "Status")}</TableHead>
                <TableHead className="min-w-[200px]">{t("import.universal.patient", "Patient")}</TableHead>
                <TableHead className="min-w-[150px]">{t("import.universal.case", "Case")}</TableHead>
                <TableHead>{t("import.universal.implants", "Implants")}</TableHead>
                <TableHead>{t("import.universal.historicalFinance", "Finance")}</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground bg-muted/10">
                    {t("import.universal.noRows", "No rows match this filter.")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r) => {
                  const isCommitted = committedSet.has(r.rowNumber);
                  const disabled = r.status !== "READY" || isCommitted;
                  const isExpanded = expandedRows.has(r.rowNumber);
                  const isEditing = editingRow === r.rowNumber;
                  
                  const canApproveReview = r.status === "REVIEW_REQUIRED" && r.warnings.some((warning) =>
                    warning.includes("low extraction confidence") ||
                    warning.includes("Financial source text") ||
                    warning.includes("uses this phone number")
                  );

                  return (
                    <Fragment key={r.rowNumber}>
                      <TableRow 
                        className={`
                          cursor-pointer transition-colors hover:bg-muted/30
                          ${r.status === "BLOCKED" || r.status === "DUPLICATE" ? "bg-red-50/30 dark:bg-red-950/10" : ""}
                          ${isCommitted ? "opacity-60 bg-green-50/30 dark:bg-green-950/10" : ""}
                          ${isExpanded ? "border-b-0" : ""}
                        `}
                        onClick={(e) => {
                          // Prevent toggling expand when clicking interactive elements
                          if ((e.target as HTMLElement).closest('button, input, select, [role="checkbox"]')) return;
                          toggleExpand(r.rowNumber);
                        }}
                      >
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={isCommitted || selectedRows.has(r.rowNumber)}
                            onCheckedChange={() => !isCommitted && toggleRowSelection(r.proposed.patient.fileNumber)}
                            disabled={disabled}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.rowNumber}</TableCell>
                        <TableCell>
                          {isCommitted ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 border-transparent dark:bg-green-900/50 dark:text-green-100"><CheckCircle2 className="w-3 h-3 me-1"/> {t("import.universal.badges.imported", "Imported")}</Badge>
                          ) : r.status === "READY" ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 border-transparent dark:bg-green-900/50 dark:text-green-100"><CheckCircle2 className="w-3 h-3 me-1"/> {t("import.universal.badges.ready", "Ready")}</Badge>
                          ) : r.status === "REVIEW_REQUIRED" ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800"><AlertTriangle className="w-3 h-3 me-1"/> {t("import.universal.badges.review", "Review")}</Badge>
                          ) : r.status === "BLOCKED" ? (
                            <Badge variant="destructive"><XCircle className="w-3 h-3 me-1"/> {t("import.universal.badges.blocked", "Blocked")}</Badge>
                          ) : r.status === "DUPLICATE" ? (
                            <Badge variant="outline" className="bg-background"><XCircle className="w-3 h-3 me-1"/> {t("import.universal.badges.duplicate", "Duplicate")}</Badge>
                          ) : null}
                        </TableCell>
                        
                        {/* Patient Column */}
                        <TableCell>
                          {isEditing ? (
                            <div className="space-y-2" onClick={e => e.stopPropagation()}>
                              <Input size={1} className="h-7 text-sm" value={editDraft.patient.name} onChange={e => setEditDraft({...editDraft, patient: {...editDraft.patient, name: e.target.value}})} placeholder={t("import.universal.patientName")} />
                              <Input size={1} className="h-7 text-sm" value={editDraft.patient.fileNumber} onChange={e => setEditDraft({...editDraft, patient: {...editDraft.patient, fileNumber: e.target.value}})} placeholder={t("import.universal.fileNumber")} />
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold text-sm truncate max-w-[200px]" title={r.proposed.patient.name}>{r.proposed.patient.name}</div>
                              <div className="text-xs text-muted-foreground flex gap-2">
                                <span className="font-mono">#{r.proposed.patient.fileNumber}</span>
                                {r.proposed.patient.mobile && <span>{r.proposed.patient.mobile}</span>}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        
                        {/* Case Column */}
                        <TableCell>
                           {isEditing ? (
                            <div className="space-y-2" onClick={e => e.stopPropagation()}>
                              <Input type="date" className="h-7 text-sm" value={editDraft.case.procedureDate} onChange={e => setEditDraft({...editDraft, case: {...editDraft.case, procedureDate: e.target.value}})} />
                              <Input className="h-7 text-sm" value={editDraft.case.treatingDoctor} onChange={e => setEditDraft({...editDraft, case: {...editDraft.case, treatingDoctor: e.target.value}})} placeholder={t("import.universal.treatingDoctor")} />
                              <Input className="h-7 text-sm" value={editDraft.case.status} onChange={e => setEditDraft({...editDraft, case: {...editDraft.case, status: e.target.value}})} placeholder={t("import.universal.status")} />
                            </div>
                          ) : (
                            <div className="text-sm">
                              <div>{r.proposed.case.procedureDate || <span className="text-muted-foreground italic">No date</span>}</div>
                              <div className="text-xs truncate max-w-[150px]">{r.proposed.case.treatingDoctor || "Unknown Dr"}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[150px]">{r.proposed.case.status || "Unknown Status"}</div>
                            </div>
                          )}
                        </TableCell>
                        
                        {/* Implants Summary */}
                        <TableCell>
                          <div className="font-medium text-sm">{r.proposed.implants.length} {t("import.universal.implants", "Implants")}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1 max-w-[150px]">
                            {r.proposed.implants.map(i => i.site).join(", ")}
                          </div>
                        </TableCell>

                        {/* Finance Summary */}
                        <TableCell>
                           <div className="text-sm">
                             <div className="font-medium">{money(r.proposed.finance.historicalTotalAmount)}</div>
                             <div className="text-xs text-muted-foreground flex items-center gap-1">
                               {r.proposed.finance.isVerified ? (
                                 <><CheckCircle2 className="w-3 h-3 text-green-600" /> {t("import.universal.verified", "Verified")}</>
                               ) : (
                                 <><AlertTriangle className="w-3 h-3 text-yellow-600" /> {t("import.universal.needsVerification", "Needs verify")}</>
                               )}
                             </div>
                           </div>
                        </TableCell>

                        <TableCell className="text-right pr-4">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <TableRow className="bg-muted/10">
                          <TableCell colSpan={8} className="p-0 border-b">
                            <div className="p-4 pl-12 space-y-6">
                              {/* Action Bar for row */}
                              {!isCommitted && (
                                <div className="flex gap-2 justify-end mb-4">
                                  {isEditing ? (
                                    <>
                                      <Button size="sm" onClick={() => saveEdit(r.rowNumber)} disabled={patch.isPending} className="h-8"><Save className="w-3.5 h-3.5 mr-1" /> {t("import.universal.saveCaseCorrection", "Save")}</Button>
                                      <Button size="sm" variant="ghost" onClick={() => setEditingRow(null)} className="h-8"><X className="w-3.5 h-3.5 mr-1" /> {t("import.cancel", "Cancel")}</Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => startEdit(r)} className="h-8"><Edit2 className="w-3.5 h-3.5 mr-1" /> {t("import.universal.editData")}</Button>
                                      {!r.proposed.finance.isVerified && <Button size="sm" variant="outline" className="h-8 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 border-yellow-200" onClick={() => startFinanceEdit(r)}>{t("import.universal.reviewFinance")}</Button>}
                                      {canApproveReview && (
                                        <Button size="sm" onClick={() => handleApproveRow(r.rowNumber)} disabled={patch.isPending} className="h-8">
                                          {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                                          {t("import.universal.approveReviewedRow", "Approve reviewed row")}
                                        </Button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}

                              {/* Implants Grid */}
                              <div>
                                <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">{t("import.universal.implants", "Implants Details")}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {(isEditing ? editDraft.implants : r.proposed.implants).map((imp: any, i: number) => (
                                    <div key={i} className="bg-background rounded-md border p-3 text-sm shadow-sm">
                                      {isEditing ? (
                                        <div className="space-y-2">
                                          <div className="flex gap-2">
                                            <Input className="h-7 text-xs" value={imp.site} onChange={e => {const newImp = [...editDraft.implants]; newImp[i].site = e.target.value; setEditDraft({...editDraft, implants: newImp})}} placeholder="Site" />
                                            <Input className="h-7 text-xs" value={imp.size || ""} onChange={e => {const newImp = [...editDraft.implants]; newImp[i].size = e.target.value; setEditDraft({...editDraft, implants: newImp})}} placeholder="Size" />
                                          </div>
                                          <Input className="h-7 text-xs" value={imp.system || ""} onChange={e => {const newImp = [...editDraft.implants]; newImp[i].system = e.target.value; setEditDraft({...editDraft, implants: newImp})}} placeholder="System" />
                                          <div className="flex gap-2">
                                             <Input className="h-7 text-xs" value={imp.qValue || ""} onChange={e => {const newImp = [...editDraft.implants]; newImp[i].qValue = e.target.value; setEditDraft({...editDraft, implants: newImp})}} placeholder="Q" />
                                             <Input className="h-7 text-xs" value={imp.formerValue || ""} onChange={e => {const newImp = [...editDraft.implants]; newImp[i].formerValue = e.target.value; setEditDraft({...editDraft, implants: newImp})}} placeholder="Former" />
                                             <Input className="h-7 text-xs" value={imp.graftValue || ""} onChange={e => {const newImp = [...editDraft.implants]; newImp[i].graftValue = e.target.value; setEditDraft({...editDraft, implants: newImp})}} placeholder="Graft" />
                                          </div>
                                           {editDraft.implants.length > 1 && (
                                             <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setEditDraft({...editDraft, implants: editDraft.implants.filter((_: unknown, index: number) => index !== i)})}>
                                               <Trash2 className="h-3.5 w-3.5 me-1" /> {t("import.universal.removeImplant")}
                                             </Button>
                                           )}
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                                          <div className="col-span-2 flex items-center justify-between border-b pb-1 mb-1">
                                            <span className="font-semibold text-primary">{imp.site}</span>
                                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{imp.size || "—"}</span>
                                          </div>
                                          <span className="text-muted-foreground text-xs">{t("import.universal.system")}:</span>
                                          <span className="text-xs truncate font-medium">{imp.system || "—"}</span>
                                          <span className="text-muted-foreground text-xs">Q / Former:</span>
                                          <span className="text-xs truncate">{imp.qValue || "—"} / {imp.formerValue || "—"}</span>
                                          <span className="text-muted-foreground text-xs">{t("import.universal.graft")}:</span>
                                          <span className="text-xs truncate">{imp.graftValue || "—"}</span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                 {isEditing && (
                                   <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setEditDraft({...editDraft, implants: [...editDraft.implants, { site: "", size: null, system: null, qValue: null, formerValue: null, graftValue: null }]})}>
                                     <Plus className="h-3.5 w-3.5 me-1" /> {t("import.universal.addImplant")}
                                   </Button>
                                 )}
                              </div>

                              {/* Errors & Warnings */}
                              {r.warnings.length > 0 && (
                                <div className="bg-red-50/50 dark:bg-red-900/10 rounded-md border border-red-200 dark:border-red-900/30 p-3">
                                  <h4 className="text-sm font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4" /> {t("import.universal.warnings", "Warnings & Errors")}
                                  </h4>
                                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 pl-5 list-disc">
                                    {r.warnings.map((w, i) => <li key={i}>{warningLabel(w)}</li>)}
                                  </ul>
                                </div>
                              )}

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Notes */}
                                {(r.proposed.case.clinicalNote || r.proposed.legacyNotes.length > 0) && (
                                  <div>
                                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">{t("import.universal.note", "Notes")}</h4>
                                    <div className="bg-background rounded-md border p-3 text-sm space-y-3">
                                      {r.proposed.case.clinicalNote && (
                                        <div>
                                          <div className="font-medium text-xs mb-1 text-muted-foreground">{t("import.universal.note")}:</div>
                                          <p className="whitespace-pre-wrap">{r.proposed.case.clinicalNote}</p>
                                        </div>
                                      )}
                                      {r.proposed.legacyNotes.length > 0 && (
                                        <div>
                                          <div className="font-medium text-xs mb-1 text-muted-foreground">{t("import.universal.legacyNote")}:</div>
                                          {r.proposed.legacyNotes.map((n, i) => (
                                            <p key={i} className="whitespace-pre-wrap flex gap-1"><FileText className="w-3 h-3 mt-0.5 shrink-0"/> {n}</p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Import Plan preview */}
                                <div>
                                   {plan(r)}
                                </div>
                              </div>
                              
                              {/* Raw Data Accordion */}
                              <details className="group">
                                <summary className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground">{t("import.universal.viewRawSource")}</summary>
                                <div className="mt-3 bg-muted/30 rounded-md border p-3 text-xs font-mono max-h-[200px] overflow-auto">
                                  <table className="w-full">
                                    <tbody>
                                      {Object.entries(r.raw).map(([k, v]) => (
                                        <tr key={k} className="border-b last:border-0 border-border/50">
                                          <td className="py-1 pr-4 font-semibold text-muted-foreground whitespace-nowrap align-top">{k}</td>
                                          <td className="py-1 break-words">{v}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>

                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="px-0 pt-4 pb-0 flex justify-between border-t mt-4">
        <Button variant="ghost" onClick={onCancel}>{t("import.cancel", "Cancel")}</Button>
        <div className="flex gap-2">
           <Button variant="outline" onClick={() => setPendingCommit(true)} disabled={commit.isPending || selectedRows.size === 0} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200">
             {commit.isPending && batch.summary.pilot ? <Loader2 className="h-4 w-4 animate-spin ms-2" /> : null}
             {t("import.universal.pilot", "Pilot Import (Max 5)")}
           </Button>
           <Button onClick={() => setPendingCommit(false)} disabled={commit.isPending || selectedRows.size === 0}>
             {commit.isPending && !batch.summary.pilot ? <Loader2 className="h-4 w-4 animate-spin ms-2" /> : null}
             {t("import.universal.commit", "Commit Selected")}
             <ArrowRight className="h-4 w-4 ms-2" />
           </Button>
        </div>
      </CardFooter>

      {/* Finance Edit Dialog */}
      <Dialog open={financeEditingRow !== null} onOpenChange={(open) => !open && setFinanceEditingRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("import.universal.reviewFinance")}</DialogTitle>
            <DialogDescription>{t("import.universal.reviewFinanceDesc")}</DialogDescription>
          </DialogHeader>
          {financeDraft && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Total Amount</label>
                  <Input type="number" min="0" step="0.01" value={financeDraft.total} onChange={e => setFinanceDraft({...financeDraft, total: e.target.value})} placeholder="Blank = Unspecified" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Paid Amount</label>
                  <Input type="number" min="0" step="0.01" value={financeDraft.paid} onChange={e => setFinanceDraft({...financeDraft, paid: e.target.value})} placeholder="Blank = Unspecified" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <label className="text-sm font-medium">Opening Balance</label>
                  <Input type="number" min="0" step="0.01" value={financeDraft.opening} onChange={e => setFinanceDraft({...financeDraft, opening: e.target.value})} placeholder="Blank = Unspecified" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Payment Status</label>
                  <Select value={financeDraft.status} onValueChange={v => setFinanceDraft({...financeDraft, status: v})}>
                    <SelectTrigger><SelectValue placeholder="Unspecified" /></SelectTrigger>
                    <SelectContent>
                       <SelectItem value="__none__">{t("import.universal.unspecified")}</SelectItem>
                      <SelectItem value="UNKNOWN">Unknown</SelectItem>
                      <SelectItem value="UNPAID">Unpaid</SelectItem>
                      <SelectItem value="PARTIALLY_PAID">Partially paid</SelectItem>
                      <SelectItem value="PAID_IN_FULL">Paid in full</SelectItem>
                      <SelectItem value="REVIEW_REQUIRED">Review required</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFinanceEditingRow(null)}>{t("import.cancel")}</Button>
            <Button onClick={saveFinanceCorrection} disabled={patch.isPending}>
              {patch.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
               {t("import.universal.saveFinanceReview")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingCommit !== null} onOpenChange={(open) => !open && setPendingCommit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("import.universal.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("import.universal.confirmDesc")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
            <div>{t("import.universal.confirmRows", { count: selectedRows.size })}</div>
            <div>{t("import.universal.confirmPatients", { count: new Set(batch.rows.filter(r => selectedRows.has(r.rowNumber)).map(r => r.proposed.patient.fileNumber)).size })}</div>
            <div>{t("import.universal.confirmImplants", { count: batch.rows.filter(r => selectedRows.has(r.rowNumber)).reduce((sum, r) => sum + r.proposed.implants.length, 0) })}</div>
            <div>{t("import.universal.planPayments", "Payment records: 0")}</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingCommit(null)}>{t("import.cancel")}</Button>
            <Button onClick={() => { const pilot = pendingCommit === true; setPendingCommit(null); handleCommit(pilot); }} disabled={commit.isPending}>
              {t("import.universal.confirmImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}