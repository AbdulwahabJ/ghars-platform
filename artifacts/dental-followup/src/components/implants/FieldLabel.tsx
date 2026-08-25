import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Neutral help texts for the preserved legacy field names — wording comes
 * from the specification and must stay neutral (values are stored as
 * entered, no clinical interpretation).
 */
export const FIELD_HELP = {
  System: "System", site: "site", SIZE: "SIZE", Q: "Q", Former: "Former", Graft: "Graft", Pros: "Pros",
} as const;

interface FieldLabelProps {
  htmlFor?: string;
  label: string;
  /** Legacy key into FIELD_HELP; renders an info tooltip when present. */
  helpKey?: keyof typeof FIELD_HELP;
}

export function FieldLabel({ htmlFor, label, helpKey }: FieldLabelProps) {
  const { t } = useClinicalTranslation();
  const help = helpKey ? t(`implant.fieldHelp.${FIELD_HELP[helpKey]}`) : undefined;
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className="font-semibold text-foreground">
        {label}
      </Label>
      {help && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                aria-label={t("implant.explainField", { label })}
                className="text-muted-foreground hover:text-primary"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent dir="rtl" className="max-w-[220px] text-right">
              {help}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
