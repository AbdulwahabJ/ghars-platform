import {
  FDI_LOWER_ROW,
  FDI_UPPER_ROW,
  REIMPLANTABLE_STATUSES,
  type Implant,
} from "@workspace/shared";
import { cn } from "@/lib/utils";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";

type ToothState = "empty" | "active" | "reimplantable" | "archivedOnly";

function siteState(implants: Implant[], site: string): ToothState {
  const atSite = implants.filter((i) => i.site === site);
  if (atSite.length === 0) return "empty";
  const active = atSite.filter((i) => i.status === "active");
  if (active.length === 0) return "archivedOnly";
  if (
    active.some(
      (i) =>
        !(REIMPLANTABLE_STATUSES as readonly string[]).includes(
          i.implantStatus,
        ),
    )
  ) {
    return "active";
  }
  return "reimplantable";
}

const TOOTH_STYLES: Record<ToothState, string> = {
  empty:
    "bg-background text-foreground border-border hover:border-primary hover:text-primary",
  active: "bg-primary text-primary-foreground border-primary",
  reimplantable: "bg-destructive/10 text-destructive border-destructive/40",
  archivedOnly: "bg-muted text-muted-foreground border-border",
};

interface FdiToothChartProps {
  implants: Implant[];
  onToothClick?: (site: string, state: ToothState) => void;
  disabled?: boolean;
}

/**
 * Interactive FDI chart. Rendered LTR exactly as specified:
 * upper 18…11 | 21…28, lower 48…41 | 31…38.
 */
export function FdiToothChart({
  implants,
  onToothClick,
  disabled,
}: FdiToothChartProps) {
  const { t } = useClinicalTranslation();
  const renderRow = (row: readonly string[], rowLabel: string) => (
    <div className="flex items-center justify-center gap-[3px]" role="row" aria-label={rowLabel}>
      {row.map((site, index) => {
        const state = siteState(implants, site);
        return (
          <span key={site} className="flex items-center gap-[3px]">
            {index === 8 && (
              <span className="w-px h-8 bg-border mx-1" aria-hidden="true" />
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToothClick?.(site, state)}
               aria-label={t("implant.toothAria", { site })}
              className={cn(
                "h-8 w-8 md:h-9 md:w-9 rounded-lg border text-[11px] md:text-xs font-bold transition-colors disabled:opacity-60 disabled:pointer-events-none",
                TOOTH_STYLES[state],
              )}
            >
              {site}
            </button>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <div dir="ltr" className="overflow-x-auto pb-1">
        <div className="min-w-[560px] space-y-2 py-1">
          {renderRow(FDI_UPPER_ROW, t("implant.upperJaw"))}
          {renderRow(FDI_LOWER_ROW, t("implant.lowerJaw"))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary inline-block" /> {t("implant.chartActive")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-destructive/20 border border-destructive/40 inline-block" /> {t("implant.chartReimplantable")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-muted border border-border inline-block" /> {t("implant.chartArchived")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-background border border-border inline-block" /> {t("implant.chartEmpty")}
        </span>
      </div>
    </div>
  );
}
