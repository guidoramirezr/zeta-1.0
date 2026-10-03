import Link from "next/link";
import { redirect } from "next/navigation";
import { ZetaLogo } from "@/components/brand/ZetaLogo";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/server/auth/session";

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/mi-zeta";
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--z-bg)] px-4 text-[var(--z-text)]">
      <header className="mx-auto flex h-14 w-full max-w-md items-center justify-between">
        <Link href="/"><ZetaLogo /></Link>
        <Link href="/" className="text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">Volver al chat</Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-16">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">Entra a Mi Zeta</h1>
        <p className="mt-2 text-[15px] text-[var(--z-muted)]">
          Guarda tus clientes, sus vehículos y el historial de mantenimiento. Sin contraseñas: te damos un código.
        </p>
        <div className="mt-8">
          <LoginForm next={next} />
        </div>
      </main>
    </div>
  );
}
