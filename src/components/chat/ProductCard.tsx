import type { PublicProduct } from "@/core/catalog/types";
import { formatMoney } from "@/lib/format";

export function ProductCard({ product }: { product: PublicProduct }) {
  return (
    <article className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] p-3.5">
      <div>
        {product.category && (
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--z-muted)]">{product.category}</p>
        )}
        <h3 className="mt-1 text-[14px] font-medium leading-snug">{product.description}</h3>
        <p className="mt-1.5 text-xs text-[var(--z-muted)]">
          Código: <span className="font-mono">{product.code}</span>
          {product.partBrand && <> · {product.partBrand}</>}
        </p>
      </div>
      <p className="text-[17px] font-semibold tabular-nums">
        {product.price != null ? (
          formatMoney(product.price)
        ) : (
          <span className="text-sm font-medium text-[var(--z-muted)]">Precio por confirmar</span>
        )}
      </p>
    </article>
  );
}
