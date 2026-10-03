import { detectPart, partWords, type PartRef } from "@/core/automotive/parts";
import { detectVehicle, vehicleWords, type VehicleRef } from "@/core/automotive/vehicles";
import { normalizeText } from "@/server/catalog/normalize";

// Intérprete de intención V1 (reglas, sin IA, costo cero).
// Más adelante Claude podrá producir esta misma estructura para frases
// más complejas; el resto del sistema no cambia.

export type Intent =
  | "greeting"
  | "code_lookup" //  "¿Qué producto es el código SA123?"
  | "product_search" //  "¿Tienes sensor TPS para Aveo?" / "repuestos para Aveo"
  | "diagnostic" //  "mi auto tiembla al acelerar"
  | "obd" //  "¿Qué significa P0171?"
  | "unknown";

export type Interpretation = {
  intent: Intent;
  vehicle: VehicleRef | null;
  part: PartRef | null;
  code: string | null;
  obdCode: string | null;
  year: number | null;
  // Palabras útiles que no son vehículo ni repuesto conocido (búsqueda libre).
  keywords: string[];
};

const STOPWORDS = new Set(
  ("a al algo alguna alguno algun busco buscar busca cual cuanto cuesta cuestan de del donde el en es esta este " +
    "estoy hay la las le lo los me mi muestrame muestra necesito para por precio precios producto productos " +
    "que quiero repuesto repuestos se si su tiene tienes tienen un una uno y ya ver todos todo tengo mas carro auto " +
    "vehiculo opciones disponible disponibles hola buenas buenos dias tardes noches gracias favor porfa codigo cod " +
    "del dame quisiera saber sobre con sin otro otra otros otras")
    .split(" "),
);

const SYMPTOMS = [
  "falla", "fallas", "tiembla", "vibra", "vibracion", "ruido", "suena", "no prende", "no arranca", "se apaga",
  "humo", "consume", "pierde fuerza", "check engine", "recalienta", "calienta", "jalonea", "jaloneo", "cascabelea",
  "solucionar", "problema", "diagnostico", "se ahoga", "titubea", "luz de",
];

const OBD_RE = /\b([pbcu][0-3][0-9a-f]{3})\b/i;
// Código de producto: "código X", "busca X", "cod X" o un mensaje que es solo un código.
const CODE_AFTER_KEYWORD_RE = /\b(?:codigo|cod|busca|buscar|referencia|ref)\s*[:#]?\s*([a-z0-9][a-z0-9./-]*\d[a-z0-9./-]*)/i;
const LONE_CODE_RE = /^\s*([a-z0-9]*\d[a-z0-9./-]*)\s*\??\s*$/i;

export function interpret(message: string, context?: { vehicle?: VehicleRef | null }): Interpretation {
  const norm = normalizeText(message);
  const padded = ` ${norm} `;

  const obd = message.match(OBD_RE)?.[1]?.toUpperCase() ?? null;
  const vehicleInMessage = detectVehicle(norm);
  const vehicle = vehicleInMessage ?? context?.vehicle ?? null;
  const part = detectPart(norm);
  const yearMatch = norm.match(/\b(19[89]\d|20[0-3]\d)\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const vw = vehicleWords();
  const pw = partWords();
  const keywords = norm
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !vw.has(w) && !pw.has(w) && !/^\d+$/.test(w));

  const base = { vehicle, part, obdCode: obd, year, keywords };

  const plain = message.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // "código" → "codigo"
  const codeMatch = plain.match(CODE_AFTER_KEYWORD_RE) ?? plain.match(LONE_CODE_RE);
  if (codeMatch && !obd && !part) {
    return { ...base, intent: "code_lookup", code: codeMatch[1].toUpperCase() };
  }
  if (obd) return { ...base, intent: "obd", code: null };
  if (SYMPTOMS.some((s) => padded.includes(` ${s} `) || padded.includes(` ${s}`))) {
    return { ...base, intent: "diagnostic", code: null };
  }
  if (part || vehicleInMessage || keywords.length > 0) {
    return { ...base, intent: "product_search", code: null };
  }
  if (/\b(hola|buenas|buenos|saludos|hey)\b/.test(norm)) return { ...base, intent: "greeting", code: null };
  return { ...base, intent: "unknown", code: null };
}
