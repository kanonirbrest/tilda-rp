import * as XLSX from "xlsx";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import {
  buildCustomerExportRows,
  CUSTOMERS_EXPORT_HEADER,
  type CustomerExportCell,
} from "@/lib/customers-export";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

/** Разделитель для Excel в ru/by локали; строка sep= в начале файла подсказывает Excel. */
const CSV_SEP = ";";

function sanitizeCsvText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function csvEscape(value: string | number | null | undefined): string {
  const s = sanitizeCsvText(value);
  const needsQuotes =
    /[";\n\r]/.test(s) ||
    /^[=+\-@\t]/.test(s) ||
    (/^\d+$/.test(s) && s.length > 10);
  if (needsQuotes) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells: string[]): string {
  return cells.join(CSV_SEP);
}

function exportFilename(ext: "csv" | "xlsx"): string {
  const day = new Date().toISOString().slice(0, 10);
  return `customers-export-${day}.${ext}`;
}

function buildCsvBody(rows: CustomerExportCell[][]): string {
  const lines: string[][] = [
    [...CUSTOMERS_EXPORT_HEADER],
    ...rows.map((row) => row.map((cell) => String(cell))),
  ];
  return (
    "\uFEFF" +
    `sep=${CSV_SEP}\r\n` +
    lines.map((line) => csvLine(line.map((cell) => csvEscape(cell)))).join("\r\n") +
    "\r\n"
  );
}

function buildXlsxBuffer(rows: CustomerExportCell[][]): Buffer {
  const sheetRows: CustomerExportCell[][] = [[...CUSTOMERS_EXPORT_HEADER], ...rows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, "Customers");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Выгрузка покупателей.
 * GET ?format=csv|xlsx — по умолчанию csv.
 */
export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const formatRaw = (url.searchParams.get("format") ?? "csv").trim().toLowerCase();
  let format: "csv" | "xlsx";
  if (formatRaw === "xlsx" || formatRaw === "xls") format = "xlsx";
  else if (formatRaw === "csv" || formatRaw === "") format = "csv";
  else {
    return jsonWithCors(req, { message: "format: csv или xlsx" }, { status: 400 });
  }

  const rows = await buildCustomerExportRows();
  const filename = exportFilename(format);

  if (format === "xlsx") {
    const body = buildXlsxBuffer(rows);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        ...adminCorsHeaders(req),
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const body = buildCsvBody(rows);
  return new Response(body, {
    status: 200,
    headers: {
      ...adminCorsHeaders(req),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
