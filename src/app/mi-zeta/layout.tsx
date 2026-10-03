import Link from "next/link";
import { ZetaLogo } from "@/components/brand/ZetaLogo";
import { logoutAction } from "@/app/entrar/actions";
import { requireUser } from "@/server/auth/session";

const NAV = [
  { href: "/mi-zeta", label: "Inicio" },
  { href: "/mi-zeta/vehiculos", label: "Vehículos" },
  { href: "/mi-zeta/clientes", label: "Clientes" },
  { href: "/mi-zeta/cotizaciones", label: "Cotizaciones" },
  { href: "/", label: "IA Zeta" },
];

export default async function MiZetaLayout({ children }: LayoutProps<"/mi-zeta">) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh bg-[var(--z-bg)] text-[var(--z-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--z-line)] bg-[var(--z-bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/mi-zeta"><ZetaLogo /></Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-3 py-1.5 hover:bg-[var(--z-soft)]">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction}>
            <button title={user.email} className="whitespace-nowrap text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
