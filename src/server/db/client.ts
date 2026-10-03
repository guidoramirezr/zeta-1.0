import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./migrations";

// Base de datos local (SQLite, incluida en Node). Un solo archivo: data/zeta.db
// Se puede cambiar la ubicación con la variable ZETA_DB_PATH.
const DB_PATH = process.env.ZETA_DB_PATH ?? path.join(process.cwd(), "data", "zeta.db");

// En desarrollo Next recarga módulos; guardamos la conexión en globalThis
// para no abrir una nueva en cada recarga.
const globalForDb = globalThis as unknown as { zetaDb?: DatabaseSync; zetaDbVersion?: number };

export function db(): DatabaseSync {
  if (!globalForDb.zetaDb) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const conn = new DatabaseSync(DB_PATH);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    globalForDb.zetaDb = conn;
  }
  // Si se agregó una migración mientras el servidor corría, aplicarla.
  if (globalForDb.zetaDbVersion !== MIGRATIONS.length) {
    migrate(globalForDb.zetaDb);
    globalForDb.zetaDbVersion = MIGRATIONS.length;
  }
  return globalForDb.zetaDb;
}

function migrate(conn: DatabaseSync) {
  const { user_version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    transaction(conn, () => {
      conn.exec(MIGRATIONS[v]);
      conn.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function transaction<T>(conn: DatabaseSync, fn: () => T): T {
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
