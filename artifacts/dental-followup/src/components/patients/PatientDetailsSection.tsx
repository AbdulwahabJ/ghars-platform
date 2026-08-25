import { useState } from "react";
import { Archive, Loader2, Pencil, RefreshCw, Save, X } from "lucide-react";
import type { Patient, PatientUpdate } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdatePatient } from "@/hooks/use-patients";
import { useToast } from "@/hooks/use-toast";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";

interface PatientDetailsSectionProps {
  patient: Patient;
  canArchive: boolean;
  onArchive: () => void;
  onRestore: () => void;
  isRestoring: boolean;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground notranslate">{children || "—"}</dd>
    </div>
  );
}

export function PatientDetailsSection({
  patient,
  canArchive,
  onArchive,
  onRestore,
  isRestoring,
}: PatientDetailsSectionProps) {
  const { t } = useClinicalTranslation();
  const { toast } = useToast();
  const updatePatient = useUpdatePatient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<PatientUpdate>({});

  const archived = patient.status === "archived";
  const startEditing = () => {
    setFormData({
      fileNumber: patient.fileNumber,
      fullName: patient.fullName,
      mobileNumber: patient.mobileNumber,
      age: patient.age,
      administrativeNote: patient.administrativeNote,
    });
    setIsEditing(true);
  };
  const save = () => {
    updatePatient.mutate(
      { id: patient.id, data: formData },
      {
        onSuccess: () => {
          toast({ title: t("patient.saved") });
          setIsEditing(false);
        },
        onError: (error: Error) =>
          toast({
            variant: "destructive",
            title: t("patient.saveFailed"),
            description: error.message || t("patient.retry"),
          }),
      },
    );
  };

  const cancel = () => {
    setFormData({
      fileNumber: patient.fileNumber,
      fullName: patient.fullName,
      mobileNumber: patient.mobileNumber,
      age: patient.age,
      administrativeNote: patient.administrativeNote,
    });
    setIsEditing(false);
  };

  return (
    <section id="patient-details" className="scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
           <h2 className="text-lg font-bold text-foreground">{t("patient.data")}</h2>
           <p className="text-sm text-muted-foreground">{t("patient.detailsDescription")}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {!archived && !isEditing ? (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 ms-1.5" />
               {t("patient.edit")}
            </Button>
          ) : null}
          {archived ? (
            <Button size="sm" onClick={onRestore} disabled={isRestoring}>
              {isRestoring ? <Loader2 className="h-4 w-4 animate-spin ms-1.5" /> : <RefreshCw className="h-4 w-4 ms-1.5" />}
               {t("patient.restore")}
            </Button>
          ) : canArchive && !isEditing ? (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onArchive}>
              <Archive className="h-4 w-4 ms-1.5" />
               {t("patient.archive")}
            </Button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 print:hidden">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
               {t("patient.fileNumber")}
              <Input
                dir="ltr"
                value={formData.fileNumber ?? ""}
                onChange={(event) => setFormData((current) => ({ ...current, fileNumber: event.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
               {t("patient.fullName")}
              <Input
                value={formData.fullName ?? ""}
                onChange={(event) => setFormData((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
               {t("patient.mobile")}
              <Input
                dir="ltr"
                value={formData.mobileNumber ?? ""}
                onChange={(event) => setFormData((current) => ({ ...current, mobileNumber: event.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
               {t("patient.age")}
              <Input
                type="number"
                min={0}
                value={formData.age ?? ""}
                onChange={(event) => setFormData((current) => ({
                  ...current,
                  age: event.target.value === "" ? null : Number(event.target.value),
                }))}
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
             {t("patient.administrativeNote")}
            <Textarea
              rows={3}
              value={formData.administrativeNote ?? ""}
              onChange={(event) => setFormData((current) => ({ ...current, administrativeNote: event.target.value }))}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={updatePatient.isPending}>
              {updatePatient.isPending ? <Loader2 className="h-4 w-4 animate-spin ms-1.5" /> : <Save className="h-4 w-4 ms-1.5" />}
               {t("patient.save")}
            </Button>
            <Button size="sm" variant="outline" onClick={cancel} disabled={updatePatient.isPending}>
              <X className="h-4 w-4 ms-1.5" />
               {t("patient.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
           <Detail label={t("patient.fullName")}>{patient.fullName}</Detail>
           <Detail label={t("patient.fileNumber")}><span dir="ltr">{patient.fileNumber}</span></Detail>
           <Detail label={t("patient.mobile")}><span dir="ltr">{patient.mobileNumber ?? "—"}</span></Detail>
           <Detail label={t("patient.age")}>{patient.age != null ? t("patient.years", { count: patient.age }) : "—"}</Detail>
           <Detail label={t("patient.administrativeNote")}>{patient.administrativeNote ?? "—"}</Detail>
        </dl>
      )}
    </section>
  );
}