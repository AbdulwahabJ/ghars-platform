import { useState } from "react";
import type {
  BoneGraftProcedure,
  BoneGraftProcedureInput,
  Implant,
  ImplantCaseWithImplants,
} from "@workspace/shared";
import {
  ADJUNCT_PROCEDURE_CATEGORIES,
  PROCEDURE_SIDES,
  SINUS_LIFT_TYPES,
} from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OperationalDatePicker, todayInRiyadh } from "@/components/dashboard/OperationalDatePicker";
import { FieldLabel } from "./FieldLabel";
import { useCreateBoneGraftProcedure, useImplantOptions, useUpdateBoneGraftProcedure } from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";
import { localizeErrorMessage } from "@/lib/localize-error";

const CASE_LEVEL = "__case_level__";

export function BoneGraftProcedureDialog({
  open, onOpenChange, patientId, caseItem, procedure, onSuccess,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; patientId: string;
  caseItem: ImplantCaseWithImplants; procedure?: BoneGraftProcedure | null; onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const { t } = useClinicalTranslation();
  const { data: options } = useImplantOptions();
  const createProcedure = useCreateBoneGraftProcedure();
  const updateProcedure = useUpdateBoneGraftProcedure();
  const activeImplants = caseItem.implants.filter((implant) => implant.status === "active");
  const isEditing = Boolean(procedure);
  const [procedureDate, setProcedureDate] = useState(procedure?.procedureDate ?? todayInRiyadh);
  const [procedureCategory, setProcedureCategory] = useState<BoneGraftProcedureInput["procedureCategory"]>(procedure?.procedureCategory ?? "زراعة عظم");
  const [procedureType, setProcedureType] = useState(procedure?.procedureType ?? "");
  const [procedureSide, setProcedureSide] = useState(procedure?.procedureSide ?? "");
  const [liftType, setLiftType] = useState(procedure?.liftType ?? "");
  const [implantId, setImplantId] = useState(procedure?.implantId ?? CASE_LEVEL);
  const [site, setSite] = useState(procedure?.site ?? "");
  const [material, setMaterial] = useState(procedure?.material ?? "");
  const [membrane, setMembrane] = useState(procedure?.membrane ?? "");
  const [quantity, setQuantity] = useState(procedure?.quantity ?? "");
  const [size, setSize] = useState(procedure?.size ?? "");
  const [treatingDoctor, setTreatingDoctor] = useState(procedure?.treatingDoctor ?? caseItem.treatingDoctor);
  const [procedureStatus, setProcedureStatus] = useState(procedure?.procedureStatus ?? "مخطط");
  const [note, setNote] = useState(procedure?.note ?? "");
  const needsSide = procedureCategory !== "زراعة عظم";
  const isBoneGraft = procedureCategory === "زراعة عظم";

  const changeCategory = (value: BoneGraftProcedureInput["procedureCategory"]) => {
    setProcedureCategory(value);
    setProcedureSide("");
    setLiftType("");
    if (value !== "زراعة عظم") {
      setMaterial("");
      setMembrane("");
      setQuantity("");
      setSize("");
    }
  };
  const submit = () => {
    if (!procedureDate || !procedureType.trim() || !treatingDoctor.trim() || (needsSide && !procedureSide)) {
       toast({ variant: "destructive", title: t("implant.adjunctValidation") });
      return;
    }
    const data: BoneGraftProcedureInput = {
      implantId: implantId === CASE_LEVEL ? null : implantId, procedureDate, procedureCategory,
      procedureType: procedureType.trim(), procedureSide: needsSide ? procedureSide as "يمين" | "يسار" : null,
      liftType: procedureCategory === "رفع الجيب الفكي" ? liftType || null : null,
      site: site || null, material: isBoneGraft ? material || null : null,
      membrane: isBoneGraft ? membrane || null : null, quantity: isBoneGraft ? quantity || null : null,
      size: isBoneGraft ? size || null : null, treatingDoctor, procedureStatus, note: note || null,
    };
    const callbacks = {
      onSuccess: () => {
         toast({ title: isEditing ? t("implant.adjunctSaved") : t("implant.adjunctCreated") });
        onSuccess?.(); onOpenChange(false);
      },
       onError: (error: Error) => toast({ variant: "destructive", title: isEditing ? t("implant.adjunctUpdateFailed") : t("implant.adjunctSaveFailed"), description: localizeErrorMessage(error) }),
    };
    if (isEditing) updateProcedure.mutate({ id: procedure!.id, patientId, data }, callbacks);
    else createProcedure.mutate({ caseId: caseItem.id, patientId, data }, callbacks);
  };
  const isPending = createProcedure.isPending || updateProcedure.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg text-start">
        <DialogHeader className="text-start">
           <DialogTitle>{isEditing ? t("implant.adjunctEdit") : t("implant.adjunctAdd")}</DialogTitle>
           <DialogDescription className="text-start">{t("implant.adjunctFormDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 sm:grid-cols-2">
           <div className="space-y-1.5"><FieldLabel label={t("implant.procedureDate")} /><OperationalDatePicker value={procedureDate} onChange={setProcedureDate} /></div>
           <div className="space-y-1.5"><FieldLabel label={`${t("implant.procedureCategory")} *`} /><Select value={procedureCategory} onValueChange={(value) => changeCategory(value as BoneGraftProcedureInput["procedureCategory"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ADJUNCT_PROCEDURE_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
           {needsSide && <div className="space-y-1.5"><FieldLabel label={`${t("implant.procedureSide")} *`} /><Select value={procedureSide} onValueChange={setProcedureSide}><SelectTrigger><SelectValue placeholder={t("implant.choose")} /></SelectTrigger><SelectContent>{PROCEDURE_SIDES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>}
           {procedureCategory === "رفع الجيب الفكي" && <div className="space-y-1.5"><FieldLabel label={`${t("implant.graftProcedureType")} (${t("implant.optional")})`} /><Select value={liftType || "__none__"} onValueChange={(value) => setLiftType(value === "__none__" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">{t("implant.unspecified")}</SelectItem>{SINUS_LIFT_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>}
           <div className="space-y-1.5"><FieldLabel label={t("implant.relatedImplant")} /><Select value={implantId} onValueChange={setImplantId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={CASE_LEVEL}>{t("implant.caseLevelProcedure")}</SelectItem>{activeImplants.map((implant: Implant) => <SelectItem key={implant.id} value={implant.id}>{t("implant.tooth", { site: implant.site })}{implant.system ? ` — ${implant.system}` : ""}</SelectItem>)}</SelectContent></Select></div>
           <div className="space-y-1.5"><FieldLabel label={`${t("implant.procedureDescription")} *`} /><Input value={procedureType} onChange={(event) => setProcedureType(event.target.value)} placeholder={t("implant.clinicalDescription")} /></div>
           <div className="space-y-1.5"><FieldLabel label={`${t("implant.procedureSite")} (${t("implant.optional")})`} /><Input value={site} onChange={(event) => setSite(event.target.value)} /></div>
           {isBoneGraft && <><div className="space-y-1.5"><FieldLabel label={`${t("implant.material")} (${t("implant.optional")})`} /><Input value={material} onChange={(event) => setMaterial(event.target.value)} /></div><div className="space-y-1.5"><FieldLabel label={`${t("implant.membrane")} (${t("implant.optional")})`} /><Input value={membrane} onChange={(event) => setMembrane(event.target.value)} /></div><div className="space-y-1.5"><FieldLabel label={`${t("implant.quantity")} (${t("implant.optional")})`} /><Input value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="space-y-1.5"><FieldLabel label={`SIZE (${t("implant.optional")})`} /><Input value={size} onChange={(event) => setSize(event.target.value)} /></div></>}
           <div className="space-y-1.5"><FieldLabel label={`${t("implant.treatingDoctor")} *`} /><Input value={treatingDoctor} onChange={(event) => setTreatingDoctor(event.target.value)} /></div>
           <div className="space-y-1.5"><FieldLabel label={t("implant.procedureStatus")} /><Input value={procedureStatus} onChange={(event) => setProcedureStatus(event.target.value)} /></div>
           <div className="space-y-1.5 sm:col-span-2"><FieldLabel label={t("implant.prostheticNote")} /><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></div>
        </div>
         <DialogFooter className="flex-row gap-3 sm:justify-start"><Button className="btn-primary" onClick={submit} disabled={isPending}>{isPending ? t("implant.savingRecord") : t("implant.save")}</Button><Button variant="outline" onClick={() => onOpenChange(false)}>{t("implant.cancel")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}