import { useRef, useState } from "react";
import { AlertTriangle, Download, FileUp, Loader2 } from "lucide-react";
import {
  IMPORT_TYPES,
  IMPORT_TYPE_LABELS,
  type ImportCommitResponse,
  type ImportMode,
  type ImportPreviewResponse,
  type ImportRowResult,
  type ImportType,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useImportPreview, useImportCommit } from "@/hooks/use-admin";
import { importTemplateUrl } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { localizeErrorMessage } from "@/lib/localize-error";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export function ImportTab() {
  const preview = useImportPreview();
  const commit = useImportCommit();
  const { toast } = useToast();
  const { t } = useTranslation("admin");
  const fileRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<ImportType>("patients");
  const [mode, setMode] = useState<ImportMode>("skip_duplicates");
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [previewResult, setPreviewResult] =
    useState<ImportPreviewResponse | null>(null);
  const [commitResult, setCommitResult] =
    useState<ImportCommitResponse | null>(null);

  const fail = (err: unknown) =>
    toast({
      variant: "destructive",
      title: t("import.operationFailed"),
      description: localizeErrorMessage(err),
    });

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast({
        variant: "destructive",
        title: t("import.fileTooLargeTitle"),
        description: t("import.fileTooLargeDescription"),
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result));
      setFileName(file.name);
      setPreviewResult(null);
      setCommitResult(null);
    };
    reader.readAsText(file, "utf-8");
  };

  const runPreview = () => {
    if (!content) return;
    setCommitResult(null);
    preview.mutate(
      { type, content, mode },
      { onSuccess: setPreviewResult, onError: fail },
    );
  };

  const runCommit = () => {
    if (!content || !previewResult) return;
    commit.mutate(
      { type, content, mode },
      {
        onSuccess: (result) => {
          setCommitResult(result);
          setPreviewResult(null);
          toast({
            title: t("import.completedTitle"),
            description: t("import.completedDescription", result),
          });
        },
        onError: fail,
      },
    );
  };

  const reset = () => {
    setContent(null);
    setFileName(null);
    setPreviewResult(null);
    setCommitResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>استيراد البيانات القديمة (CSV)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            الاستيراد آمن دائمًا: المعاينة لا تكتب أي شيء في قاعدة البيانات،
            والتنفيذ لا يستبدل أو يعدّل أي سجل موجود أبدًا — السجلات المكررة
            تُتخطى أو تُرفض حسب الوضع المختار.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>نوع البيانات</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as ImportType);
                reset();
              }}
            >
              <SelectTrigger data-testid="select-import-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {IMPORT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>التعامل مع المكرر</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                setMode(v as ImportMode);
                setPreviewResult(null);
              }}
            >
              <SelectTrigger data-testid="select-import-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip_duplicates">
                  تخطي السجلات المكررة
                </SelectItem>
                <SelectItem value="create_only">
                  رفض الملف إذا احتوى مكررات (إنشاء فقط)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>قالب جاهز</Label>
            <Button variant="outline" className="w-full" asChild>
              <a href={importTemplateUrl(type)} data-testid="link-import-template">
                <Download className="h-4 w-4 ms-1" />
                <span>تنزيل قالب {IMPORT_TYPE_LABELS[type]}</span>
              </a>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
            data-testid="input-import-file"
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4 ms-1" />
            <span>اختيار ملف CSV</span>
          </Button>
          {fileName && (
            <span className="text-sm text-muted-foreground" dir="ltr">
              {fileName}
            </span>
          )}
          <Button
            onClick={runPreview}
            disabled={!content || preview.isPending}
            data-testid="button-import-preview"
          >
            {preview.isPending && (
              <Loader2 className="h-4 w-4 animate-spin ms-1" />
            )}
            <span>معاينة (بدون حفظ)</span>
          </Button>
        </div>

        {previewResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">
                إجمالي الصفوف: {previewResult.totalRows}
              </Badge>
              <Badge variant="secondary">صالح: {previewResult.validRows}</Badge>
              <Badge variant={previewResult.duplicateRows > 0 ? "outline" : "secondary"}>
                مكرر: {previewResult.duplicateRows}
              </Badge>
              <Badge
                variant={previewResult.invalidRows > 0 ? "destructive" : "secondary"}
              >
                غير صالح: {previewResult.invalidRows}
              </Badge>
            </div>
            <RowsTable rows={previewResult.rows} truncated={previewResult.truncated} />
            <div className="flex items-center gap-3">
              <Button
                onClick={runCommit}
                disabled={commit.isPending || previewResult.validRows === 0}
                data-testid="button-import-commit"
              >
                {commit.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin ms-1" />
                )}
                <span>تأكيد الاستيراد ({previewResult.validRows} سجل)</span>
              </Button>
              <Button variant="ghost" onClick={reset}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {commitResult && (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                اكتمل الاستيراد: تم استيراد {commitResult.imported} سجلًا،
                وتخطي {commitResult.skipped}، وفشل {commitResult.failed}.
              </AlertDescription>
            </Alert>
            <RowsTable rows={commitResult.rows} truncated={commitResult.truncated} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_LABELS: Record<ImportRowResult["status"], string> = {
  valid: "صالح",
  invalid: "غير صالح",
  duplicate: "مكرر",
};

function RowsTable({
  rows,
  truncated,
}: {
  rows: ImportRowResult[];
  truncated: boolean;
}) {
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto border border-border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-start w-16">الصف</TableHead>
            <TableHead className="text-start w-24">الحالة</TableHead>
            <TableHead className="text-start">الملخص</TableHead>
            <TableHead className="text-start">الأخطاء</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.rowNumber}>
              <TableCell>{r.rowNumber}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    r.status === "valid"
                      ? "secondary"
                      : r.status === "duplicate"
                        ? "outline"
                        : "destructive"
                  }
                >
                  {STATUS_LABELS[r.status]}
                </Badge>
              </TableCell>
              <TableCell>{r.summary}</TableCell>
              <TableCell className="text-destructive text-sm">
                {r.errors.join("، ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {truncated && (
        <p className="text-xs text-muted-foreground p-2">
          تم عرض جزء من الصفوف فقط للاختصار.
        </p>
      )}
    </div>
  );
}
