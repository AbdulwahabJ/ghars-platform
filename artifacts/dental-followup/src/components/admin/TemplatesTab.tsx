import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  TEMPLATE_PLACEHOLDERS,
  TEMPLATE_PLACEHOLDER_LABELS,
  findUnknownPlaceholders,
  renderTemplate,
  type AdminTemplate,
} from "@workspace/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminTemplates,
  useAdminTemplateMutations,
} from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";

const SAMPLE = {
  patientName: "محمد أحمد",
  date: "1447/02/15هـ الموافق 2025/09/07",
  time: "10:30 صباحًا",
};

export function TemplatesTab() {
  const { data, isLoading } = useAdminTemplates();
  const { update, setActive } = useAdminTemplateMutations();
  const { toast } = useToast();

  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const unknown = editing ? findUnknownPlaceholders(body) : [];

  const fail = (err: unknown) =>
    toast({
      variant: "destructive",
      title: "تعذر تنفيذ العملية",
      description: err instanceof ApiError ? err.message : "حدث خطأ غير متوقع.",
    });

  const save = () => {
    if (!editing) return;
    update.mutate(
      { id: editing.id, input: { name, body } },
      {
        onSuccess: () => {
          toast({ title: "تم حفظ القالب." });
          setEditing(null);
        },
        onError: fail,
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const templates = data?.templates ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>قوالب رسائل واتساب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            تُفتح الرسائل يدويًا عبر واتساب (wa.me) — لا يوجد إرسال تلقائي.
            المتغيرات المدعومة:{" "}
            {TEMPLATE_PLACEHOLDERS.map((p) => (
              <code key={p} className="mx-1 px-1 bg-muted rounded" dir="ltr">
                {`{{${p}}}`}
              </code>
            ))}
          </p>
          <div className="grid gap-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="border border-border rounded-lg p-4 space-y-2"
                data-testid={`card-template-${t.id}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    {t.isApproved ? (
                      <Badge variant="secondary">مفعّل</Badge>
                    ) : (
                      <Badge variant="outline">موقوف</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(t);
                        setName(t.name);
                        setBody(t.body);
                      }}
                      data-testid={`button-edit-template-${t.id}`}
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setActive.mutate(
                          { id: t.id, active: !t.isApproved },
                          { onError: fail },
                        )
                      }
                    >
                      <span className="notranslate">
                        {t.isApproved ? "إيقاف" : "تفعيل"}
                      </span>
                    </Button>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>تعديل القالب: {editing.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">اسم القالب</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-body">نص الرسالة</Label>
              <Textarea
                id="tpl-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                data-testid="input-template-body"
              />
              {unknown.length > 0 && (
                <p className="text-sm text-destructive">
                  متغيرات غير معروفة:{" "}
                  {unknown.map((u) => `{{${u}}}`).join("، ")} — المتغيرات
                  المدعومة فقط:{" "}
                  {TEMPLATE_PLACEHOLDERS.map(
                    (p) => `{{${p}}} (${TEMPLATE_PLACEHOLDER_LABELS[p]})`,
                  ).join("، ")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>معاينة بنموذج بيانات</Label>
              <div className="border border-border rounded-lg p-3 bg-muted/50 text-sm whitespace-pre-wrap">
                {renderTemplate(body, SAMPLE)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={save}
                disabled={update.isPending || unknown.length > 0 || !body.trim()}
                data-testid="button-save-template"
              >
                {update.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin ml-1" />
                )}
                <span>حفظ القالب</span>
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
