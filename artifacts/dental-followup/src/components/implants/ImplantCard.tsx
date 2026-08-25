import { useState } from "react";
import { Archive, Copy, Loader2, Pencil } from "lucide-react";
import { REIMPLANTABLE_STATUSES, type Implant } from "@workspace/shared";
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
import { useArchiveImplant } from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { localizeErrorMessage } from "@/lib/localize-error";

function formatSize(implant: Implant): string | null {
  if (implant.diameter == null && implant.length == null) return null;
  const d = implant.diameter == null ? "—" : String(implant.diameter);
  const l = implant.length == null ? "—" : String(implant.length);
  return `${d} × ${l} mm`;
}

function statusVariant(implant: Implant): string {
  if (implant.status === "archived") {
    return "bg-muted text-muted-foreground border-border";
  }
  if (
    (REIMPLANTABLE_STATUSES as readonly string[]).includes(
      implant.implantStatus,
    )
  ) {
    return "bg-destructive/10 text-destructive border-destructive/30";
  }
  return "bg-primary/10 text-primary border-primary/30";
}

interface ImplantCardProps {
  implant: Implant;
  patientId: string;
  /** Case archived or patient archived — hides all actions. */
  readOnly?: boolean;
  canArchive: boolean;
  onEdit: (implant: Implant) => void;
  onCopy: (implant: Implant) => void;
}

export function ImplantCard({
  implant,
  patientId,
  readOnly,
  canArchive,
  onEdit,
  onCopy,
}: ImplantCardProps) {
  const { t } = useClinicalTranslation();
  const { toast } = useToast();
  const archiveImplant = useArchiveImplant();
  const [showConfirm, setShowConfirm] = useState(false);
  const isArchived = implant.status === "archived";

  const handleArchive = () => {
    archiveImplant.mutate(
      { id: implant.id, patientId },
      {
        onSuccess: () => {
          toast({ title: t("implant.implantArchived") });
          setShowConfirm(false);
        },
        onError: (err: Error) =>
          toast({
            variant: "destructive",
             title: t("patient.error"),
             description: localizeErrorMessage(err),
          }),
      },
    );
  };

  const size = formatSize(implant);
  const detailRows: Array<[string, string | null]> = [
    ["System", implant.system],
    ["SIZE", size],
    ["Q", implant.qValue],
    ["Former", implant.formerValue],
    ["Graft", implant.graftValue],
  ];
  const graftIsPositive =
    Boolean(implant.graftValue) &&
    implant.graftValue!.trim().toUpperCase() !== "N";

  return (
    <div
      className={cn(
        "space-y-3 bg-background p-3 md:p-4",
        isArchived && "bg-muted/20 opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 font-bold text-primary">
            {implant.site}
          </div>
          <div>
            <p className="font-bold text-foreground leading-tight">
               {implant.system || t("implant.implant")}
            </p>
            <p className="text-xs text-muted-foreground">
               {t("implant.tooth", { site: implant.site })}
            </p>
          </div>
        </div>
        <Badge className={cn("border", statusVariant(implant))} variant="outline">
           {isArchived ? t("implant.archived") : implant.implantStatus}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm md:grid-cols-3 lg:grid-cols-5">
        {detailRows.map(([label, value]) =>
          value ? (
            <div key={label} className="flex justify-between gap-2 min-w-0">
              <dt className="text-muted-foreground shrink-0">{label}</dt>
              <dd className="font-semibold text-foreground truncate" dir="ltr">
                {value}
              </dd>
            </div>
          ) : null,
        )}
      </dl>

      {graftIsPositive && (implant.graftProcedureType || implant.graftNote) && (
        <div className="space-y-1 border-s-2 border-primary/20 ps-3 text-sm">
          {implant.graftProcedureType && (
            <p>
              <span className="text-muted-foreground">نوع إجراء الترقيع: </span>
              {implant.graftProcedureType}
            </p>
          )}
          {implant.graftNote && (
            <p>
              <span className="text-muted-foreground">ملاحظة الترقيع: </span>
              {implant.graftNote}
            </p>
          )}
        </div>
      )}

      {implant.procedureTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {implant.procedureTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {implant.implantNote && (
        <p className="border-t border-border pt-2 text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">NOTE: </span>
          {implant.implantNote}
        </p>
      )}

      {!readOnly && !isArchived && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            className="btn-outline h-9"
            onClick={() => onEdit(implant)}
          >
            <Pencil className="h-3.5 w-3.5 ms-1.5" />
               {t("implant.edit")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="btn-outline h-9"
            onClick={() => onCopy(implant)}
          >
            <Copy className="h-3.5 w-3.5 ms-1.5" />
               {t("implant.copyImplant")}
          </Button>
          {canArchive && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => setShowConfirm(true)}
            >
              <Archive className="h-3.5 w-3.5 ms-1.5" />
               {t("implant.archive")}
            </Button>
          )}
        </div>
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
         <DialogContent className="sm:max-w-md text-start" dir={document.documentElement.dir}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive">
               {t("implant.archiveImplantTitle")}
            </DialogTitle>
            <DialogDescription className="text-base text-foreground mt-4 leading-relaxed">
               {t("implant.archiveImplantDescription", { site: implant.site })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
            <Button
              onClick={handleArchive}
              disabled={archiveImplant.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto px-6 h-[46px] rounded-[10px]"
            >
              {archiveImplant.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                 <span>{t("implant.yesArchive")}</span>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              className="btn-outline w-full sm:w-auto"
            >
               {t("implant.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
