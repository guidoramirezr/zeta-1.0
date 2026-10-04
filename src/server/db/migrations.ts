// Esquema de la base de datos de Zeta (Postgres / Supabase).
// Cada migración se aplica una sola vez (tabla zeta_migrations).
// Para cambiar el esquema, AGREGAR una migración nueva al final; nunca editar una ya aplicada.
//
// Seguridad: todas las tablas tienen RLS activado y SIN políticas. Así la API
// pública de Supabase (clave publishable) no puede leer ni escribir nada; solo
// el servidor de Zeta, que se conecta con DATABASE_URL, accede a los datos.
// La privacidad entre mecánicos se aplica además en el código (filtro por user_id).

export const MIGRATIONS: string[] = [
  // 1 — esquema completo inicial (equivalente a las migraciones 1-4 de SQLite)
  `
  CREATE TABLE companies (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT    NOT NULL,
    kind        TEXT    NOT NULL DEFAULT 'distribuidor',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX companies_name_key ON companies (lower(name));

  CREATE TABLE products (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id        BIGINT  NOT NULL REFERENCES companies(id),
    internal_code     TEXT    NOT NULL,
    description       TEXT    NOT NULL,
    manufacturer_code TEXT,
    part_brand        TEXT,
    category          TEXT,
    cost              NUMERIC(12,2),   -- PRIVADO: nunca sale al chat ni a Claude
    price             NUMERIC(12,2),   -- Precio Zeta (público). NULL = por confirmar
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    search_text       TEXT    NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, internal_code)
  );
  CREATE INDEX products_manufacturer_code ON products (manufacturer_code);

  CREATE TABLE import_batches (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_name   TEXT    NOT NULL,
    format      TEXT    NOT NULL,
    total_rows  INTEGER NOT NULL,
    valid_rows  INTEGER NOT NULL,
    error_rows  INTEGER NOT NULL,
    created     INTEGER NOT NULL,
    updated     INTEGER NOT NULL,
    unchanged   INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE users (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email          TEXT NOT NULL,
    name           TEXT,
    workshop_name  TEXT,
    plan           TEXT NOT NULL DEFAULT 'gratis',   -- gratis | pro
    plan_until     DATE,                             -- NULL = sin vencimiento
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX users_email_key ON users (lower(email));

  CREATE TABLE login_codes (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       TEXT    NOT NULL,
    code_hash   TEXT    NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX login_codes_email ON login_codes (email);

  CREATE TABLE sessions (
    token_hash  TEXT   PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE clients (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT   NOT NULL,
    phone       TEXT,
    email       TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX clients_user ON clients (user_id);

  CREATE TABLE vehicles (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id   BIGINT REFERENCES clients(id) ON DELETE SET NULL,
    plate       TEXT,
    brand       TEXT   NOT NULL,
    model       TEXT   NOT NULL,
    year        INTEGER,
    engine      TEXT,
    fuel        TEXT,
    mileage     INTEGER,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX vehicles_user ON vehicles (user_id);

  CREATE TABLE maintenances (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id    BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date          DATE   NOT NULL,
    mileage       INTEGER,
    work          TEXT   NOT NULL,
    parts         TEXT,
    next_mileage  INTEGER,
    next_date     DATE,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX maintenances_vehicle ON maintenances (user_id, vehicle_id);

  CREATE TABLE quotes (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    number        INTEGER NOT NULL,
    client_id     BIGINT  REFERENCES clients(id) ON DELETE SET NULL,
    vehicle_id    BIGINT  REFERENCES vehicles(id) ON DELETE SET NULL,
    vehicle_label TEXT,
    title         TEXT,
    discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes         TEXT,
    status        TEXT NOT NULL DEFAULT 'borrador'
                  CHECK (status IN ('borrador', 'enviada', 'aprobada', 'rechazada')),
    total         NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, number)
  );

  CREATE TABLE quote_items (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_id    BIGINT  NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    kind        TEXT    NOT NULL CHECK (kind IN ('repuesto', 'mano_obra', 'otro')),
    description TEXT    NOT NULL,
    quantity    NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit_price  NUMERIC(12,2),
    product_id  BIGINT REFERENCES products(id) ON DELETE SET NULL
  );
  CREATE INDEX quote_items_quote ON quote_items (quote_id);

  CREATE TABLE labor_prices (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT   NOT NULL,
    name_key    TEXT   NOT NULL,
    price       NUMERIC(12,2) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name_key)
  );

  CREATE TABLE quote_templates (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT   NOT NULL,
    name_key    TEXT   NOT NULL,
    items_json  TEXT   NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name_key)
  );

  CREATE TABLE ai_usage (
    subject  TEXT    NOT NULL,   -- u:<id usuario>, a:<id invitado>, ip:<hash>
    day      TEXT    NOT NULL,   -- AAAA-MM-DD (hora de Ecuador)
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (subject, day)
  );

  -- Bloquear la API pública de Supabase en todas las tablas (ver nota arriba).
  ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
  ALTER TABLE import_batches  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
  ALTER TABLE login_codes     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
  ALTER TABLE clients         ENABLE ROW LEVEL SECURITY;
  ALTER TABLE vehicles        ENABLE ROW LEVEL SECURITY;
  ALTER TABLE maintenances    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE quotes          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE quote_items     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE labor_prices    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ai_usage        ENABLE ROW LEVEL SECURITY;
  `,
];
