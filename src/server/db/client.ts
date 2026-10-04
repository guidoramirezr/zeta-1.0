import "server-only";
import postgres from "postgres";
import { MIGRATIONS } from "./migrations";

// Base de datos de Zeta: Postgres en Supabase (DATABASE_URL en .env.local / Vercel).
// Se usa el "Transaction pooler" de Supabase, ideal para Vercel (prepare: false).
//
// Uso:   const rows = await (await db())`SELECT … WHERE id = ${id}`;
// Transacción:  await transaction(async (tx) => { await tx`…`; });

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
export type Q = Sql | Tx; // cualquiera de los dos sirve para consultar

// Postgres devuelve fechas y NUMERIC como objetos/strings: los convertimos al
// formato que usa el resto de Zeta (texto "AAAA-MM-DD…" y números).
const types = {
  numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
  date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
  timestamptz: {
    to: 1184,
    from: [1184, 1114],
    serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
    parse: (x: string) => new Date(x).toISOString(),
  },
  bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
};

type Global = { zetaSql?: Sql; zetaReady?: Promise<void>; zetaVersion?: number };
const g = globalThis as unknown as Global;

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (conexión a Supabase) en .env.local");
  return postgres(url, {
    prepare: false, // requerido por el pooler de Supabase en modo transacción
    max: Number(process.env.ZETA_DB_POOL ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    types,
    // Pruebas: cada corrida usa su propio esquema (ZETA_DB_SCHEMA) y lo borra al final.
    connection: process.env.ZETA_DB_SCHEMA ? { search_path: process.env.ZETA_DB_SCHEMA } : undefined,
    onnotice: () => {},
  });
}

// Conexión lista (con el esquema al día). Se reutiliza entre pedidos y recargas.
export async function db(): Promise<Sql> {
  g.zetaSql ??= connect();
  if (g.zetaVersion !== MIGRATIONS.length) {
    g.zetaReady ??= migrate(g.zetaSql).then(() => {
      g.zetaVersion = MIGRATIONS.length;
    }).finally(() => {
      g.zetaReady = undefined;
    });
    await g.zetaReady;
  }
  return g.zetaSql;
}

export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = await db();
  return sql.begin(fn) as Promise<T>;
}

async function migrate(sql: Sql) {
  await sql.begin(async (tx) => {
    // Evita que dos servidores (Vercel) migren a la vez.
    await tx`SELECT pg_advisory_xact_lock(48151623)`;
    await tx`CREATE TABLE IF NOT EXISTS zeta_migrations (
      version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await tx`ALTER TABLE zeta_migrations ENABLE ROW LEVEL SECURITY`;
    const [{ v }] = await tx<{ v: number }[]>`SELECT COALESCE(MAX(version), 0)::int AS v FROM zeta_migrations`;
    for (let i = v; i < MIGRATIONS.length; i++) {
      await tx.unsafe(MIGRATIONS[i]);
      await tx`INSERT INTO zeta_migrations (version) VALUES (${i + 1})`;
    }
  });
}

// Cierra la conexión (scripts y pruebas).
export async function closeDb() {
  await g.zetaSql?.end({ timeout: 5 });
  g.zetaSql = undefined;
  g.zetaVersion = undefined;
}
