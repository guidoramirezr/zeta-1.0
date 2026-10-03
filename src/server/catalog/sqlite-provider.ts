import "server-only";
import type { CatalogProvider, ProductQuery, PublicProduct, SearchResult } from "@/core/catalog/types";
import { db } from "@/server/db/client";

// Búsqueda V1 (texto) sobre la base local. Solo selecciona columnas públicas:
// el costo y la empresa NUNCA salen de aquí.
const PUBLIC_COLUMNS = `p.id, p.internal_code AS code, p.description, p.manufacturer_code AS manufacturerCode,
  p.part_brand AS partBrand, p.category, p.price`;

const PADDED = "(' ' || p.search_text || ' ')";

function buildWhere(q: ProductQuery) {
  const clauses = ["p.active = 1"];
  const params: string[] = [];
  if (q.vehicleTerms.length) {
    clauses.push(`(${q.vehicleTerms.map(() => `${PADDED} LIKE ?`).join(" OR ")})`);
    params.push(...q.vehicleTerms.map((t) => `% ${t} %`));
  }
  if (q.partPhrases.length) {
    clauses.push(`(${q.partPhrases.map(() => `${PADDED} LIKE ?`).join(" OR ")})`);
    params.push(...q.partPhrases.map((t) => `% ${t} %`));
  }
  for (const k of q.keywords) {
    clauses.push(`${PADDED} LIKE ?`);
    params.push(`% ${k}%`);
  }
  return { where: clauses.join(" AND "), params };
}

export const sqliteCatalog: CatalogProvider = {
  search(q: ProductQuery): SearchResult {
    const conn = db();
    const { where, params } = buildWhere(q);
    const { total } = conn.prepare(`SELECT COUNT(*) AS total FROM products p WHERE ${where}`).get(...params) as {
      total: number;
    };
    if (total === 0) return { total, items: [], topCategories: [] };

    const items = conn
      .prepare(
        `SELECT ${PUBLIC_COLUMNS} FROM products p WHERE ${where}
          ORDER BY (p.price IS NULL), p.category, p.description LIMIT ?`,
      )
      .all(...params, q.limit) as unknown as PublicProduct[];
    const topCategories = conn
      .prepare(
        `SELECT p.category AS name, COUNT(*) AS count FROM products p
          WHERE ${where} AND p.category IS NOT NULL
          GROUP BY p.category ORDER BY count DESC LIMIT 5`,
      )
      .all(...params) as { name: string; count: number }[];
    return { total, items, topCategories };
  },

  findByCode(code: string): PublicProduct[] {
    const clean = code.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!clean) return [];
    const norm = (col: string) =>
      `lower(replace(replace(replace(replace(${col}, '-', ''), ' ', ''), '.', ''), '/', ''))`;
    return db()
      .prepare(
        `SELECT ${PUBLIC_COLUMNS} FROM products p
          WHERE p.active = 1 AND (${norm("p.internal_code")} = ? OR ${norm("p.manufacturer_code")} = ?)
          LIMIT 10`,
      )
      .all(clean, clean) as unknown as PublicProduct[];
  },
};
