import { useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ExportFormat } from "@/lib/api";
import { useTranslation } from "react-i18next";

type ExportMenuProps = {
  getUrl: (format: ExportFormat) => string;
  disabled?: boolean;
  formats?: ExportFormat[];
  className?: string;
  "data-testid"?: string;
};

function filenameFromResponse(response: Response, format: ExportFormat): string {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)"?/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return `export.${format}`;
}

export function ExportMenu({
  getUrl,
  disabled = false,
  formats = ["pdf", "xlsx"],
  className,
  "data-testid": testId = "button-export",
}: ExportMenuProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [open, setOpen] = useState(false);
  const busyRef = useRef(false);

  const download = async (format: ExportFormat) => {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    setBusyFormat(format);
    try {
      const response = await fetch(getUrl(format), {
        credentials: "same-origin",
        headers: { Accept: "application/octet-stream" },
      });
      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFromResponse(response, format);
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({
        title: t("exports.success"),
        description: t(`exports.formats.${format}`),
      });
    } catch (error) {
      console.error("Export generation failed", error);
      toast({
        title: t("exports.error"),
        variant: "destructive",
      });
    } finally {
      busyRef.current = false;
      setBusyFormat(null);
      setOpen(false);
    }
  };

  const availableFormats = formats.filter((format) => format !== "csv");
  const label = busyFormat ? t("exports.preparing") : t("actions.export");

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busyRef.current) setOpen(nextOpen);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          disabled={disabled || Boolean(busyFormat)}
          data-testid={testId}
          aria-label={t("exports.menuLabel")}
        >
          {busyFormat ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {availableFormats.map((format) => (
          <DropdownMenuItem
            key={format}
            disabled={Boolean(busyFormat)}
            onSelect={(event) => {
              event.preventDefault();
              void download(format);
            }}
            data-testid={`${testId}-${format}`}
          >
            {format === "pdf" ? (
              <FileText className="h-4 w-4" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            <span>{t(`exports.formats.${format}`)}</span>
            {busyFormat === format ? <Loader2 className="ms-auto h-4 w-4 animate-spin" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}