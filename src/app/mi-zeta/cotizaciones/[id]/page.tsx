import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteCard } from "@/components/quotes/QuoteCard";
import { requireUser } from "@/server/auth/session";
import { getQuoteDraft, getWorkshopName } from "@/server/quotes/repository";

export default async function QuotePage({ params }: PageProps<"/mi-zeta/cotizaciones/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/mi-zeta/cotizaciones/${id}`);
  const draft = getQuoteDraft(user.id, Number(id));
  if (!draft) notFound();

  return (
    <div className="mx-auto grid max-w-2xl gap-2">
      <Link href="/mi-zeta/cotizaciones" className="text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">← Cotizaciones</Link>
      <QuoteCard initial={draft} workshopName={getWorkshopName(user.id)} />
    </div>
  );
}
