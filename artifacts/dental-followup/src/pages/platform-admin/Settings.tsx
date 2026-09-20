import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save, Settings2 } from "lucide-react";
import { updatePlatformSettingsInputSchema } from "@workspace/shared";
import { usePlatformSettings, usePlatformUpdateSettings } from "@/hooks/use-platform-admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const { t } = useTranslation("commercial");
  const { data, isLoading, isError } = usePlatformSettings();
  const update = usePlatformUpdateSettings();
  const [form, setForm] = useState({ supportWhatsapp: "", supportPhone: "", supportEmail: "", defaultTrialHours: "72", legacyImportEnabled: false });
  useEffect(() => {
    if (data?.settings) setForm({
      supportWhatsapp: data.settings.supportWhatsapp ?? "",
      supportPhone: data.settings.supportPhone ?? "",
      supportEmail: data.settings.supportEmail ?? "",
      defaultTrialHours: String(data.settings.defaultTrialHours),
      legacyImportEnabled: data.settings.legacyImportEnabled ?? false,
    });
  }, [data]);
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (isError) return <div className="p-10 text-center text-slate-500">{t("platformAdmin.loadError")}</div>;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const parsed = updatePlatformSettingsInputSchema.safeParse({
    supportWhatsapp: form.supportWhatsapp,
    supportPhone: form.supportPhone,
    supportEmail: form.supportEmail,
    defaultTrialHours: Number(form.defaultTrialHours),
    legacyImportEnabled: form.legacyImportEnabled,
  });
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3"><Settings2 className="h-6 w-6 text-slate-600" /><h2 className="text-2xl font-bold text-brand-navy">{t("platformAdmin.nav.settings")}</h2></div>
      <form noValidate className="space-y-6" onSubmit={(event) => { event.preventDefault(); if (parsed.success) update.mutate(parsed.data); }}>
        <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("platformAdmin.settings.supportWhatsapp")}><Input dir="ltr" value={form.supportWhatsapp} onChange={(e) => set("supportWhatsapp", e.target.value)} /></Field>
            <Field label={t("platformAdmin.settings.supportPhone")}><Input dir="ltr" value={form.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} /></Field>
            <Field label={t("platformAdmin.settings.supportEmail")}><Input dir="ltr" type="email" value={form.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} /></Field>
            <Field label={t("platformAdmin.settings.defaultTrialHours")}><Input dir="ltr" type="number" min={1} max={720} value={form.defaultTrialHours} onChange={(e) => set("defaultTrialHours", e.target.value)} /></Field>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-semibold text-brand-navy">{t("platformAdmin.settings.featureControls")}</h3>
          <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
            <div className="space-y-0.5">
              <label className="text-base font-medium text-slate-900">{t("platformAdmin.settings.legacyImport")}</label>
              <p className="text-sm text-slate-500">
                {t("platformAdmin.settings.legacyImportDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">
                {form.legacyImportEnabled
                  ? t("platformAdmin.settings.legacyImportEnabled")
                  : t("platformAdmin.settings.legacyImportDisabled")}
              </span>
              <Switch checked={form.legacyImportEnabled} onCheckedChange={(checked) => set("legacyImportEnabled", checked)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            {!parsed.success && <p className="text-sm text-red-600">{t("platformAdmin.settings.validationError")}</p>}
            {update.isError && <p className="text-sm text-red-600">{t("platformAdmin.settings.saveError")}</p>}
            {update.isSuccess && <p className="text-sm text-emerald-700">{t("platformAdmin.settings.saved")}</p>}
          </div>
          <Button type="submit" disabled={update.isPending || !parsed.success}><Save className="me-2 h-4 w-4" />{t("common:actions.save")}</Button>
        </div>
      </form>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-2 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>; }