const usd = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

export function formatMoney(n: number | null | undefined): string {
  return n == null ? "—" : usd.format(n);
}

export function formatCount(n: number): string {
  return n.toLocaleString("es-EC");
}

// 182450 → "182.450 km"
export function formatKm(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toLocaleString("es-EC")} km`;
}

// "2026-10-03" → "03/10/2026"
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
