/**
 * Minimal, correct CSV helpers (RFC 4180-ish) shared by the Admin import,
 * export, and audit endpoints. No external dependency.
 */

/** Matches plain numbers so legitimate negative amounts are not mangled. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Quote a CSV cell when needed and double embedded quotes.
 *
 * Cells starting with a spreadsheet formula trigger (=, +, -, @, tab, CR)
 * are prefixed with a single quote so Excel/Sheets treat them as text and
 * never execute them (CSV formula-injection hardening). Plain numeric
 * values (e.g. -50.00) are left untouched.
 */
export function csvEscape(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** Serialize rows to CSV text with UTF-8 BOM and CRLF line endings. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * Parse CSV text into rows of string cells. Handles quoted cells, embedded
 * quotes (""), embedded separators/newlines inside quotes, CRLF/LF, and a
 * leading UTF-8 BOM. Empty trailing lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (input[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Flush the final cell/row (unless the file ended exactly on a newline).
  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }
  // Drop rows that are entirely empty.
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/** Send a CSV download response. */
export function sendCsv(
  res: import("express").Response,
  filename: string,
  csv: string,
): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}
