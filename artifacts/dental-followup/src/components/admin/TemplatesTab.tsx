import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  TEMPLATE_PLACEHOLDERS,
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
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

const SAMPLE = {
  patientName: "محمد أحمد",
  date: "1447/02/15هـ الموافق 2025/09/07",
  time: "10:30 صباحًا",
};

export function TemplatesTab() {
  const { data, isLoading } = useAdminTemplates();
  const { update, setActive } = useAdminTemplateMutations();
  const { toast } = useToast();
  const { t } = useTranslation("admin");

  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const unknown = editing ? findUnknownPlaceholders(body) : [];

  const fail = (err: unknown) =>
    toast({
      variant: "destructive",
      title: t("templates.operationFailed"),
      description: localizeErrorMessage(err),
    });

  const save = () => {
    if (!editing) return;
    update.mutate(
      { id: editing.id, input: { name, body } },
      {
        onSuccess: () => {
          toast({ title: t("templates.saveSuccess") });
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
          <CardTitle>{t("templates.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("templates.description")}{" "}
            {TEMPLATE_PLACEHOLDERS.map((p) => (
              <code key={p} className="mx-1 px-1 bg-muted rounded" dir="ltr">
                {`{{${p}}}`}
              </code>
            ))}
          </p>
          <div className="grid gap-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="border border-border rounded-lg p-4 space-y-2"
                data-testid={`card-template-${template.id}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.name}</span>
                    {template.isApproved ? (
                      <Badge variant="secondary">{t("templates.active")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("templates.inactive")}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(template);
                        setName(template.name);
                        setBody(template.body);
                      }}
                      data-testid={`button-edit-template-${template.id}`}
                    >
                      {t("templates.edit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setActive.mutate(
                          { id: template.id, active: !template.isApproved },
                          { onError: fail },
                        )
                      }
                    >
                      <span className="notranslate">
                        {template.isApproved ? t("templates.deactivate") : t("templates.activate")}
                      </span>
                    </Button>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {template.body}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardHeader>
          <CardTitle>{t("templates.editTitle", { name: editing.name })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">{t("templates.name")}</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-body">{t("templates.messageBody")}</Label>
              <Textarea
                id="tpl-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                data-testid="input-template-body"
              />
              {unknown.length > 0 && (
                <p className="text-sm text-destructive">
                  {t("templates.unknownPlaceholders", {
                    unknown: unknown.map((u) => `{{${u}}}`).join("، "),
                    supported: TEMPLATE_PLACEHOLDERS.map(
                      (p) => `{{${p}}} (${t(`templates.placeholderLabels.${p}`)})`,
                    ).join("، "),
                  })}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>{t("templates.preview")}</Label>
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
                  <Loader2 className="h-4 w-4 animate-spin ms-1" />
                )}
                <span>{t("templates.save")}</span>
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t("templates.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
