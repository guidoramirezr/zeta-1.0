import "server-only";
import { db } from "@/server/db/client";
import { normalizeText } from "./normalize";

// Consultas de catálogo para el DASHBOARD (incluye costo y empresa).
// El chat usa catalogProvider, que NO devuelve el costo.

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
  active: boolean;
};

export async function listAdminProducts(opts: { q?: string; page: number; pageSize: number }) {
  const sql = await db();
  const words = opts.q ? normalizeText(opts.q).split(" ").filter(Boolean) : [];
  const where = words.reduce((acc, w) => sql`${acc} AND p.search_text LIKE ${`%${w}%`}`, sql`TRUE`);

  const [{ total }] = await sql<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`;
  const items = await sql<AdminProduct[]>`
    SELECT p.id, c.name AS company, p.internal_code AS "internalCode", p.description,
           p.manufacturer_code AS "manufacturerCode", p.part_brand AS "partBrand", p.category,
           p.cost, p.price, p.active
      FROM products p JOIN companies c ON c.id = p.company_id
     WHERE ${where}
     ORDER BY p.category NULLS LAST, p.description
     LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`;
  return { total, items: [...items] };
}

export async function catalogStats() {
  const sql = await db();
  const companies = await sql<{ name: string; products: number; withoutPrice: number }[]>`
    SELECT c.name, COUNT(p.id)::int AS products,
           COUNT(p.id) FILTER (WHERE p.price IS NULL)::int AS "withoutPrice"
      FROM companies c LEFT JOIN products p ON p.company_id = c.id
     GROUP BY c.id ORDER BY lower(c.name)`;
  const [lastImport] = await sql<{ fileName: string; createdAt: string }[]>`
    SELECT file_name AS "fileName", created_at AS "createdAt" FROM import_batches ORDER BY id DESC LIMIT 1`;
  return {
    totalProducts: companies.reduce((s, c) => s + c.products, 0),
    companies: [...companies],
    lastImport: lastImport ?? null,
  };
}
