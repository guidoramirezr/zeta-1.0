import Link from "next/link";
import { ZetaLogo } from "@/components/brand/ZetaLogo";

const NAV = [
  { href: "/admin/catalogo", label: "Catálogo" },
  { href: "/admin/talleres", label: "Talleres", soon: true },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-[var(--z-bg)] text-[var(--z-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--z-line)] bg-[var(--z-bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/admin/catalogo" className="flex items-center gap-2">
            <ZetaLogo />
            <span className="rounded-md bg-[var(--z-soft)] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--z-muted)]">
              Admin
            </span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
            {NAV.map((n) =>
              n.soon ? (
                <span key={n.href} className="whitespace-nowrap px-3 py-1.5 text-[var(--z-muted)] opacity-60">
                  {n.label} · pronto
                </span>
              ) : (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 hover:bg-[var(--z-soft)]"
                >
                  {n.label}
                </Link>
              ),
            )}
          </nav>
          <Link href="/" className="whitespace-nowrap text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">
            Ir al chat →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
