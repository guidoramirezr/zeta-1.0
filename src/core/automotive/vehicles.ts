// Vehicle Intelligence (V1): diccionario de marcas y modelos comunes en Ecuador.
// Sirve para entender "Aveo" → Chevrolet Aveo. Se amplía agregando entradas.
// Las claves van normalizadas (minúsculas, sin tildes).

export type VehicleRef = { brand: string; model: string | null };

export const BRANDS: Record<string, string> = {
  chevrolet: "Chevrolet",
  chevy: "Chevrolet",
  kia: "Kia",
  hyundai: "Hyundai",
  toyota: "Toyota",
  nissan: "Nissan",
  mazda: "Mazda",
  suzuki: "Suzuki",
  ford: "Ford",
  renault: "Renault",
  volkswagen: "Volkswagen",
  vw: "Volkswagen",
  mitsubishi: "Mitsubishi",
  "great wall": "Great Wall",
  chery: "Chery",
  jac: "JAC",
  daewoo: "Daewoo",
  honda: "Honda",
  peugeot: "Peugeot",
  fiat: "Fiat",
  citroen: "Citroën",
  mercedes: "Mercedes-Benz",
  geely: "Geely",
  dfsk: "DFSK",
};

// modelo → marca
export const MODELS: Record<string, string> = {
  aveo: "Chevrolet", spark: "Chevrolet", optra: "Chevrolet", sail: "Chevrolet", corsa: "Chevrolet",
  "d max": "Chevrolet", dmax: "Chevrolet", luv: "Chevrolet", cruze: "Chevrolet", vitara: "Chevrolet",
  "grand vitara": "Chevrolet", captiva: "Chevrolet", beat: "Chevrolet", tracker: "Chevrolet",
  onix: "Chevrolet", esteem: "Chevrolet", forsa: "Chevrolet", steem: "Chevrolet", npr: "Chevrolet",
  rio: "Kia", picanto: "Kia", sportage: "Kia", cerato: "Kia", sorento: "Kia", soluto: "Kia",
  carnival: "Kia", soul: "Kia", pregio: "Kia",
  accent: "Hyundai", tucson: "Hyundai", elantra: "Hyundai", getz: "Hyundai", i10: "Hyundai",
  "santa fe": "Hyundai", h1: "Hyundai", creta: "Hyundai", atos: "Hyundai", "grand i10": "Hyundai",
  corolla: "Toyota", hilux: "Toyota", yaris: "Toyota", fortuner: "Toyota", rav4: "Toyota",
  "land cruiser": "Toyota", prado: "Toyota",
  sentra: "Nissan", tiida: "Nissan", versa: "Nissan", frontier: "Nissan", "x trail": "Nissan",
  navara: "Nissan", march: "Nissan", "pathfinder": "Nissan",
  "bt 50": "Mazda", bt50: "Mazda", "mazda 3": "Mazda", "mazda 2": "Mazda", "mazda 6": "Mazda", "cx 5": "Mazda",
  swift: "Suzuki", "sx4": "Suzuki", jimny: "Suzuki",
  fiesta: "Ford", ecosport: "Ford", ranger: "Ford", explorer: "Ford", escape: "Ford", focus: "Ford",
  logan: "Renault", sandero: "Renault", duster: "Renault", clio: "Renault", stepway: "Renault",
  gol: "Volkswagen", golf: "Volkswagen", jetta: "Volkswagen", amarok: "Volkswagen", vento: "Volkswagen",
  lancer: "Mitsubishi", montero: "Mitsubishi", l200: "Mitsubishi", outlander: "Mitsubishi",
  wingle: "Great Wall", haval: "Great Wall", voleex: "Great Wall",
  tiggo: "Chery", qq: "Chery",
  lanos: "Daewoo", nubira: "Daewoo", matiz: "Daewoo", cielo: "Daewoo", racer: "Daewoo",
  civic: "Honda", crv: "Honda", "cr v": "Honda", fit: "Honda", accord: "Honda",
};

const MODEL_KEYS = Object.keys(MODELS).sort((a, b) => b.length - a.length);
const BRAND_KEYS = Object.keys(BRANDS).sort((a, b) => b.length - a.length);

// Busca marca/modelo dentro de un texto ya normalizado.
export function detectVehicle(normalized: string): VehicleRef | null {
  const padded = ` ${normalized} `;
  const model = MODEL_KEYS.find((m) => padded.includes(` ${m} `));
  if (model) return { brand: MODELS[model], model: titleCase(model) };
  const brand = BRAND_KEYS.find((b) => padded.includes(` ${b} `));
  if (brand) return { brand: BRANDS[brand], model: null };
  return null;
}

// Palabras con las que se busca ese vehículo en las descripciones del catálogo.
export function vehicleSearchTerms(v: VehicleRef): string[] {
  if (v.model) return [v.model.toLowerCase()];
  const brandKeys = BRAND_KEYS.filter((k) => BRANDS[k] === v.brand);
  const models = Object.keys(MODELS).filter((m) => MODELS[m] === v.brand);
  return [...brandKeys, ...models];
}

// Palabras de vehículo que no deben usarse como palabras de producto.
export function vehicleWords(): Set<string> {
  return new Set([...BRAND_KEYS, ...MODEL_KEYS].flatMap((k) => k.split(" ")));
}

export function vehicleLabel(v: VehicleRef): string {
  return v.model ? `${v.brand} ${v.model}` : v.brand;
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
