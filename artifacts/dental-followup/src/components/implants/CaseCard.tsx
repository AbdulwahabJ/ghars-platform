import { useMemo, useState } from "react";
import { Archive, Loader2, Pencil, RefreshCw } from "lucide-react";
import {
  REIMPLANTABLE_STATUSES,
  type Implant,
  type ImplantCase,
  type ImplantCaseWithImplants,
} from "@workspace/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FdiToothChart } from "./FdiToothChart";
import { ImplantCard } from "./ImplantCard";
import { CaseFormDialog } from "./CaseFormDialog";
import { ImplantFormDialog, type ImplantDialogMode } from "./ImplantFormDialog";
import {
  useArchiveImplantCase,
  useRestoreImplantCase,
} from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";
import { formatSaudiDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const FAILURE_STATUSES = ["زرعة فاشلة", "يحتاج إعادة زراعة"];
const SUCCESS_STATUSES = ["تم التركيب", "مكتمل", "تمت إعادة الزراعة"];

function caseStatusClasses(status: string): string {
  if (FAILURE_STATUSES.includes(status)) {
    return "bg-destructive/10 text-destructive border-destructive/30";
  }
  if (SUCCESS_STATUSES.includes(status)) {
    return "bg-primary/10 text-primary border-primary/30";
  }
  return "bg-secondary text-secondary-foreground border-border";
}

interface ImplantDialogState {
  mode: ImplantDialogMode;
  implant?: Implant | null;
  initialSite?: string;
}

interface CaseCardProps {
  caseItem: ImplantCaseWithImplants;
  patientId: string;
  allCases: ImplantCase[];
  canArchive: boolean;
  /** Patient archived — everything becomes read-only. */
  readOnly?: boolean;
}

export function CaseCard({
  caseItem,
  patientId,
  allCases,
  canArchive,
  readOnly,
}: CaseCardProps) {
  const { toast } = useToast();
  const archiveCase = useArchiveImplantCase();
  const restoreCase = useRestoreImplantCase();

  const [editOpen, setEditOpen] = useState(false);
  const [implantDialog, setImplantDialog] = useState<ImplantDialogState | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const isArchived = caseItem.status === "archived";
  const isReadOnly = readOnly || isArchived;

  const sourceCase = useMemo(
    () =>
      caseItem.sourceCaseId
        ? allCases.find((c) => c.id === caseItem.sourceCaseId)
        : undefined,
    [allCases, caseItem.sourceCaseId],
  );

  const handleToothClick = (site: string) => {
    if (isReadOnly) return;
    const activeHere = caseItem.implants.find(
      (i) =>
        i.site === site &&
        i.status === "active" &&
        !(REIMPLANTABLE_STATUSES as readonly string[]).includes(i.implantStatus),
    );
    if (activeHere) {
      setImplantDialog({ mode: "edit", implant: activeHere });
    } else {
      setImplantDialog({ mode: "add", initialSite: site });
    }
  };

  const handleArchive = () => {
    archiveCase.mutate(
      { id: caseItem.id, patientId },
      {
        onSuccess: () => {
          toast({ title: "تمت أرشفة حالة الزراعة" });
          setShowArchiveConfirm(false);
        },
        onError: (err: Error) =>
          toast({
            variant: "destructive",
            title: "خطأ",
            description: err.message || "تعذر أرشفة الحالة.",
          }),
      },
    );
  };

  const handleRestore = () => {
    restoreCase.mutate(
      { id: caseItem.id, patientId },
      {
        onSuccess: () => toast({ title: "تمت استعادة حالة الزراعة" }),
        onError: (err: Error) =>
          toast({
            variant: "destructive",
            title: "خطأ",
            description: err.message || "تعذر استعادة الحالة.",
          }),
      },
    );
  };

  const infoItems: Array<[string, string | null]> = [
    [
      "تاريخ الإجراء",
      caseItem.procedureDate ? formatSaudiDate(caseItem.procedureDate) : null,
    ],
    ["الطبيب المعالج", caseItem.treatingDoctor],
    ["الطبيب المحوِّل", caseItem.referringDoctor],
    ["مدة التركيب — Pros", caseItem.prosValue],
    [
      "التاريخ المتوقع للتركيب",
      caseItem.expectedProstheticDate
        ? formatSaudiDate(caseItem.expectedProstheticDate)
        : null,
    ],
  ];

  const activeImplants = caseItem.implants.filter((i) => i.status === "active");
  const archivedImplants = caseItem.implants.filter(
    (i) => i.status === "archived",
  );

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-2xl shadow-sm",
        isArchived && "opacity-80",
      )}
    >
      <div className="p-5 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">حالة زراعة</h3>
              <Badge variant="outline" className={cn("border", caseStatusClasses(caseItem.caseStatus))}>
                {caseItem.caseStatus}
              </Badge>
              {isArchived && (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                  مؤرشفة
                </Badge>
              )}
              {caseItem.isReimplantation && (
                <Badge variant="outline" className="bg-destructive/5 text-destructive border-destructive/30">
                  إعادة زراعة
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              أُنشئت في {formatSaudiDate(caseItem.createdAt)}
            </p>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {!isArchived ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-outline h-9"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 ml-1.5" />
                    تعديل
                  </Button>
                  {canArchive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => setShowArchiveConfirm(true)}
                    >
                      <Archive className="h-3.5 w-3.5 ml-1.5" />
                      أرشفة
                    </Button>
                  )}
                </>
              ) : (
                canArchive && (
                  <Button
                    size="sm"
                    className="btn-primary h-9"
                    onClick={handleRestore}
                    disabled={restoreCase.isPending}
                  >
                    {restoreCase.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 ml-1.5" />
                    )}
                    استعادة
                  </Button>
                )
              )}
            </div>
          )}
        </div>

        {/* Case info */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {infoItems.map(([label, value]) =>
            value ? (
              <div key={label} className="flex justify-between sm:block gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold text-foreground">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>

        {caseItem.isReimplantation &&
          (caseItem.reimplantationReason || sourceCase) && (
            <div className="text-sm bg-muted/50 rounded-lg p-3 space-y-1">
              {caseItem.reimplantationReason && (
                <p>
                  <span className="text-muted-foreground">سبب إعادة الزراعة: </span>
                  {caseItem.reimplantationReason}
                </p>
              )}
              {sourceCase && (
                <p>
                  <span className="text-muted-foreground">الحالة المصدر: </span>
                  حالة {formatSaudiDate(sourceCase.procedureDate ?? sourceCase.createdAt)} — {sourceCase.caseStatus}
                </p>
              )}
            </div>
          )}

        {caseItem.generalNote && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">ملاحظة: </span>
            {caseItem.generalNote}
          </p>
        )}

        {/* FDI chart */}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-foreground">مخطط الأسنان (FDI)</h4>
            {!isReadOnly && (
              <p className="text-xs text-muted-foreground">
                اضغط على السن لإضافة زرعة أو تعديلها
              </p>
            )}
          </div>
          <FdiToothChart
            implants={caseItem.implants}
            onToothClick={handleToothClick}
            disabled={isReadOnly}
          />
        </div>

        {/* Implants */}
        {caseItem.implants.length > 0 && (
          <div className="border-t border-border pt-4 space-y-3">
            <h4 className="font-bold text-foreground">
              الزرعات ({activeImplants.length})
            </h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {activeImplants.map((implant) => (
                <ImplantCard
                  key={implant.id}
                  implant={implant}
                  patientId={patientId}
                  readOnly={isReadOnly}
                  canArchive={canArchive}
                  onEdit={(i) => setImplantDialog({ mode: "edit", implant: i })}
                  onCopy={(i) => setImplantDialog({ mode: "copy", implant: i })}
                />
              ))}
            </div>
            {archivedImplants.length > 0 && (
              <details className="mt-2">
                <summary className="text-sm text-muted-foreground cursor-pointer select-none">
                  الزرعات المؤرشفة ({archivedImplants.length})
                </summary>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                  {archivedImplants.map((implant) => (
                    <ImplantCard
                      key={implant.id}
                      implant={implant}
                      patientId={patientId}
                      readOnly
                      canArchive={false}
                      onEdit={() => undefined}
                      onCopy={() => undefined}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CaseFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patientId={patientId}
        caseData={caseItem}
        otherCases={allCases}
      />
      {implantDialog && (
        <ImplantFormDialog
          open
          onOpenChange={(o) => !o && setImplantDialog(null)}
          patientId={patientId}
          caseItem={caseItem}
          mode={implantDialog.mode}
          implant={implantDialog.implant}
          initialSite={implantDialog.initialSite}
        />
      )}

      <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive">
              تأكيد أرشفة الحالة
            </DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              هل أنت متأكد من رغبتك في أرشفة حالة الزراعة هذه؟ ستبقى الحالة
              وزرعاتها محفوظة في السجل ويمكن استعادتها لاحقًا.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button
              onClick={handleArchive}
              disabled={archiveCase.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto px-6 h-[46px] rounded-[10px]"
            >
              {archiveCase.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span>نعم، أرشفة</span>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowArchiveConfirm(false)}
              className="btn-outline w-full sm:w-auto"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
