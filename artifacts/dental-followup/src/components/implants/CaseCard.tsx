import { useMemo, useState } from "react";
import { Archive, CalendarCheck2, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import {
  REIMPLANTABLE_STATUSES,
  type Implant,
  type ImplantCase,
  type ImplantCaseWithImplants,
  type BoneGraftProcedure,
  type ProstheticEvent,
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
import { ProstheticEventDialog } from "./ProstheticEventDialog";
import { BoneGraftProcedureDialog } from "./BoneGraftProcedureDialog";
import { ImplantFormDialog, type ImplantDialogMode } from "./ImplantFormDialog";
import {
  useArchiveImplantCase,
  useArchiveProstheticEvent,
  useArchiveBoneGraftProcedure,
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
  const archiveProstheticEvent = useArchiveProstheticEvent();
  const archiveBoneGraftProcedure = useArchiveBoneGraftProcedure();
  const restoreCase = useRestoreImplantCase();

  const [editOpen, setEditOpen] = useState(false);
  const [implantDialog, setImplantDialog] = useState<ImplantDialogState | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [prostheticEventOpen, setProstheticEventOpen] = useState(false);
  const [prostheticEventToArchive, setProstheticEventToArchive] =
    useState<ProstheticEvent | null>(null);
  const [boneGraftProcedureDialog, setBoneGraftProcedureDialog] =
    useState<BoneGraftProcedure | null | "new">(null);
  const [boneGraftProcedureToArchive, setBoneGraftProcedureToArchive] =
    useState<BoneGraftProcedure | null>(null);

  const isArchived = caseItem.status === "archived";
  const isReadOnly = readOnly || isArchived;
  // Newly created cases may be rendered from an optimistic response before
  // the expanded patient-file query attaches this collection.
  const activeBoneGraftProcedures = (caseItem.boneGraftProcedures ?? []).filter(
    (item) => item.status === "active",
  );

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

  const handleArchiveProstheticEvent = () => {
    if (!prostheticEventToArchive) return;
    archiveProstheticEvent.mutate(
      { id: prostheticEventToArchive.id, patientId },
      {
        onSuccess: () => {
          toast({ title: "تمت أرشفة سجل التركيب" });
          setProstheticEventToArchive(null);
        },
        onError: (err: Error) =>
          toast({
            variant: "destructive",
            title: "تعذر أرشفة سجل التركيب",
            description: err.message,
          }),
      },
    );
  };

  const handleArchiveBoneGraftProcedure = () => {
    if (!boneGraftProcedureToArchive) return;
    archiveBoneGraftProcedure.mutate(
      { id: boneGraftProcedureToArchive.id, patientId },
      {
        onSuccess: () => {
          toast({ title: "تمت أرشفة سجل الإجراءات الجراحية المساندة" });
          setBoneGraftProcedureToArchive(null);
        },
        onError: (error: Error) =>
          toast({
            variant: "destructive",
            title: "تعذر أرشفة السجل",
            description: error.message,
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
        "rounded-xl border border-border bg-background",
        isArchived && "opacity-80",
      )}
    >
       <div className="space-y-5 p-4 md:p-5">
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
                    onClick={() => setProstheticEventOpen(true)}
                  >
                    <CalendarCheck2 className="h-3.5 w-3.5 ml-1.5" />
                    توثيق تركيب
                  </Button>
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

        {/* Explicit, dated prosthetic events — separate from case status. */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-foreground">سجل التركيبات</h4>
              <p className="text-xs text-muted-foreground mt-1">
                يُحتسب في ملخص العمل بحسب تاريخ التركيب الفعلي.
              </p>
            </div>
            <Badge variant="secondary">
              {caseItem.prostheticEvents.filter((event) => event.status === "active").length}
            </Badge>
          </div>
          {caseItem.prostheticEvents.filter((event) => event.status === "active").length > 0 ? (
            <div className="space-y-2">
              {caseItem.prostheticEvents
                .filter((event) => event.status === "active")
                .map((event) => {
                  const implant = event.implantId
                    ? caseItem.implants.find((item) => item.id === event.implantId)
                    : null;
                  return (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                          {event.eventType}
                        </Badge>
                        <span className="font-semibold text-foreground">
                          {formatSaudiDate(event.eventDate)}
                        </span>
                        {implant && (
                          <span className="text-muted-foreground">
                            السن {implant.site}{implant.system ? ` — ${implant.system}` : ""}
                          </span>
                        )}
                        {canArchive && !isReadOnly && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                            onClick={() => setProstheticEventToArchive(event)}
                          >
                            <Archive className="h-3.5 w-3.5 ml-1" />
                            أرشفة السجل
                          </Button>
                        )}
                      </div>
                      {event.note && (
                        <p className="mt-1.5 text-muted-foreground leading-relaxed">{event.note}</p>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rounded-lg bg-muted/30 px-3 py-3">
              لا توجد تركيبات موثقة لهذه الحالة حتى الآن.
            </p>
          )}
        </div>

        {/* FDI chart */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-foreground">الإجراءات الجراحية المساندة</h4>
              <p className="text-xs text-muted-foreground mt-1">
                سجلات سريرية مستقلة لا تؤثر في الحسابات المالية.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {activeBoneGraftProcedures.length}
              </Badge>
              {!isReadOnly && (
                <Button size="sm" variant="outline" onClick={() => setBoneGraftProcedureDialog("new")}>
                  <Plus className="h-3.5 w-3.5 ml-1.5" />
                  إضافة إجراء
                </Button>
              )}
            </div>
          </div>
          {activeBoneGraftProcedures.length ? (
            <div className="space-y-2">
              {activeBoneGraftProcedures.map((item) => {
                const implant = item.implantId ? caseItem.implants.find((candidate) => candidate.id === item.implantId) : null;
                return <div key={item.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{item.procedureCategory}</Badge>
                    <span>{item.procedureType}</span>
                    <span className="font-semibold">{formatSaudiDate(item.procedureDate)}</span>
                    <Badge variant="secondary">{item.procedureStatus}</Badge>
                    {implant && <span className="text-muted-foreground">السن {implant.site}</span>}
                    {!isReadOnly && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 mr-auto" onClick={() => setBoneGraftProcedureDialog(item)}><Pencil className="h-3.5 w-3.5 ml-1" />تعديل</Button>}
                    {canArchive && !isReadOnly && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setBoneGraftProcedureToArchive(item)}><Archive className="h-3.5 w-3.5 ml-1" />أرشفة</Button>}
                  </div>
                  {(item.procedureSide || item.liftType || item.material || item.membrane || item.site || item.note) && <p className="mt-1.5 text-muted-foreground">{[item.procedureSide && `الجهة: ${item.procedureSide}`, item.liftType && `نوع الرفع: ${item.liftType}`, item.site && `الموضع: ${item.site}`, item.material && `المادة: ${item.material}`, item.membrane && `الغشاء: ${item.membrane}`, item.note].filter(Boolean).join(" — ")}</p>}
                </div>;
              })}
            </div>
          ) : <p className="text-sm text-muted-foreground rounded-lg bg-muted/30 px-3 py-3">لا توجد إجراءات جراحية مساندة موثقة لهذه الحالة.</p>}
        </div>

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
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
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
                <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
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
      <ProstheticEventDialog
        open={prostheticEventOpen}
        onOpenChange={setProstheticEventOpen}
        patientId={patientId}
        caseItem={caseItem}
      />
      {boneGraftProcedureDialog !== null && (
        <BoneGraftProcedureDialog
          key={boneGraftProcedureDialog === "new" ? "new" : boneGraftProcedureDialog.id}
          open
          onOpenChange={(open) => !open && setBoneGraftProcedureDialog(null)}
          patientId={patientId}
          caseItem={caseItem}
          procedure={boneGraftProcedureDialog === "new" ? null : boneGraftProcedureDialog}
        />
      )}
      <Dialog open={Boolean(boneGraftProcedureToArchive)} onOpenChange={(open) => !open && setBoneGraftProcedureToArchive(null)}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader><DialogTitle className="text-destructive">تأكيد أرشفة إجراء جراحي مساند</DialogTitle><DialogDescription className="text-right">سيبقى السجل محفوظًا للمراجعة، لكنه سيُستبعد من القوائم والمؤشرات النشطة.</DialogDescription></DialogHeader>
          <DialogFooter className="flex-row gap-3 sm:justify-start"><Button variant="destructive" onClick={handleArchiveBoneGraftProcedure} disabled={archiveBoneGraftProcedure.isPending}>{archiveBoneGraftProcedure.isPending ? "جارٍ الأرشفة..." : "أرشفة السجل"}</Button><Button variant="outline" onClick={() => setBoneGraftProcedureToArchive(null)}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(prostheticEventToArchive)}
        onOpenChange={(open) => !open && setProstheticEventToArchive(null)}
      >
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive">
              تأكيد أرشفة سجل التركيب
            </DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
              سيبقى السجل محفوظًا للمراجعة، لكنه لن يُحتسب ضمن ملخص العمل.
              هل تريد المتابعة؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-4">
            <Button
              onClick={handleArchiveProstheticEvent}
              disabled={archiveProstheticEvent.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiveProstheticEvent.isPending ? "جارٍ الأرشفة..." : "أرشفة السجل"}
            </Button>
            <Button
              variant="outline"
              className="btn-outline"
              onClick={() => setProstheticEventToArchive(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
