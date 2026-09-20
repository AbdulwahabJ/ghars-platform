import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Loader2 } from "lucide-react";
import { UniversalImportBatch } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useUniversalImportAnalyze } from "@/hooks/use-admin";
import { localizeErrorMessage } from "@/lib/localize-error";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

export function UploadStep({
  onAnalyzed,
}: {
  onAnalyzed: (batch: UniversalImportBatch) => void;
}) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const analyze = useUniversalImportAnalyze();
  const fileRef = useRef<HTMLInputElement>(null);
  const importMode = "clinical_only" as const;

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast({
        variant: "destructive",
        title: t("import.fileTooLargeTitle", "File too large"),
        description: t("import.fileTooLargeDescription", "Maximum size is 8MB."),
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const isCsv = file.type.includes("csv") || file.name.endsWith(".csv") || file.name.endsWith(".txt");

    const reader = new FileReader();
    reader.onload = () => {
      let content = "";
      if (isCsv) {
        content = reader.result as string;
      } else {
        const result = reader.result as string;
        content = result.split(",")[1] ?? result;
      }

      analyze.mutate(
        {
          filename: file.name,
          mime: file.type || "application/octet-stream",
          content,
          mode: importMode,
        },
        {
          onSuccess: (batch) => {
            onAnalyzed(batch);
          },
          onError: (err) => {
            toast({
              variant: "destructive",
              title: t("import.operationFailed"),
              description: localizeErrorMessage(err),
            });
          },
          onSettled: () => {
            if (fileRef.current) fileRef.current.value = "";
          },
        }
      );
    };

    if (isCsv) {
      reader.readAsText(file, "utf-8");
    } else {
      reader.readAsDataURL(file);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("import.universal.uploadTitle", "Step 1: Upload Source")}</CardTitle>
        <CardDescription>
          {t(
            "import.universal.uploadDesc",
            "Upload an XLSX, CSV, PDF, PNG, or JPG file. We will automatically analyze the columns and prepare a mapping."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 text-center space-y-4">
          <FileUp className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("import.universal.dropzone", "Drag and drop your file here, or click to browse.")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("import.universal.supportedFormats", "Supports .xlsx, .csv, .pdf, .png, .jpg up to 8MB.")}
            </p>
          </div>
          <input
            id="universal-import-file"
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
            data-testid="input-universal-import-file"
          />
          <Button asChild disabled={analyze.isPending}>
            <label htmlFor="universal-import-file" data-testid="button-universal-import-upload" className={analyze.isPending ? "pointer-events-none opacity-50" : "cursor-pointer"}>
              {analyze.isPending && <Loader2 className="h-4 w-4 animate-spin ms-2" />}
              {t("import.chooseFile")}
            </label>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}