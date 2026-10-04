// Copia UNA SOLA VEZ los datos de la base local (data/zeta.db, SQLite) a Supabase.
// - Crea las tablas en Supabase si no existen.
// - Se niega a correr si Supabase ya tiene datos (nunca sobrescribe).
// - Mantiene los mismos id, así todas las relaciones siguen igual.
// - No copia sesiones ni códigos de acceso (son temporales: basta con volver a entrar).
// Uso: npm run db:copy-local
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const SQLITE_PATH = "data/zeta.db";
if (!existsSync(SQLITE_PATH)) throw new Error(`No existe ${SQLITE_PATH}`);
const local = new DatabaseSync(SQLITE_PATH, { readOnly: true });

const { db, transaction, closeDb } = await import("../src/server/db/client");
const sql = await db(); // crea las tablas si hace falta

// SQLite guarda "AAAA-MM-DD HH:MM:SS" en UTC → Postgres timestamptz.
const ts = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v}+00` : v);
const bool = (v: unknown) => v === 1 || v === true;

type Spec = { table: string; columns: string[]; convert?: Record<string, (v: unknown) => unknown>; identity?: boolean };
const SPECS: Spec[] = [
  { table: "companies", columns: ["id", "name", "kind", "active", "created_at"], convert: { active: bool, created_at: ts }, identity: true },
  {
    table: "products",
    columns: ["id", "company_id", "internal_code", "description", "manufacturer_code", "part_brand", "category", "cost", "price", "active", "search_text", "created_at", "updated_at"],
    convert: { active: bool, created_at: ts, updated_at: ts },
    identity: true,
  },
  {
    table: "import_batches",
    columns: ["id", "file_name", "format", "total_rows", "valid_rows", "error_rows", "created", "updated", "unchanged", "created_at"],
    convert: { created_at: ts },
    identity: true,
  },
  { table: "users", columns: ["id", "email", "name", "workshop_name", "plan", "plan_until", "created_at"], convert: { created_at: ts }, identity: true },
  { table: "clients", columns: ["id", "user_id", "name", "phone", "email", "notes", "created_at"], convert: { created_at: ts }, identity: true },
  {
    table: "vehicles",
    columns: ["id", "user_id", "client_id", "plate", "brand", "model", "year", "engine", "fuel", "mileage", "notes", "created_at"],
    convert: { created_at: ts },
    identity: true,
  },
  {
    table: "maintenances",
    columns: ["id", "user_id", "vehicle_id", "date", "mileage", "work", "parts", "next_mileage", "next_date", "notes", "created_at"],
    convert: { created_at: ts },
    identity: true,
  },
  {
    table: "quotes",
    columns: ["id", "user_id", "number", "client_id", "vehicle_id", "vehicle_label", "title", "discount", "notes", "status", "total", "created_at", "updated_at"],
    convert: { created_at: ts, updated_at: ts },
    identity: true,
  },
  { table: "quote_items", columns: ["id", "quote_id", "position", "kind", "description", "quantity", "unit_price", "product_id"], identity: true },
  { table: "labor_prices", columns: ["id", "user_id", "name", "name_key", "price", "updated_at"], convert: { updated_at: ts }, identity: true },
  { table: "quote_templates", columns: ["id", "user_id", "name", "name_key", "items_json", "created_at"], convert: { created_at: ts }, identity: true },
  { table: "ai_usage", columns: ["subject", "day", "count"] },
];

try {
  // Seguridad: no sobrescribir datos existentes en Supabase.
  for (const s of SPECS) {
    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM ${sql(s.table)}`;
    if (n > 0) throw new Error(`Supabase ya tiene datos en "${s.table}" (${n} filas). No copio nada para no sobrescribir.`);
  }

  const summary: string[] = [];
  await transaction(async (tx) => {
    for (const s of SPECS) {
      const rows = (local.prepare(`SELECT ${s.columns.join(", ")} FROM ${s.table} ORDER BY 1`).all() as Record<string, unknown>[]).map((r) => {
        const out: Record<string, unknown> = {};
        for (const c of s.columns) out[c] = s.convert?.[c] ? s.convert[c](r[c]) : r[c];
        return out;
      });
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        // Conserva los mismos id (OVERRIDING SYSTEM VALUE) en las tablas con id automático.
        await tx.unsafe(
          `INSERT INTO ${s.table} (${s.columns.join(", ")}) ${s.identity ? "OVERRIDING SYSTEM VALUE" : ""}
           SELECT ${s.columns.join(", ")} FROM json_populate_recordset(NULL::${s.table}, ($1::text)::json)`,
          [JSON.stringify(chunk)],
        );
      }
      if (s.identity && rows.length) {
        // El próximo id nuevo sigue después del último copiado.
        await tx.unsafe(`SELECT setval(pg_get_serial_sequence('${s.table}', 'id'), (SELECT MAX(id) FROM ${s.table}))`);
      }
      summary.push(`${s.table}: ${rows.length}`);
    }
  });
  console.log("Copiado a Supabase ✓\n  " + summary.join("\n  "));
} finally {
  local.close();
  await closeDb();
}
