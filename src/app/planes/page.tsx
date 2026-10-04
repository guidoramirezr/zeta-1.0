import Link from "next/link";
import { ZetaLogo } from "@/components/brand/ZetaLogo";
import { getCurrentUser } from "@/server/auth/session";
import { dailyLimit, usageStatus, userTier, type Tier } from "@/server/usage/limits";

export default async function PlansPage() {
  const user = await getCurrentUser();
  const tier: Tier = userTier(user?.id ?? null);
  const status = user ? usageStatus({ userId: user.id, anonId: null, ip: null }) : null;

  const plans: { tier: Tier; name: string; price: string; features: string[] }[] = [
    {
      tier: "invitado",
      name: "Sin cuenta",
      price: "Gratis",
      features: [`${dailyLimit("invitado")} consultas con IA al día`, "Búsqueda en el catálogo sin límite"],
    },
    {
      tier: "gratis",
      name: "Cuenta Zeta",
      price: "Gratis",
      features: [
        `${dailyLimit("gratis")} consultas con IA al día`,
        "Mi Zeta: clientes, vehículos e historial",
        "Cotizador con WhatsApp",
      ],
    },
    {
      tier: "pro",
      name: "Zeta Pro",
      price: "Pago mensual",
      features: [`${dailyLimit("pro")} consultas con IA al día`, "Todo lo de la cuenta gratis", "Ideal para talleres con alto volumen"],
    },
  ];

  return (
    <div className="min-h-dvh bg-[var(--z-bg)] px-4 text-[var(--z-text)]">
      <header className="mx-auto flex h-14 max-w-4xl items-center justify-between">
        <Link href="/"><ZetaLogo /></Link>
        <Link href="/" className="text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">Volver al chat</Link>
      </header>
      <main className="mx-auto grid max-w-4xl gap-6 py-8">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Planes</h1>
          <p className="mt-1 text-[15px] text-[var(--z-muted)]">
            Las consultas con IA se renuevan cada día a medianoche. Buscar repuestos y cotizar no consume consultas.
          </p>
          {status && (
            <p className="mt-2 text-sm">
              Hoy usaste <strong>{status.used}</strong> de <strong>{status.limit}</strong> consultas con IA.
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => {
            const current = p.tier === tier;
            return (
              <section
                key={p.tier}
                className={`flex flex-col gap-3 rounded-2xl border bg-[var(--z-surface)] p-5 ${current ? "border-[var(--z-ink)]" : "border-[var(--z-line)]"}`}
              >
                <div>
                  <p className="text-sm text-[var(--z-muted)]">{p.price}</p>
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                </div>
                <ul className="grid gap-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                <div className="mt-auto pt-2">
                  {current ? (
                    <span className="inline-block rounded-full bg-[var(--z-soft)] px-3 py-1.5 text-sm">Tu plan actual</span>
                  ) : p.tier === "gratis" && !user ? (
                    <Link href="/entrar?next=/planes" className="inline-block rounded-full bg-[var(--z-ink)] px-4 py-2 text-sm text-[var(--z-on-ink)]">
                      Crear cuenta gratis
                    </Link>
                  ) : p.tier === "pro" ? (
                    <span className="inline-block rounded-full bg-[var(--z-accent)] px-4 py-2 text-sm font-semibold text-[var(--z-on-accent)]">
                      Pago en línea muy pronto
                    </span>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
