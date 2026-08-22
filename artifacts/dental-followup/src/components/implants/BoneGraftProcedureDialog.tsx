import { useState } from "react";
import type {
  BoneGraftProcedure,
  BoneGraftProcedureInput,
  Implant,
  ImplantCaseWithImplants,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  OperationalDatePicker,
  todayInRiyadh,
} from "@/components/dashboard/OperationalDatePicker";
import { FieldLabel } from "./FieldLabel";
import {
  useCreateBoneGraftProcedure,
  useImplantOptions,
  useUpdateBoneGraftProcedure,
} from "@/hooks/use-implant-cases";
import { useToast } from "@/hooks/use-toast";

const CASE_LEVEL = "__case_level__";

export function BoneGraftProcedureDialog({
  open,
  onOpenChange,
  patientId,
  caseItem,
  procedure,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  caseItem: ImplantCaseWithImplants;
  procedure?: BoneGraftProcedure | null;
  onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const { data: options } = useImplantOptions();
  const createProcedure = useCreateBoneGraftProcedure();
  const updateProcedure = useUpdateBoneGraftProcedure();
  const activeImplants = caseItem.implants.filter(
    (implant) => implant.status === "active",
  );
  const isEditing = Boolean(procedure);
  const [procedureDate, setProcedureDate] = useState(procedure?.procedureDate ?? todayInRiyadh);
  const [procedureType, setProcedureType] = useState(procedure?.procedureType ?? "");
  const [implantId, setImplantId] = useState(procedure?.implantId ?? CASE_LEVEL);
  const [site, setSite] = useState(procedure?.site ?? "");
  const [material, setMaterial] = useState(procedure?.material ?? "");
  const [membrane, setMembrane] = useState(procedure?.membrane ?? "");
  const [quantity, setQuantity] = useState(procedure?.quantity ?? "");
  const [size, setSize] = useState(procedure?.size ?? "");
  const [treatingDoctor, setTreatingDoctor] = useState(procedure?.treatingDoctor ?? caseItem.treatingDoctor);
  const [procedureStatus, setProcedureStatus] = useState(procedure?.procedureStatus ?? "مخطط");
  const [note, setNote] = useState(procedure?.note ?? "");

  const submit = () => {
    if (!procedureDate || !procedureType.trim() || !treatingDoctor.trim()) {
      toast({
        variant: "destructive",
        title: "أدخل التاريخ والنوع والطبيب المعالج.",
      });
      return;
    }
    const data: BoneGraftProcedureInput = {
      implantId: implantId === CASE_LEVEL ? null : implantId,
      procedureDate,
      procedureType,
      site: site || null,
      material: material || null,
      membrane: membrane || null,
      quantity: quantity || null,
      size: size || null,
      treatingDoctor,
      procedureStatus,
      note: note || null,
    };
    const mutation = isEditing
      ? updateProcedure.mutate(
          { id: procedure!.id, patientId, data },
          {
            onSuccess: () => {
              toast({ title: "تم تعديل سجل زراعة العظم" });
              onSuccess?.();
              onOpenChange(false);
            },
            onError: (error: Error) =>
              toast({
                variant: "destructive",
                title: "تعذر تعديل السجل",
                description: error.message,
              }),
          },
        )
      : createProcedure.mutate(
          { caseId: caseItem.id, patientId, data },
          {
            onSuccess: () => {
              toast({ title: "تم توثيق إجراء زراعة العظم" });
              onSuccess?.();
              onOpenChange(false);
            },
            onError: (error: Error) =>
              toast({
                variant: "destructive",
                title: "تعذر توثيق الإجراء",
                description: error.message,
              }),
          },
        );
    void mutation;
  };
  const isPending = createProcedure.isPending || updateProcedure.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg text-right" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>{isEditing ? "تعديل إجراء زراعة العظم" : "إضافة إجراء زراعة عظم"}</DialogTitle>
          <DialogDescription className="text-right">
            سجل سريري مستقل؛ لا يغير إجمالي العلاج أو التحصيل.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <div className="space-y-1.5"><FieldLabel label="تاريخ الإجراء" /><OperationalDatePicker value={procedureDate} onChange={setProcedureDate} /></div>
          <div className="space-y-1.5"><FieldLabel label="نوع الإجراء" /><Select value={procedureType} onValueChange={setProcedureType}><SelectTrigger><SelectValue placeholder="اختر أو أدخل من القائمة" /></SelectTrigger><SelectContent dir="rtl">{options?.boneGraftProcedureTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Input className="mt-1" value={procedureType} onChange={(event) => setProcedureType(event.target.value)} placeholder="نوع مخصص" /></div>
          <div className="space-y-1.5"><FieldLabel label="الزرعة المرتبطة (اختياري)" /><Select value={implantId} onValueChange={setImplantId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent dir="rtl"><SelectItem value={CASE_LEVEL}>إجراء للحالة كاملة</SelectItem>{activeImplants.map((implant: Implant) => <SelectItem key={implant.id} value={implant.id}>السن {implant.site}{implant.system ? ` — ${implant.system}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><FieldLabel label="الموضع (اختياري)" /><Input value={site} onChange={(event) => setSite(event.target.value)} /></div>
          <div className="space-y-1.5"><FieldLabel label="المادة (اختياري)" /><Select value={material || "__none__"} onValueChange={(value) => setMaterial(value === "__none__" ? "" : value)}><SelectTrigger><SelectValue placeholder="اختر المادة" /></SelectTrigger><SelectContent dir="rtl"><SelectItem value="__none__">غير محدد</SelectItem>{options?.boneGraftMaterials.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><FieldLabel label="الغشاء (اختياري)" /><Select value={membrane || "__none__"} onValueChange={(value) => setMembrane(value === "__none__" ? "" : value)}><SelectTrigger><SelectValue placeholder="اختر الغشاء" /></SelectTrigger><SelectContent dir="rtl"><SelectItem value="__none__">بدون غشاء محدد</SelectItem>{options?.boneGraftMembranes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><FieldLabel label="الكمية (اختياري)" /><Input value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className="space-y-1.5"><FieldLabel label="المقاس (اختياري)" /><Input value={size} onChange={(event) => setSize(event.target.value)} /></div>
          <div className="space-y-1.5"><FieldLabel label="الطبيب المعالج" /><Input value={treatingDoctor} onChange={(event) => setTreatingDoctor(event.target.value)} /></div>
          <div className="space-y-1.5"><FieldLabel label="حالة الإجراء" /><Select value={procedureStatus} onValueChange={setProcedureStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent dir="rtl">{(options?.boneGraftStatuses ?? ["مخطط", "تم", "ملغى"]).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><FieldLabel label="ملاحظة (اختيارية)" /><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></div>
        </div>
        <DialogFooter className="flex-row gap-3 sm:justify-start">
          <Button className="btn-primary" onClick={submit} disabled={isPending}>{isPending ? "جارٍ الحفظ..." : "حفظ"}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}