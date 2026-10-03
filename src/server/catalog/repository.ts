import "server-only";
import { db } from "@/server/db/client";
import { normalizeText } from "./normalize";

// Consultas de catálogo para el DASHBOARD (incluye costo y empresa).
// El chat usará su propia función que NO devuelve el costo.

export type AdminProduct = {
  id: number;
  company: string;
  internalCode: string;
  description: string;
  manufacturerCode: string | null;
  partBrand: string | null;
  category: string | null;
  cost: number | null;
  price: number | null;
  active: number;
};

export function listAdminProducts(opts: { q?: string; page: number; pageSize: number }) {
  const conn = db();
  const words = opts.q ? normalizeText(opts.q).split(" ").filter(Boolean) : [];
  const where = words.length ? "WHERE " + words.map(() => "p.search_text LIKE ?").join(" AND ") : "";
  const params = words.map((w) => `%${w}%`);

  const { total } = conn
    .prepare(`SELECT COUNT(*) AS total FROM products p ${where}`)
    .get(...params) as { total: number };
  const items = conn
    .prepare(
      `SELECT p.id, c.name AS company, p.internal_code AS internalCode, p.description,
              p.manufacturer_code AS manufacturerCode, p.part_brand AS partBrand, p.category,
              p.cost, p.price, p.active
         FROM products p JOIN companies c ON c.id = p.company_id
         ${where}
        ORDER BY p.category, p.description
        LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.pageSize, (opts.page - 1) * opts.pageSize) as unknown as AdminProduct[];
  return { total, items };
}

export function catalogStats() {
  const conn = db();
  const companies = conn
    .prepare(
      `SELECT c.name, COUNT(p.id) AS products,
              SUM(CASE WHEN p.price IS NULL THEN 1 ELSE 0 END) AS withoutPrice
         FROM companies c LEFT JOIN products p ON p.company_id = c.id
        GROUP BY c.id ORDER BY c.name`,
    )
    .all() as { name: string; products: number; withoutPrice: number }[];
  const lastImport = conn
    .prepare("SELECT file_name AS fileName, created_at AS createdAt FROM import_batches ORDER BY id DESC LIMIT 1")
    .get() as { fileName: string; createdAt: string } | undefined;
  return {
    totalProducts: companies.reduce((s, c) => s + c.products, 0),
    companies,
    lastImport: lastImport ?? null,
  };
}
