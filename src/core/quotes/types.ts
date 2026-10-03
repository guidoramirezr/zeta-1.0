// Cotizador: forma de una cotización y cálculos. Código puro (sirve en el
// navegador y en el servidor). Los precios vienen del mecánico, de sus
// precios habituales o del catálogo conectado; nunca se inventan.

export type QuoteItemKind = "repuesto" | "mano_obra" | "otro";

export type QuoteItem = {
  key: string; // id local para la interfaz
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unitPrice: number | null; // null = precio pendiente
  productId?: number | null; // si viene del catálogo (futuro: inventario)
};

export type QuoteVehicle = { brand: string; model: string; year: number | null };

export type QuoteDraft = {
  quoteId?: number | null; // si ya se guardó
  number?: number | null;
  status?: QuoteStatus;
  title: string;
  vehicle: QuoteVehicle | null;
  vehicleId?: number | null; // vehículo registrado en Mi Zeta
  clientId?: number | null;
  clientName?: string | null; // para mostrar
  clientPhone?: string | null;
  newClient?: { name: string; phone: string | null } | null; // se crea al guardar
  items: QuoteItem[];
  discount: number;
  notes: string;
};

// Estado de la conversación del cotizador (viaja en el contexto del chat).
export type QuoteFlow = {
  step: "job" | "labor" | "labor_price" | "parts" | "parts_pick" | "client" | "client_new";
  draft: QuoteDraft;
  laborSuggestion: { name: string; price: number } | null;
};

export type QuoteStatus = "borrador" | "enviada" | "aprobada" | "rechazada";

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export const KIND_LABELS: Record<QuoteItemKind, string> = {
  repuesto: "Repuesto",
  mano_obra: "Mano de obra",
  otro: "Otro",
};

export function newItemKey() {
  return Math.random().toString(36).slice(2, 10);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function lineTotal(i: QuoteItem): number {
  return round2((i.unitPrice ?? 0) * i.quantity);
}

export function quoteTotals(d: Pick<QuoteDraft, "items" | "discount">) {
  const subtotal = round2(d.items.reduce((s, i) => s + lineTotal(i), 0));
  const discount = Math.min(Math.max(d.discount || 0, 0), subtotal);
  return {
    subtotal,
    discount: round2(discount),
    total: round2(subtotal - discount),
    missingPrices: d.items.filter((i) => i.unitPrice == null).length,
  };
}

export function vehicleText(v: QuoteVehicle | null): string {
  return v ? [v.brand, v.model, v.year].filter(Boolean).join(" ") : "";
}

const money = (n: number) => `$${n.toFixed(2)}`;

// Mensaje para WhatsApp. El mecánico lo revisa antes de enviarlo.
export function whatsappText(d: QuoteDraft, workshop: string | null): string {
  const t = quoteTotals(d);
  const firstName = (d.clientName ?? d.newClient?.name ?? "").trim().split(/\s+/)[0];
  const vehicle = vehicleText(d.vehicle);
  const lines = [
    firstName ? `Hola ${firstName} 👋` : "Hola 👋",
    vehicle ? `Te compartimos el presupuesto para tu ${vehicle}.` : "Te compartimos el presupuesto solicitado.",
    "",
    ...d.items.map(
      (i) => `${i.description}${i.quantity !== 1 ? ` × ${i.quantity}` : ""}: ${i.unitPrice == null ? "por confirmar" : money(lineTotal(i))}`,
    ),
  ];
  if (t.discount > 0) lines.push(`Descuento: -${money(t.discount)}`);
  lines.push(`*Total: ${money(t.total)}*`);
  if (d.notes.trim()) lines.push("", d.notes.trim());
  lines.push("", "Presupuesto válido por 7 días.");
  if (workshop?.trim()) lines.push(workshop.trim());
  return lines.join("\n");
}

// Enlace de WhatsApp (abre la app con el mensaje escrito; NO envía solo).
// Teléfonos de Ecuador "0991234567" → "593991234567".
export function whatsappLink(phone: string | null | undefined, text: string): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) digits = `593${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
