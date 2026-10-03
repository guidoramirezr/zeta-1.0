// Esquema de la base de datos de Zeta. Cada migración se aplica una sola vez
// (se lleva la cuenta con PRAGMA user_version). Para cambiar el esquema,
// AGREGAR una migración nueva al final; nunca editar una ya aplicada.
//
// SQL escrito para ser fácil de portar a Postgres/Supabase más adelante.

export const MIGRATIONS: string[] = [
  // 1 — empresas, productos e historial de importaciones
  `
  CREATE TABLE companies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    -- distribuidor | taller | marca  (más tipos en el futuro)
    kind            TEXT    NOT NULL DEFAULT 'distribuidor',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE products (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id        INTEGER NOT NULL REFERENCES companies(id),
    internal_code     TEXT    NOT NULL,
    description       TEXT    NOT NULL,
    manufacturer_code TEXT,
    part_brand        TEXT,
    category          TEXT,
    -- PRIVADO: solo para el dashboard. Nunca se envía al chat ni a Claude.
    cost              REAL,
    -- Precio Zeta: el que ve el cliente. NULL = precio por confirmar.
    price             REAL,
    active            INTEGER NOT NULL DEFAULT 1,
    -- Texto normalizado (sin tildes, minúsculas) para la búsqueda V1.
    search_text       TEXT    NOT NULL,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (company_id, internal_code)
  );
  CREATE INDEX products_company ON products(company_id);
  CREATE INDEX products_manufacturer_code ON products(manufacturer_code);

  CREATE TABLE import_batches (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name    TEXT    NOT NULL,
    format       TEXT    NOT NULL,
    total_rows   INTEGER NOT NULL,
    valid_rows   INTEGER NOT NULL,
    error_rows   INTEGER NOT NULL,
    created      INTEGER NOT NULL,
    updated      INTEGER NOT NULL,
    unchanged    INTEGER NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  `,

  // 2 — cuentas (login por correo + código) y "Mi Zeta":
  //     clientes, vehículos y mantenimientos. TODO dato privado lleva user_id
  //     y todas las consultas filtran por él en el servidor.
  `
  CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Códigos de un solo uso para iniciar sesión (se guarda solo el hash).
  CREATE TABLE login_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    NOT NULL COLLATE NOCASE,
    code_hash   TEXT    NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    expires_at  TEXT    NOT NULL,
    used_at     TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX login_codes_email ON login_codes(email);

  -- Sesiones (la cookie guarda un token; aquí solo su hash).
  CREATE TABLE sessions (
    token_hash  TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE clients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    phone       TEXT,
    email       TEXT,
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX clients_user ON clients(user_id);

  CREATE TABLE vehicles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    plate       TEXT,
    brand       TEXT    NOT NULL,
    model       TEXT    NOT NULL,
    year        INTEGER,
    engine      TEXT,
    fuel        TEXT,
    mileage     INTEGER,
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX vehicles_user ON vehicles(user_id);

  CREATE TABLE maintenances (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date          TEXT    NOT NULL,
    mileage       INTEGER,
    work          TEXT    NOT NULL,
    parts         TEXT,
    next_mileage  INTEGER,
    next_date     TEXT,
    notes         TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX maintenances_vehicle ON maintenances(user_id, vehicle_id);
  `,
];
