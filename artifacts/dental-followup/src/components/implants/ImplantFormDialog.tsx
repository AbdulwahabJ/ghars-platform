import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  FDI_SITES,
  IMPLANT_STATUSES,
  REIMPLANTABLE_STATUSES,
  type Implant,
  type ImplantCaseWithImplants,
  type ImplantInput,
} from "@workspace/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldLabel } from "./FieldLabel";
import { SearchableCombobox } from "./SearchableCombobox";
import {
  useCreateImplant,
  useImplantOptions,
  useUpdateImplant,
} from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";

export type ImplantDialogMode = "add" | "edit" | "copy";

interface ImplantFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  caseItem: ImplantCaseWithImplants;
  mode: ImplantDialogMode;
  /** Source implant for edit/copy modes. */
  implant?: Implant | null;
  /** Pre-selected site (from the tooth chart) in add mode. */
  initialSite?: string;
}

export function ImplantFormDialog(props: ImplantFormDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl text-right max-h-[90vh] overflow-y-auto" dir="rtl">
        {/* The form mounts fresh on every open, so state initializers run each time. */}
        <ImplantForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ImplantForm({
  onOpenChange,
  patientId,
  caseItem,
  mode,
  implant,
  initialSite,
}: ImplantFormDialogProps) {
  const { toast } = useToast();
  const { t } = useClinicalTranslation();
  const { data: options } = useImplantOptions();
  const createImplant = useCreateImplant();
  const updateImplant = useUpdateImplant();

  const fromImplant = (mode === "edit" || mode === "copy") && implant;

  const [site, setSite] = useState(() =>
    fromImplant ? (mode === "copy" ? "" : implant.site) : (initialSite ?? ""),
  );
  const [system, setSystem] = useState<string | null>(() =>
    fromImplant ? implant.system : null,
  );
  const [diameter, setDiameter] = useState(() =>
    fromImplant && implant.diameter != null ? String(implant.diameter) : "",
  );
  const [length, setLength] = useState(() =>
    fromImplant && implant.length != null ? String(implant.length) : "",
  );
  const [qValue, setQValue] = useState<string | null>(() =>
    fromImplant ? implant.qValue : null,
  );
  const [formerValue, setFormerValue] = useState<string | null>(() =>
    fromImplant ? implant.formerValue : null,
  );
  const [graftValue, setGraftValue] = useState<string | null>(() =>
    fromImplant ? implant.graftValue : null,
  );
  const [graftProcedureType, setGraftProcedureType] = useState(() =>
    fromImplant ? (implant.graftProcedureType ?? "") : "",
  );
  const [graftNote, setGraftNote] = useState(() =>
    fromImplant ? (implant.graftNote ?? "") : "",
  );
  const [tags, setTags] = useState<string[]>(() =>
    fromImplant ? implant.procedureTags : [],
  );
  const [customTag, setCustomTag] = useState("");
  const [implantStatus, setImplantStatus] = useState<string>(() =>
    mode === "edit" && implant ? implant.implantStatus : "مزروعة",
  );
  const [implantNote, setImplantNote] = useState(() =>
    fromImplant ? (implant.implantNote ?? "") : "",
  );

  /** Sites already holding an active (non-failed, non-archived) implant. */
  const occupiedSites = useMemo(() => {
    const occupied = new Set<string>();
    for (const i of caseItem.implants) {
      if (i.status !== "active") continue;
      if (mode === "edit" && implant && i.id === implant.id) continue;
      if (
        !(REIMPLANTABLE_STATUSES as readonly string[]).includes(i.implantStatus)
      ) {
        occupied.add(i.site);
      }
    }
    return occupied;
  }, [caseItem.implants, mode, implant]);

  const graftIsPositive =
    Boolean(graftValue) && graftValue!.trim().toUpperCase() !== "N";

  const tagSuggestions = useMemo(() => {
    const base = options?.procedureTags ?? [];
    return Array.from(new Set([...base, ...tags]));
  }, [options?.procedureTags, tags]);

  const toggleTag = (tag: string) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const addCustomTag = () => {
    const t = customTag.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setCustomTag("");
  };

  const isPending = createImplant.isPending || updateImplant.isPending;

  const handleSubmit = () => {
    if (!site) {
       toast({ variant: "destructive", title: t("implant.chooseSiteFirst") });
      return;
    }
    const parseSize = (v: string): number | null => {
      if (!v.trim()) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return NaN as unknown as number;
      return Math.round(n * 100) / 100;
    };
    const d = parseSize(diameter);
    const l = parseSize(length);
    if ((d !== null && Number.isNaN(d)) || (l !== null && Number.isNaN(l))) {
      toast({
        variant: "destructive",
         title: t("implant.sizeError"),
         description: t("implant.sizeErrorDescription"),
      });
      return;
    }

    const payload: ImplantInput = {
      site,
      system: system?.trim() || null,
      diameter: d,
      length: l,
      qValue: qValue?.trim() || null,
      formerValue: formerValue?.trim() || null,
      graftValue: graftValue?.trim() || null,
      graftProcedureType: graftIsPositive
        ? graftProcedureType.trim() || null
        : null,
      graftNote: graftIsPositive ? graftNote.trim() || null : null,
      procedureTags: tags,
      implantStatus: implantStatus as ImplantInput["implantStatus"],
      implantNote: implantNote.trim() || null,
    };

    const onError = (err: Error) =>
      toast({
        variant: "destructive",
         title: t("patient.error"),
         description: err.message || t("implant.implantSaveFailed"),
      });

    if (mode === "edit" && implant) {
      updateImplant.mutate(
        { id: implant.id, patientId, data: payload },
        {
          onSuccess: () => {
             toast({ title: t("implant.implantSaved") });
            onOpenChange(false);
          },
          onError,
        },
      );
    } else {
      createImplant.mutate(
        { caseId: caseItem.id, patientId, data: payload },
        {
          onSuccess: () => {
             toast({ title: t("implant.implantCreated") });
            onOpenChange(false);
          },
          onError,
        },
      );
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold text-primary">
           {mode === "add" ? t("implant.addImplant") : mode === "edit" ? t("implant.editImplant") : t("implant.copyImplant")}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          {mode === "copy"
             ? t("implant.copyDescription")
             : t("implant.implantDescription")}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="space-y-2">
           <FieldLabel htmlFor="implant-site" label={t("implant.site")} helpKey="site" />
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger id="implant-site" className="h-[46px] rounded-[10px]">
               <SelectValue placeholder={t("implant.chooseTooth")} />
            </SelectTrigger>
            <SelectContent dir="rtl" className="max-h-64">
              {FDI_SITES.map((s) => (
                <SelectItem key={s} value={s} disabled={occupiedSites.has(s)}>
                  {s}
                   {occupiedSites.has(s) ? ` — ${t("implant.activeImplantExists")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
           <FieldLabel htmlFor="implant-system" label={t("implant.system")} helpKey="System" />
          <SearchableCombobox
            id="implant-system"
            value={system}
            onChange={setSystem}
            options={options?.systems ?? []}
             placeholder={t("implant.system")}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
           <FieldLabel label={t("implant.size")} helpKey="SIZE" />
          <div className="flex items-center gap-3" dir="ltr">
            <Input
               aria-label={t("implant.diameter")}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="3.5"
              value={diameter}
              onChange={(e) => setDiameter(e.target.value)}
              className="max-w-[120px] text-center"
            />
            <span className="text-muted-foreground font-semibold">×</span>
            <Input
               aria-label={t("implant.length")}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="10"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="max-w-[120px] text-center"
            />
            <span className="text-muted-foreground text-sm">mm</span>
          </div>
          <p className="text-xs text-muted-foreground">
             {t("implant.sizeHint")}
          </p>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="implant-q" label="Q" helpKey="Q" />
          <SearchableCombobox
            id="implant-q"
            value={qValue}
            onChange={setQValue}
            options={options?.qValues ?? []}
             placeholder={t("implant.chooseOrEnter")}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="implant-former" label="Former" helpKey="Former" />
          <SearchableCombobox
            id="implant-former"
            value={formerValue}
            onChange={setFormerValue}
            options={options?.formerValues ?? []}
             placeholder={t("implant.chooseOrEnter")}
          />
        </div>
        <div className="space-y-2">
           <FieldLabel htmlFor="implant-graft" label={t("implant.graft")} helpKey="Graft" />
          <SearchableCombobox
            id="implant-graft"
            value={graftValue}
            onChange={setGraftValue}
            options={options?.graftValues ?? []}
             placeholder={t("implant.chooseOrEnter")}
          />
        </div>
        <div className="space-y-2">
           <FieldLabel htmlFor="implant-status" label={t("implant.implantStatus")} />
          <Select value={implantStatus} onValueChange={setImplantStatus}>
            <SelectTrigger id="implant-status" className="h-[46px] rounded-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {IMPLANT_STATUSES.filter((s) => s !== "مؤرشفة").map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {graftIsPositive && (
          <>
            <div className="space-y-2">
               <FieldLabel htmlFor="implant-graft-type" label={t("implant.graftProcedureType")} />
              <Input
                id="implant-graft-type"
                value={graftProcedureType}
                onChange={(e) => setGraftProcedureType(e.target.value)}
                 placeholder={t("implant.optional")}
              />
            </div>
            <div className="space-y-2">
               <FieldLabel htmlFor="implant-graft-note" label={t("implant.graftNote")} />
              <Input
                id="implant-graft-note"
                value={graftNote}
                onChange={(e) => setGraftNote(e.target.value)}
                 placeholder={t("implant.optional")}
              />
            </div>
          </>
        )}

        <div className="space-y-2 md:col-span-2">
           <FieldLabel label={t("implant.procedureTags")} />
          <div className="flex flex-wrap gap-2">
            {tagSuggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-sm transition-colors",
                  tags.includes(tag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-primary",
                )}
                aria-pressed={tags.includes(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            <Input
               aria-label={t("implant.customTag")}
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomTag();
                }
              }}
               placeholder={t("implant.addCustomTag")}
              className="max-w-[240px]"
            />
            <Button type="button" variant="outline" onClick={addCustomTag} className="btn-outline">
              <Plus className="h-4 w-4 ml-1" />
               {t("implant.add")}
            </Button>
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
           <FieldLabel htmlFor="implant-note" label={t("implant.note")} />
          <Textarea
            id="implant-note"
            value={implantNote}
            onChange={(e) => setImplantNote(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <DialogFooter className="flex-row sm:justify-start gap-3 mt-6">
        <Button onClick={handleSubmit} disabled={isPending} className="btn-primary w-full sm:w-auto">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
             <span>{mode === "edit" ? t("implant.saveChanges") : t("implant.saveImplant")}</span>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
          className="btn-outline w-full sm:w-auto"
        >
           {t("implant.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
