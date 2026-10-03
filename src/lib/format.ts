const usd = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

export function formatMoney(n: number | null | undefined): string {
  return n == null ? "—" : usd.format(n);
}

export function formatCount(n: number): string {
  return n.toLocaleString("es-EC");
}
