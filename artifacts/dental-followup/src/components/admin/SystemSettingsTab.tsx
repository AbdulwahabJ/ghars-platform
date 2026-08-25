import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAppSettings } from "@/hooks/use-settings";
import { useUpdateAppSettings } from "@/hooks/use-admin";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

const MAX_LOGO_BYTES = 500 * 1024;

export function SystemSettingsTab() {
  const { settings, isLoading } = useAppSettings();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // The form is mounted only after settings load, so its initial state can
  // be derived once in useState initializers (no setState-in-effect).
  return <SettingsForm settings={settings} />;
}

function SettingsForm({
  settings,
}: {
  settings: ReturnType<typeof useAppSettings>["settings"];
}) {
  const updateSettings = useUpdateAppSettings();
  const { toast } = useToast();
  const { t } = useTranslation("admin");
  const fileRef = useRef<HTMLInputElement>(null);

  const assignableQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => api.getAssignableUsers(),
  });

  const [form, setForm] = useState(() => ({
    clinicName: settings.clinicName,
    systemName: settings.systemName,
    defaultTreatingDoctor: settings.defaultTreatingDoctor,
    clinicPhone: settings.clinicPhone ?? "",
    clinicAddress: settings.clinicAddress ?? "",
    defaultProsValue: settings.defaultProsValue ?? "",
    defaultFollowupAssigneeUserId:
      settings.defaultFollowupAssigneeUserId ?? "none",
    clinicLogo: settings.clinicLogo as string | null,
  }));

  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast({
        variant: "destructive",
        title: t("settings.logoFormatUnsupportedTitle"),
        description: t("settings.logoFormatUnsupportedDescription"),
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({
        variant: "destructive",
        title: t("settings.logoTooLargeTitle"),
        description: t("settings.logoTooLargeDescription"),
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setForm((f) => ({ ...f, clinicLogo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const save = () => {
    updateSettings.mutate(
      {
        clinicName: form.clinicName,
        systemName: form.systemName,
        defaultTreatingDoctor: form.defaultTreatingDoctor,
        clinicPhone: form.clinicPhone.trim() || null,
        clinicAddress: form.clinicAddress.trim() || null,
        defaultProsValue: form.defaultProsValue.trim() || null,
        defaultFollowupAssigneeUserId:
          form.defaultFollowupAssigneeUserId === "none"
            ? null
            : form.defaultFollowupAssigneeUserId,
        clinicLogo: form.clinicLogo,
      },
      {
        onSuccess: () => toast({ title: t("settings.saveSuccess") }),
        onError: (err) =>
          toast({
            variant: "destructive",
            title: t("settings.saveFailed"),
            description: localizeErrorMessage(err),
          }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات النظام</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="set-clinic-name">اسم العيادة</Label>
            <Input
              id="set-clinic-name"
              value={form.clinicName}
              onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
              data-testid="input-clinic-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-system-name">اسم النظام (في الترويسة)</Label>
            <Input
              id="set-system-name"
              value={form.systemName}
              onChange={(e) => setForm({ ...form, systemName: e.target.value })}
              data-testid="input-system-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-doctor">الطبيب المعالج الافتراضي</Label>
            <Input
              id="set-doctor"
              value={form.defaultTreatingDoctor}
              onChange={(e) =>
                setForm({ ...form, defaultTreatingDoctor: e.target.value })
              }
              data-testid="input-default-doctor"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-phone">هاتف العيادة (اختياري)</Label>
            <Input
              id="set-phone"
              dir="ltr"
              value={form.clinicPhone}
              onChange={(e) => setForm({ ...form, clinicPhone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-pros">قيمة Pros الافتراضية (اختياري)</Label>
            <Input
              id="set-pros"
              value={form.defaultProsValue}
              onChange={(e) =>
                setForm({ ...form, defaultProsValue: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>المسؤول الافتراضي عن المتابعات (اختياري)</Label>
            <Select
              value={form.defaultFollowupAssigneeUserId}
              onValueChange={(v) =>
                setForm({ ...form, defaultFollowupAssigneeUserId: v })
              }
            >
              <SelectTrigger data-testid="select-default-assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون افتراضي</SelectItem>
                {(assignableQuery.data?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="set-address">عنوان العيادة (اختياري)</Label>
          <Textarea
            id="set-address"
            rows={2}
            value={form.clinicAddress}
            onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })}
          />
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <Label>شعار العيادة</Label>
          <div className="flex items-center gap-4">
            {form.clinicLogo ? (
              <img
                src={form.clinicLogo}
                alt="شعار العيادة"
                className="h-14 w-auto object-contain border border-border rounded p-1 bg-white"
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                الشعار الافتراضي مستخدم حاليًا.
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onPickLogo(e.target.files?.[0])}
              data-testid="input-logo-file"
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 ms-1" />
              <span>رفع شعار</span>
            </Button>
            {form.clinicLogo && (
              <Button
                variant="ghost"
                onClick={() => setForm({ ...form, clinicLogo: null })}
              >
                <X className="h-4 w-4 ms-1" />
                <span>إزالة الشعار</span>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG أو JPEG أو WebP بحد أقصى 500 كيلوبايت.
          </p>
        </div>

        <Button
          onClick={save}
          disabled={updateSettings.isPending}
          data-testid="button-save-settings"
        >
          {updateSettings.isPending && (
            <Loader2 className="h-4 w-4 animate-spin ms-1" />
          )}
          <span>حفظ الإعدادات</span>
        </Button>
      </CardContent>
    </Card>
  );
}
