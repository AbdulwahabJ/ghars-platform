import { useTranslation } from "react-i18next";
import type { Implant } from "@workspace/shared";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ImmediatePlacement = Implant["immediatePlacement"];

export function ImmediatePlacementField({
  id,
  value,
  onChange,
  compact = false,
}: {
  id: string;
  value: ImmediatePlacement;
  onChange: (value: ImmediatePlacement) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation("clinical");

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{t("implant.immediate")}</Label>
      <Select dir={i18n.dir()} value={value ?? "UNSPECIFIED"} onValueChange={(next: ImmediatePlacement) => onChange(next)}>
        <SelectTrigger id={id} className={compact ? "h-7 text-xs" : "h-8 text-sm"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="UNSPECIFIED">{t("implant.immediateUnspecified")}</SelectItem>
          <SelectItem value="YES">{t("implant.immediateYes")}</SelectItem>
          <SelectItem value="NO">{t("implant.immediateNo")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}