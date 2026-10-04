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

async function plan(parsed: ParsedFile, opts: ImportOptions) {
  const sql = await db();
  const companyNames = [...new Set(parsed.rows.map((r) => r.company))];
  const lowerNames = companyNames.map((n) => n.toLowerCase());

  const known = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM companies WHERE lower(name) = ANY(${lowerNames})`;
  const knownCompanies = new Map(known.map((c) => [c.name.toLowerCase(), c.id]));

  const existing = new Map<string, Existing>();
  if (knownCompanies.size) {
    const rows = await sql<Existing[]>`
      SELECT p.id, c.name AS company, p.internal_code AS "internalCode", p.description,
             p.manufacturer_code AS "manufacturerCode", p.part_brand AS "partBrand",
             p.category, p.cost, p.price
        FROM products p JOIN companies c ON c.id = p.company_id
       WHERE p.company_id = ANY(${[...knownCompanies.values()]})`;
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

export async function previewImport(parsed: ParsedFile, opts: ImportOptions): Promise<ImportPreview> {
  const { planned, newCompanies, notInFile } = await plan(parsed, opts);
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

const CHUNK = 500; // filas por bloque (pocas idas y vueltas a la base)

export async function applyImport(parsed: ParsedFile, opts: ImportOptions, fileName: string) {
  const { planned } = await plan(parsed, opts);

  return transaction(async (tx) => {
    const names = [...new Set(planned.filter((p) => p.action === "create").map((p) => p.row.company))];
    for (const name of names) {
      await tx`INSERT INTO companies (name) VALUES (${name}) ON CONFLICT ((lower(name))) DO NOTHING`;
    }
    const ids = names.length
      ? await tx<{ id: number; name: string }[]>`SELECT id, name FROM companies WHERE lower(name) = ANY(${names.map((n) => n.toLowerCase())})`
      : [];
    const companyIds = new Map(ids.map((c) => [c.name.toLowerCase(), c.id]));

    const toInsert = planned
      .filter((p) => p.action === "create")
      .map((p) => ({
        company_id: companyIds.get(p.row.company.toLowerCase())!,
        internal_code: p.row.internalCode,
        description: p.values.description,
        manufacturer_code: p.values.manufacturerCode,
        part_brand: p.values.partBrand,
        category: p.values.category,
        cost: p.values.cost,
        price: p.values.price,
        search_text: buildSearchText({ ...p.values, internalCode: p.row.internalCode }),
      }));
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await tx`INSERT INTO products ${tx(toInsert.slice(i, i + CHUNK))}`;
    }

    const toUpdate = planned
      .filter((p) => p.action === "update")
      .map((p) => [
        String(p.existingId),
        p.values.description,
        p.values.manufacturerCode,
        p.values.partBrand,
        p.values.category,
        p.values.cost == null ? null : String(p.values.cost),
        p.values.price == null ? null : String(p.values.price),
        buildSearchText({ ...p.values, internalCode: p.row.internalCode }),
      ]);
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await tx`
        UPDATE products p SET description = v.description, manufacturer_code = v.mc, part_brand = v.pb,
               category = v.category, cost = v.cost::numeric, price = v.price::numeric,
               search_text = v.st, updated_at = now()
          FROM (VALUES ${tx(toUpdate.slice(i, i + CHUNK) as never)}) AS v (id, description, mc, pb, category, cost, price, st)
         WHERE p.id = v.id::bigint`;
    }

    const result = {
      created: toInsert.length,
      updated: toUpdate.length,
      unchanged: planned.filter((p) => p.action === "unchanged").length,
    };
    await tx`
      INSERT INTO import_batches (file_name, format, total_rows, valid_rows, error_rows, created, updated, unchanged)
      VALUES (${fileName}, ${parsed.format}, ${parsed.totalRows}, ${parsed.rows.length}, ${parsed.errors.length},
              ${result.created}, ${result.updated}, ${result.unchanged})`;
    return result;
  });
}

function key(company: string, code: string) {
  return `${company.toLowerCase()}|${code.toLowerCase()}`;
}

function show(v: string | number | null) {
  return v == null ? "—" : String(v);
}
