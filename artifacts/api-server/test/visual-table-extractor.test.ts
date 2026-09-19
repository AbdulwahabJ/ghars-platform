import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { extractVisualTable, sanitizeExtractedTable } from "../src/lib/visual-table-extractor";

const execFileAsync = promisify(execFile);

describe("visual table extraction staging", () => {
  it("keeps logical rows and per-value confidence while removing pipeline metadata", () => {
    const rows = sanitizeExtractedTable({
      headers: ["NAME + MOBILE", "DATE", "site", "SIZE", "COST", "Extraction_Status", "_sheet", "processing metadata"],
      rows: [{
        cells: {
          "NAME + MOBILE": "مريض عربي",
          DATE: "14/7/25",
          site: "24\n25",
          SIZE: "3.5*10\n3.5*10",
          COST: "دفعة أولى ٤٠٠٠\nدفعة ثانية ٤٠٠٠",
          "Extraction status": "100%",
          "Extraction_Status": "100%",
          _sheet: "internal",
          "processing metadata": "internal",
        },
        confidence: { "NAME + MOBILE": 0.97, DATE: 0.96, site: 0.92, SIZE: 0.91, COST: 0.68 },
      }],
    }, 1, 0);

    expect(rows).toHaveLength(1);
    expect(rows[0].values.site).toBe("24\n25");
    expect(rows[0].values.SIZE).toBe("3.5*10\n3.5*10");
    expect(rows[0].values.COST).toContain("دفعة ثانية");
    expect(rows[0].values).not.toHaveProperty("Extraction status");
    expect(rows[0].values).not.toHaveProperty("_sheet");
    expect(rows[0].values).not.toHaveProperty("processing metadata");
    expect(rows[0].confidence?.COST).toBe(0.68);
  });

  it("classifies and renders PDF pages sequentially before staging model rows", async () => {
    const fixture = resolve(import.meta.dirname, "fixtures/legacy-table-image.pdf");
    const work = await mkdtemp(join(tmpdir(), "ghars-pdf-test-"));
    try {
      const twoPage = join(work, "two-page.pdf");
      await execFileAsync("mutool", ["merge", "-o", twoPage, fixture, fixture]);
      const calls: Array<{ page: number; offset: number; bytes: number }> = [];
      const result = await extractVisualTable(
        "legacy.pdf",
        "application/pdf",
        (await readFile(twoPage)).toString("base64"),
        async (image, page, offset) => {
          calls.push({ page, offset, bytes: image.length });
          return [{
            rowNumber: offset + 1,
            sheet: `Page ${page}`,
            values: { "NAME + MOBILE": `Patient ${page}`, FILE: String(page), DATE: "14/7/25", site: "24", SIZE: "3.5*10" },
            confidence: { "NAME + MOBILE": 0.95, FILE: 0.99, DATE: 0.96, site: 0.92, SIZE: 0.91 },
          }];
        },
      );
      expect(result).toMatchObject({ documentType: "IMAGE", pagesProcessed: 2 });
      expect(result.rows).toHaveLength(2);
      expect(calls.map(({ page, offset }) => ({ page, offset }))).toEqual([
        { page: 1, offset: 0 },
        { page: 2, offset: 1 },
      ]);
      expect(calls.every((call) => call.bytes > 1_000)).toBe(true);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});