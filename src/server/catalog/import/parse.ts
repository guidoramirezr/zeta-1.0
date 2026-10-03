import "server-only";
import ExcelJS from "exceljs";
import { normalizeText } from "../normalize";

// Lee un Excel de catálogo y lo convierte en filas listas para importar.
// Formatos reconocidos (se detectan solos por los encabezados):
//   - "zeta":    la plantilla oficial de Zeta (una empresa por fila).
//   - "sanauto": la lista de precios de Sanauto tal como la envían
//                (categorías como filas-título, PRECIO = costo para Zeta).
// Para un distribuidor nuevo con formato propio se agrega aquí otro formato.

export type ImportRow = {
  rowNumber: number;
  company: string;
  internalCode: string;
  description: string;
  manufacturerCode: string | null;
  partBrand: string | null;
  category: string | null;
  cost: number | null;
  price: number | null;
};

export type RowError = { rowNumber: number; message: string };

export type ParsedFile = {
  format: "zeta" | "sanauto";
  formatLabel: string;
  totalRows: number;
  rows: ImportRow[];
  errors: RowError[];
};

export class ImportFormatError extends Error {}

type Cell = string | number | null;

// Columnas de la plantilla Zeta. Cada una acepta varios nombres posibles.
export const TEMPLATE_COLUMNS = [
  { key: "company", header: "Empresa", required: true, aliases: ["empresa", "proveedor", "distribuidor"] },
  { key: "internalCode", header: "Código interno", required: true, aliases: ["codigo interno", "codigo", "cod articulo"] },
  { key: "description", header: "Descripción", required: true, aliases: ["descripcion", "producto"] },
  { key: "manufacturerCode", header: "Código fabricante", required: false, aliases: ["codigo fabricante", "cod fabricante"] },
  { key: "partBrand", header: "Marca", required: false, aliases: ["marca", "marca repuesto"] },
  { key: "category", header: "Categoría", required: false, aliases: ["categoria"] },
  { key: "cost", header: "Costo", required: false, aliases: ["costo"] },
  { key: "price", header: "Precio Zeta", required: false, aliases: ["precio zeta", "precio venta", "pvp"] },
] as const;

type ColumnKey = (typeof TEMPLATE_COLUMNS)[number]["key"];

export async function parseCatalogFile(data: ArrayBuffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as never);
  } catch {
    throw new ImportFormatError("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx).");
  }
  const ws = wb.getWorksheet("Productos") ?? wb.worksheets[0];
  if (!ws) throw new ImportFormatError("El archivo no tiene hojas.");

  const grid: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const values: Cell[] = [];
    for (let c = 1; c <= ws.columnCount; c++) values.push(cellValue(row.getCell(c).value));
    grid[n - 1] = values;
  });

  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const headers = (grid[i] ?? []).map((v) => (v == null ? "" : normalizeText(String(v))));
    if (headers.includes("cod articulo") && headers.includes("producto") && headers.includes("precio")) {
      return parseSanauto(grid, i, headers);
    }
    const map = matchTemplateHeaders(headers);
    if (map) return parseTemplate(grid, i, map);
  }

  throw new ImportFormatError(
    "No reconozco las columnas. Usa la plantilla Zeta (Empresa, Código interno, Descripción, Código fabricante, Marca, Categoría, Costo, Precio Zeta).",
  );
}

function matchTemplateHeaders(headers: string[]): Map<ColumnKey, number> | null {
  const map = new Map<ColumnKey, number>();
  for (const col of TEMPLATE_COLUMNS) {
    const idx = headers.findIndex((h) => (col.aliases as readonly string[]).includes(h));
    if (idx >= 0) map.set(col.key, idx);
    else if (col.required) return null;
  }
  return map;
}

function parseTemplate(grid: Cell[][], headerIdx: number, map: Map<ColumnKey, number>): ParsedFile {
  const acc = new RowAccumulator();
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((v) => v == null)) continue;
    const get = (k: ColumnKey) => (map.has(k) ? r[map.get(k)!] : null);
    acc.add(i + 1, {
      company: text(get("company")),
      internalCode: text(get("internalCode")),
      description: text(get("description")),
      manufacturerCode: text(get("manufacturerCode")),
      partBrand: text(get("partBrand")),
      category: text(get("category")),
      cost: get("cost"),
      price: get("price"),
    });
  }
  return { format: "zeta", formatLabel: "Plantilla Zeta", ...acc.result() };
}

function parseSanauto(grid: Cell[][], headerIdx: number, headers: string[]): ParsedFile {
  const col = (name: string) => headers.indexOf(name);
  const cCode = col("cod articulo");
  const cMfr = col("cod fabricante");
  const cDesc = col("producto");
  const cBrand = col("marca");
  const cPrice = col("precio");

  const acc = new RowAccumulator();
  let category: string | null = null;
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((v) => v == null)) continue;
    // Fila-título de categoría: tiene descripción pero no código ni precio.
    if (r[cCode] == null && r[cPrice] == null && r[cDesc] != null) {
      category = text(r[cDesc]);
      continue;
    }
    acc.add(i + 1, {
      company: "Sanauto",
      internalCode: text(r[cCode]),
      description: text(r[cDesc]),
      manufacturerCode: cMfr >= 0 ? text(r[cMfr]) : null,
      partBrand: cBrand >= 0 ? text(r[cBrand]) : null,
      category,
      // En la lista Sanauto, PRECIO es lo que le cuesta a Zeta.
      cost: r[cPrice],
      price: null,
    });
  }
  return { format: "sanauto", formatLabel: "Lista de precios Sanauto", ...acc.result() };
}

type RawRow = {
  [K in keyof Omit<ImportRow, "rowNumber" | "cost" | "price">]: string | null;
} & { cost: Cell; price: Cell };

class RowAccumulator {
  private rows: ImportRow[] = [];
  private errors: RowError[] = [];
  private total = 0;
  private seen = new Map<string, number>();

  add(rowNumber: number, raw: RawRow) {
    this.total++;
    const problems: string[] = [];
    if (!raw.company) problems.push("falta Empresa");
    if (!raw.internalCode) problems.push("falta Código interno");
    if (!raw.description) problems.push("falta Descripción");
    const cost = money(raw.cost);
    const price = money(raw.price);
    if (cost === "invalid") problems.push(`Costo no válido (${raw.cost})`);
    if (price === "invalid") problems.push(`Precio Zeta no válido (${raw.price})`);

    if (raw.company && raw.internalCode) {
      const key = `${raw.company.toLowerCase()}|${raw.internalCode.toLowerCase()}`;
      const first = this.seen.get(key);
      if (first) problems.push(`código repetido (ya está en la fila ${first})`);
      else this.seen.set(key, rowNumber);
    }

    if (problems.length) {
      this.errors.push({ rowNumber, message: problems.join(", ") });
      return;
    }
    this.rows.push({
      rowNumber,
      company: raw.company!,
      internalCode: raw.internalCode!,
      description: raw.description!,
      manufacturerCode: raw.manufacturerCode,
      partBrand: raw.partBrand,
      category: raw.category,
      cost: cost as number | null,
      price: price as number | null,
    });
  }

  result() {
    return { totalRows: this.total, rows: this.rows, errors: this.errors };
  }
}

function text(v: Cell): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
}

// Acepta 6.65, "6,65", "$ 6.65". Vacío → null. Negativo o texto → inválido.
function money(v: Cell): number | null | "invalid" {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v >= 0 ? round2(v) : "invalid";
  const s = v.replace(/[$\s]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? round2(n) : "invalid";
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ExcelJS devuelve fórmulas, texto enriquecido, links, etc. como objetos.
function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return null;
}
