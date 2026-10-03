// Normaliza texto para comparar y buscar: minúsculas, sin tildes,
// solo letras/números separados por un espacio. "CIGÜEÑAL 1.5" → "ciguenal 1 5"
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildSearchText(p: {
  description: string;
  internalCode: string;
  manufacturerCode?: string | null;
  partBrand?: string | null;
  category?: string | null;
}): string {
  return normalizeText(
    [p.description, p.internalCode, p.manufacturerCode, p.partBrand, p.category]
      .filter(Boolean)
      .join(" "),
  );
}
