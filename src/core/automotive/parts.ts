// Parts Intelligence (V1): sinónimos de repuestos.
// Cada repuesto tiene:
//   - triggers: cómo lo dice el cliente
//   - match:    frases con las que aparece en los catálogos (basta una)
// Todo normalizado (minúsculas, sin tildes). Se amplía agregando entradas.

export type PartRef = { id: string; label: string; match: string[] };

type PartDef = PartRef & { triggers: string[] };

export const PARTS: PartDef[] = [
  { id: "ckp", label: "Sensor de cigüeñal (CKP)", triggers: ["ckp", "sensor ciguenal", "sensor de ciguenal", "posicion ciguenal", "ciguenal"], match: ["ckp", "ciguenal"] },
  { id: "cmp", label: "Sensor de árbol de levas (CMP)", triggers: ["cmp", "arbol de levas", "arbol de leva", "sensor de levas", "sensor leva"], match: ["cmp", "arbol de leva", "arbol leva", "levas"] },
  { id: "tps", label: "Sensor TPS (posición del acelerador)", triggers: ["tps", "sensor de aceleracion", "sensor aceleracion", "sensor del acelerador", "posicion acelerador", "posicion mariposa", "sensor mariposa"], match: ["tps", "posicion acelerador", "posicion mariposa"] },
  { id: "o2", label: "Sensor de oxígeno", triggers: ["sensor de oxigeno", "sensor oxigeno", "oxigeno", "sonda lambda", "lambda", "o2"], match: ["oxigeno", "o2", "lambda"] },
  { id: "maf", label: "Sensor MAF", triggers: ["maf", "flujo de aire", "flujometro", "sensor de flujo"], match: ["maf", "flujo de aire"] },
  { id: "map", label: "Sensor MAP", triggers: ["sensor map", "map", "presion absoluta", "presion del multiple"], match: ["sensor map", "map"] },
  { id: "abs", label: "Sensor ABS", triggers: ["sensor abs", "abs"], match: ["abs"] },
  { id: "knock", label: "Sensor de golpeteo", triggers: ["golpeteo", "sensor de detonacion", "knock"], match: ["golpeteo", "detonacion", "knock"] },
  { id: "temp", label: "Sensor de temperatura", triggers: ["sensor de temperatura", "sensor temperatura", "ect", "bulbo de temperatura"], match: ["sensor temperatura", "temperatura"] },
  { id: "vss", label: "Sensor de velocidad", triggers: ["sensor de velocidad", "sensor velocimetro", "velocimetro", "vss"], match: ["velocimetro", "velocidad"] },
  { id: "iac", label: "Válvula IAC", triggers: ["iac", "valvula iac", "valvula de ralenti", "ralenti", "minimo"], match: ["iac", "ralenti"] },
  { id: "pcv", label: "Válvula PCV", triggers: ["pcv", "valvula pcv"], match: ["pcv"] },
  { id: "bomba-combustible", label: "Bomba de combustible", triggers: ["bomba de gasolina", "bomba gasolina", "bomba de combustible", "bomba combustible"], match: ["bomba combustible", "bomba gasolina"] },
  { id: "bomba-agua", label: "Bomba de agua", triggers: ["bomba de agua", "bomba agua"], match: ["bomba agua"] },
  { id: "bomba-aceite", label: "Bomba de aceite", triggers: ["bomba de aceite", "bomba aceite"], match: ["bomba aceite"] },
  { id: "kit-distribucion", label: "Kit de distribución", triggers: ["kit de distribucion", "kit distribucion", "kit de tiempo"], match: ["kit distribucion"] },
  { id: "banda-distribucion", label: "Banda de distribución", triggers: ["banda de distribucion", "banda distribucion", "correa de distribucion", "banda de tiempo", "correa de tiempo"], match: ["banda distribucion", "distribucion"] },
  { id: "banda", label: "Bandas / correas", triggers: ["banda", "bandas", "correa", "correas", "banda accesorios", "banda alternador"], match: ["banda"] },
  { id: "pastillas", label: "Pastillas de freno", triggers: ["pastillas", "pastilla", "pastillas de freno", "frenos", "freno"], match: ["pastilla", "freno"] },
  { id: "rotula", label: "Rótula de suspensión", triggers: ["rotula", "rotulas"], match: ["rotula"] },
  { id: "terminal", label: "Terminal de dirección", triggers: ["terminal de direccion", "terminal direccion", "terminales"], match: ["terminal direccion", "terminal"] },
  { id: "articulacion", label: "Articulación de dirección", triggers: ["articulacion", "axial", "articulacion de direccion"], match: ["articulacion"] },
  { id: "barra-link", label: "Barra link / bieleta", triggers: ["barra link", "bieleta", "link estabilizador"], match: ["barra link", "link"] },
  { id: "amortiguador", label: "Amortiguadores y bases", triggers: ["amortiguador", "amortiguadores", "base amortiguador", "soporte amortiguador"], match: ["amortiguador"] },
  { id: "base-motor", label: "Base de motor", triggers: ["base de motor", "base motor", "soporte de motor", "soporte motor"], match: ["base motor"] },
  { id: "ruliman-rueda", label: "Rulimán de rueda", triggers: ["ruliman de rueda", "ruliman rueda", "rodamiento de rueda", "manzana"], match: ["ruliman rueda"] },
  { id: "ruliman-embrague", label: "Rulimán de embrague", triggers: ["ruliman de embrague", "ruliman embrague", "collarin", "rodamiento embrague"], match: ["ruliman embrague"] },
  { id: "cables-bujia", label: "Cables de bujía", triggers: ["cables de bujia", "cable de bujias", "cables bujia", "juego de cables"], match: ["cable bujia", "cables bujia"] },
  { id: "filtro", label: "Filtros", triggers: ["filtro", "filtros", "filtro de aceite", "filtro de aire", "filtro de gasolina"], match: ["filtro"] },
  { id: "manguera", label: "Mangueras", triggers: ["manguera", "mangueras"], match: ["manguera"] },
  { id: "buje", label: "Bujes", triggers: ["buje", "bujes", "bocin"], match: ["buje", "bocin"] },
  { id: "sensores", label: "Sensores", triggers: ["sensor", "sensores"], match: ["sensor"] },
];

// Familias genéricas ("sensor") solo cuentan si no hay un repuesto específico:
// "sensor TPS" → TPS, no todos los sensores.
const GENERIC = new Set(["sensores"]);

// Específicos primero; dentro de cada grupo, los triggers más largos primero.
const TRIGGERS = PARTS.flatMap((p) => p.triggers.map((t) => ({ t, p }))).sort(
  (a, b) => Number(GENERIC.has(a.p.id)) - Number(GENERIC.has(b.p.id)) || b.t.length - a.t.length,
);

export function detectPart(normalized: string): PartRef | null {
  const padded = ` ${normalized} `;
  const hit = TRIGGERS.find(({ t }) => padded.includes(` ${t} `));
  if (!hit) return null;
  const { id, label, match } = hit.p;
  return { id, label, match };
}

export function partWords(): Set<string> {
  return new Set(PARTS.flatMap((p) => p.triggers.flatMap((t) => t.split(" "))));
}
