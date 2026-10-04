// Contrato entre el chat y cualquier fuente de productos.
// Hoy: Postgres en Supabase (alimentado por Excel). Mañana: API de ERP, etc.
// El chat solo conoce esta interfaz, nunca la fuente concreta.

// Lo que el CLIENTE puede ver. Sin costo y sin empresa (son privados).
export type PublicProduct = {
  id: number;
  code: string;
  description: string;
  manufacturerCode: string | null;
  partBrand: string | null;
  category: string | null;
  price: number | null; // Precio Zeta. null = precio por confirmar
};

export type ProductQuery = {
  vehicleTerms: string[]; // cualquiera (OR): ["aveo"]
  partPhrases: string[]; //  cualquiera (OR): ["tps", "posicion acelerador"]
  keywords: string[]; //     todas (AND): palabras libres
  limit: number;
};

export type SearchResult = {
  total: number;
  items: PublicProduct[];
  topCategories: { name: string; count: number }[];
};

export interface CatalogProvider {
  search(q: ProductQuery): Promise<SearchResult>;
  findByCode(code: string): Promise<PublicProduct[]>;
  findById(id: number): Promise<PublicProduct | null>;
}
