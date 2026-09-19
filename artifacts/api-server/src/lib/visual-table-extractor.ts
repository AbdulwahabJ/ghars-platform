import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_VISUAL_PAGES = 20;
const MAX_RENDERED_PAGE_BYTES = 16 * 1024 * 1024;
const PDF_COMMAND_TIMEOUT_MS = 30_000;

export type VisualRawRow = {
  rowNumber: number;
  sheet: string;
  values: Record<string, string>;
  confidence?: Record<string, number>;
};

export type VisualExtraction = {
  rows: VisualRawRow[];
  documentType: "TEXT" | "IMAGE" | "MIXED";
  pagesProcessed: number;
};
export type VisualPageExtractor = (
  image: Buffer,
  page: number,
  offset: number,
  nativeText?: string,
) => Promise<VisualRawRow[]>;

type ModelTable = {
  headers?: string[];
  rows?: Array<{ cells?: Record<string, unknown>; confidence?: Record<string, unknown> }>;
};

function isInternalHeader(value: string): boolean {
  const normalized = value.normalize("NFKC").toLocaleLowerCase().replace(/[\s_.:/\\()-]+/g, "");
  return [
    "extractionstatus",
    "reviewstatus",
    "sheet",
    "confidence",
    "processingmetadata",
    "processingstatus",
    "ocrstatus",
  ].includes(normalized);
}

export function sanitizeExtractedTable(table: ModelTable, page: number, offset: number): VisualRawRow[] {
  const headers = (table.headers ?? [])
    .map(String)
    .map((value) => value.trim())
    .filter((value) => value && !isInternalHeader(value));
  return (table.rows ?? []).flatMap((row, index) => {
    const values = Object.fromEntries(headers.map((header) => [header, String(row.cells?.[header] ?? "").trim()]));
    if (!Object.values(values).some(Boolean)) return [];
    const confidence = Object.fromEntries(headers.map((header) => {
      const n = Number(row.confidence?.[header]);
      return [header, Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5];
    }));
    return [{ rowNumber: offset + index + 1, sheet: `Page ${page}`, values, confidence }];
  });
}

async function extractPage(
  image: Buffer,
  page: number,
  offset: number,
  nativeText = "",
): Promise<VisualRawRow[]> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const response = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Extract the clinical table from page ${page}, using the page image for geometry and the embedded PDF text below when present for exact characters. Preserve logical patient rows, merged and multiline cells, Arabic and Latin text, and raw financial/note text. A patient identity cell defines a row boundary; multiple site/size lines remain in one row separated by newlines. Do not infer missing values. Return JSON only: {"headers":["..."],"rows":[{"cells":{"header":"raw value"},"confidence":{"header":0.0}}]}. Confidence is per cell. Never emit processing metadata as table columns. If no real table rows are identifiable, return empty rows.\n\nEmbedded text:\n${nativeText.slice(0, 30_000)}`,
        },
        { type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}`, detail: "high" } },
      ],
    }],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  return sanitizeExtractedTable(JSON.parse(content) as ModelTable, page, offset);
}

export async function extractVisualTable(
  filename: string,
  mime: string,
  content: string,
  pageExtractor: VisualPageExtractor = extractPage,
): Promise<VisualExtraction> {
  const source = Buffer.from(content, "base64");
  const work = await mkdtemp(join(tmpdir(), "ghars-visual-import-"));
  try {
    let documentType: VisualExtraction["documentType"] = "IMAGE";
    const rows: VisualRawRow[] = [];
    let pagesProcessed = 1;
    if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      const pdf = join(work, "source.pdf");
      await writeFile(pdf, source);
      const { stdout: info } = await execFileAsync("mutool", ["info", pdf], {
        timeout: PDF_COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      const pageCount = Number(/\bPages:\s*(\d+)/i.exec(info)?.[1]);
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new Error("The PDF page count could not be determined safely.");
      }
      if (pageCount > MAX_VISUAL_PAGES) {
        throw new Error(`PDFs are limited to ${MAX_VISUAL_PAGES} pages per analysis.`);
      }
      pagesProcessed = pageCount;
      const pageModes: VisualExtraction["documentType"][] = [];
      for (let page = 1; page <= pageCount; page++) {
        let nativeText = "";
        try {
          ({ stdout: nativeText } = await execFileAsync("mutool", ["draw", "-F", "txt", pdf, String(page)], {
            timeout: PDF_COMMAND_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
          }));
        } catch {
          nativeText = "";
        }
        const meaningfulText = nativeText.replace(/\s/g, "").length;
        pageModes.push(meaningfulText < 40 ? "IMAGE" : meaningfulText > 500 ? "TEXT" : "MIXED");
        const pageFile = join(work, `page-${page}.png`);
        await execFileAsync("mutool", [
          "draw", "-q", "-r", "220", "-w", "3000", "-h", "3000",
          "-B", "128", "-T", "1", "-m", "134217728", "-L",
          "-o", pageFile, pdf, String(page),
        ], {
          timeout: PDF_COMMAND_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        });
        if ((await stat(pageFile)).size > MAX_RENDERED_PAGE_BYTES) {
          throw new Error("A rendered PDF page exceeds the safe image-size limit.");
        }
        const image = await readFile(pageFile);
        rows.push(...await pageExtractor(image, page, rows.length, nativeText));
        await rm(pageFile, { force: true });
      }
      documentType = pageModes.every((mode) => mode === "TEXT")
        ? "TEXT"
        : pageModes.every((mode) => mode === "IMAGE")
          ? "IMAGE"
          : "MIXED";
    } else {
      rows.push(...await pageExtractor(source, 1, 0));
    }
    if (!rows.length) throw new Error("تعذر استخراج الجدول بدقة، يرجى مراجعة البيانات المستخرجة.");
    return { rows, documentType, pagesProcessed };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}