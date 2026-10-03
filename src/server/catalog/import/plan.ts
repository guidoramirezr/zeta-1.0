import "server-only";
import { db, transaction } from "@/server/db/client";
import { buildSearchText } from "../normalize";
import { round2, type ImportRow, type ParsedFile, type RowError } from "./parse";

// Compara el archivo con lo que ya hay en la base y decide qué pasará con
// cada fila. La vista previa y la importación usan exactamente el mismo plan,
// así lo que el usuario confirma es lo que se guarda.
//
// Regla: nunca se borra información en silencio. Si una celda viene vacía,
// se conserva el valor que ya existía. Los productos que no vienen en el
// archivo NO se eliminan; solo se informa cuántos son.

export type ImportOptions = {
  // Si el archivo no trae Precio Zeta, se calcula como costo + margen %.
  marginPct: number | null;
};

type ProductValues = {
  description: string;
  manufacturerCode: string | null;
  partBrand: string | null;
  category: string | null;
  cost: number | null;
  price: number | null;
};

type Existing = ProductValues & { id: number; company: string; internalCode: string };

type PlannedRow = {
  row: ImportRow;
  action: "create" | "update" | "unchanged";
  existingId: number | null;
  values: ProductValues;
  changes: { field: string; before: string; after: string }[];
};

export type ImportPreview = {
  formatLabel: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: RowError[];
  newCompanies: string[];
  created: number;
  updated: number;
  unchanged: number;
  withoutPrice: number;
  sampleChanges: { code: string; description: string; field: string; before: string; after: string }[];
  notInFile: { company: string; count: number }[];
};

const FIELD_LABELS: Record<keyof ProductValues, string> = {
  description: "Descripción",
  manufacturerCode: "Código fabricante",
  partBrand: "Marca",
  category: "Categoría",
  cost: "Costo",
  price: "Precio Zeta",
};

function plan(parsed: ParsedFile, opts: ImportOptions) {
  const conn = db();
  const companyNames = [...new Set(parsed.rows.map((r) => r.company))];

  const knownCompanies = new Map<string, number>();
  for (const name of companyNames) {
    const c = conn.prepare("SELECT id, name FROM companies WHERE name = ?").get(name) as
      | { id: number; name: string }
      | undefined;
    if (c) knownCompanies.set(name.toLowerCase(), c.id);
  }

  const existing = new Map<string, Existing>();
  for (const companyId of knownCompanies.values()) {
    const rows = conn
      .prepare(
        `SELECT p.id, c.name AS company, p.internal_code AS internalCode, p.description,
                p.manufacturer_code AS manufacturerCode, p.part_brand AS partBrand,
                p.category, p.cost, p.price
           FROM products p JOIN companies c ON c.id = p.company_id
          WHERE p.company_id = ?`,
      )
      .all(companyId) as unknown as Existing[];
    for (const e of rows) existing.set(key(e.company, e.internalCode), e);
  }

  const planned: PlannedRow[] = parsed.rows.map((row) => {
    const prev = existing.get(key(row.company, row.internalCode));
    const cost = row.cost ?? prev?.cost ?? null;
    const marginPrice =
      opts.marginPct != null && row.cost != null ? round2(row.cost * (1 + opts.marginPct / 100)) : null;
    const values: ProductValues = {
      description: row.description,
      manufacturerCode: row.manufacturerCode ?? prev?.manufacturerCode ?? null,
      partBrand: row.partBrand ?? prev?.partBrand ?? null,
      category: row.category ?? prev?.category ?? null,
      cost,
      price: row.price ?? marginPrice ?? prev?.price ?? null,
    };
    if (!prev) return { row, action: "create", existingId: null, values, changes: [] };

    const changes = (Object.keys(FIELD_LABELS) as (keyof ProductValues)[])
      .filter((f) => values[f] !== prev[f])
      .map((f) => ({ field: FIELD_LABELS[f], before: show(prev[f]), after: show(values[f]) }));
    return { row, action: changes.length ? "update" : "unchanged", existingId: prev.id, values, changes };
  });

  const inFile = new Set(parsed.rows.map((r) => key(r.company, r.internalCode)));
  const notInFile = new Map<string, number>();
  for (const [k, e] of existing) {
    if (!inFile.has(k)) notInFile.set(e.company, (notInFile.get(e.company) ?? 0) + 1);
  }

  return {
    planned,
    newCompanies: companyNames.filter((n) => !knownCompanies.has(n.toLowerCase())),
    notInFile: [...notInFile].map(([company, count]) => ({ company, count })),
  };
}

export function previewImport(parsed: ParsedFile, opts: ImportOptions): ImportPreview {
  const { planned, newCompanies, notInFile } = plan(parsed, opts);
  const count = (a: PlannedRow["action"]) => planned.filter((p) => p.action === a).length;
  return {
    formatLabel: parsed.formatLabel,
    totalRows: parsed.totalRows,
    validRows: parsed.rows.length,
    errorRows: parsed.errors.length,
    errors: parsed.errors.slice(0, 100),
    newCompanies,
    created: count("create"),
    updated: count("update"),
    unchanged: count("unchanged"),
    withoutPrice: planned.filter((p) => p.values.price == null).length,
    sampleChanges: planned
      .flatMap((p) => p.changes.map((c) => ({ code: p.row.internalCode, description: p.row.description, ...c })))
      .slice(0, 30),
    notInFile,
  };
}

export function applyImport(parsed: ParsedFile, opts: ImportOptions, fileName: string) {
  const conn = db();
  const { planned } = plan(parsed, opts);

  return transaction(conn, () => {
    const companyIds = new Map<string, number>();
    const companyId = (name: string) => {
      const k = name.toLowerCase();
      if (!companyIds.has(k)) {
        conn.prepare("INSERT INTO companies (name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(name);
        const { id } = conn.prepare("SELECT id FROM companies WHERE name = ?").get(name) as { id: number };
        companyIds.set(k, id);
      }
      return companyIds.get(k)!;
    };

    const insert = conn.prepare(
      `INSERT INTO products (company_id, internal_code, description, manufacturer_code, part_brand,
                             category, cost, price, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const update = conn.prepare(
      `UPDATE products SET description = ?, manufacturer_code = ?, part_brand = ?, category = ?,
              cost = ?, price = ?, search_text = ?, updated_at = datetime('now')
        WHERE id = ?`,
    );

    for (const p of planned) {
      const v = p.values;
      const search = buildSearchText({ ...v, internalCode: p.row.internalCode });
      if (p.action === "create") {
        insert.run(companyId(p.row.company), p.row.internalCode, v.description, v.manufacturerCode,
          v.partBrand, v.category, v.cost, v.price, search);
      } else if (p.action === "update") {
        update.run(v.description, v.manufacturerCode, v.partBrand, v.category, v.cost, v.price, search,
          p.existingId!);
      }
    }

    const result = {
      created: planned.filter((p) => p.action === "create").length,
      updated: planned.filter((p) => p.action === "update").length,
      unchanged: planned.filter((p) => p.action === "unchanged").length,
    };
    conn
      .prepare(
        `INSERT INTO import_batches (file_name, format, total_rows, valid_rows, error_rows, created, updated, unchanged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(fileName, parsed.format, parsed.totalRows, parsed.rows.length, parsed.errors.length,
        result.created, result.updated, result.unchanged);
    return result;
  });
}

function key(company: string, code: string) {
  return `${company.toLowerCase()}|${code.toLowerCase()}`;
}

function show(v: string | number | null) {
  return v == null ? "—" : String(v);
}
