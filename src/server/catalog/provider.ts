import "server-only";
import type { CatalogProvider, ProductQuery, PublicProduct, SearchResult } from "@/core/catalog/types";
import { db, type Sql } from "@/server/db/client";

// Búsqueda V1 (texto) sobre la base de Zeta. Solo selecciona columnas públicas:
// el costo y la empresa NUNCA salen de aquí.

function publicColumns(sql: Sql) {
  return sql`p.id, p.internal_code AS code, p.description, p.manufacturer_code AS "manufacturerCode",
    p.part_brand AS "partBrand", p.category, p.price`;
}

// Coincidencia por palabra completa: ' sensor tps aveo ' LIKE '% aveo %'
function matchAny(sql: Sql, terms: string[], pattern: (t: string) => string) {
  return terms
    .map((t) => sql`(' ' || p.search_text || ' ') LIKE ${pattern(t)}`)
    .reduce((acc, f) => sql`${acc} OR ${f}`);
}

function buildWhere(sql: Sql, q: ProductQuery) {
  let where = sql`p.active`;
  if (q.vehicleTerms.length) where = sql`${where} AND (${matchAny(sql, q.vehicleTerms, (t) => `% ${t} %`)})`;
  if (q.partPhrases.length) where = sql`${where} AND (${matchAny(sql, q.partPhrases, (t) => `% ${t} %`)})`;
  for (const k of q.keywords) where = sql`${where} AND (' ' || p.search_text || ' ') LIKE ${`% ${k}%`}`;
  return where;
}

const normCode = (sql: Sql, col: "internal_code" | "manufacturer_code") =>
  sql`lower(replace(replace(replace(replace(${sql("p." + col)}, '-', ''), ' ', ''), '.', ''), '/', ''))`;

export const catalogProvider: CatalogProvider = {
  async search(q: ProductQuery): Promise<SearchResult> {
    const sql = await db();
    const where = buildWhere(sql, q);
    const [{ total }] = await sql<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`;
    if (total === 0) return { total, items: [], topCategories: [] };

    const items = await sql<PublicProduct[]>`
      SELECT ${publicColumns(sql)} FROM products p WHERE ${where}
       ORDER BY (p.price IS NULL), p.category, p.description LIMIT ${q.limit}`;
    const topCategories = await sql<{ name: string; count: number }[]>`
      SELECT p.category AS name, COUNT(*)::int AS count FROM products p
       WHERE ${where} AND p.category IS NOT NULL
       GROUP BY p.category ORDER BY count DESC, p.category LIMIT 5`;
    return { total, items: [...items], topCategories: [...topCategories] };
  },

  async findByCode(code: string): Promise<PublicProduct[]> {
    const clean = code.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!clean) return [];
    const sql = await db();
    const rows = await sql<PublicProduct[]>`
      SELECT ${publicColumns(sql)} FROM products p
       WHERE p.active AND (${normCode(sql, "internal_code")} = ${clean} OR ${normCode(sql, "manufacturer_code")} = ${clean})
       LIMIT 10`;
    return [...rows];
  },

  async findById(id: number): Promise<PublicProduct | null> {
    const sql = await db();
    const [row] = await sql<PublicProduct[]>`SELECT ${publicColumns(sql)} FROM products p WHERE p.active AND p.id = ${id}`;
    return row ?? null;
  },
};
