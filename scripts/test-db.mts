// Base de datos para pruebas: un esquema TEMPORAL en Supabase (zeta_test_<n>).
// Nunca toca las tablas reales. Usa el "Session pooler" (puerto 5432), que
// respeta el esquema elegido; antes de seguir, VERIFICA que está aislado.
import postgres from "postgres";

export async function setupTestDatabase() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Falta DATABASE_URL en .env.local");
  const url = base.replace(/:6543\//, ":5432/");
  const schema = `zeta_test_${process.pid}_${Date.now() % 100000}`;

  const admin = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE SCHEMA "${schema}"`);

  // Comprobación de seguridad: una conexión como la de Zeta debe quedar en el esquema de prueba.
  const probe = postgres(url, { prepare: false, max: 1, connection: { search_path: schema }, onnotice: () => {} });
  const [{ s }] = await probe`SELECT current_schema() AS s`;
  await probe.end();
  if (s !== schema) {
    await admin.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    throw new Error(`Aislamiento fallido (esquema actual: ${s}). Prueba cancelada para proteger tus datos.`);
  }

  process.env.DATABASE_URL = url;
  process.env.ZETA_DB_SCHEMA = schema;
  process.env.ZETA_DB_POOL = "2";

  return async function cleanup() {
    const { closeDb } = await import("../src/server/db/client");
    await closeDb();
    await admin.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  };
}
