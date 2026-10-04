import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { formatDate } from "@/lib/format";
import { dailyLimit, listUsersWithUsage, setUserPlan, todayKey } from "@/server/usage/limits";

// Solo administradores (ZETA_ADMIN_EMAILS).

async function changePlan(fd: FormData) {
  "use server";
  await requireAdmin("/admin/usuarios");
  const userId = Number(fd.get("userId"));
  const plan = fd.get("plan") === "pro" ? "pro" : "gratis";
  const until = String(fd.get("until") ?? "").trim() || null;
  await setUserPlan(userId, plan, until);
  revalidatePath("/admin/usuarios");
}

export default async function UsersPage() {
  await requireAdmin("/admin/usuarios");
  const users = await listUsersWithUsage();
  const today = todayKey();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Usuarios y planes</h1>
        <p className="mt-1 text-sm text-[var(--z-muted)]">
          Límite diario de consultas con IA: sin sesión {dailyLimit("invitado")}, gratis {dailyLimit("gratis")}, Pro{" "}
          {dailyLimit("pro")}. Para activar Pro a quien te pagó, elige “Pro” y la fecha hasta la que pagó.
        </p>
      </div>

      {users.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--z-line)] px-4 py-8 text-center text-sm text-[var(--z-muted)]">
          Todavía no hay usuarios registrados.
        </p>
      ) : (
        <ul className="grid gap-2">
          {users.map((u) => {
            const proActive = u.plan === "pro" && (!u.planUntil || u.planUntil >= today);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{u.name ?? u.email}</p>
                  <p className="truncate text-sm text-[var(--z-muted)]">
                    {u.email} · desde {formatDate(u.createdAt)} · hoy usó {u.usedToday}
                    {u.plan === "pro" && !proActive && " · Pro vencido"}
                  </p>
                </div>
                <form action={changePlan} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="plan" defaultValue={u.plan} className="rounded-full border border-[var(--z-line)] bg-[var(--z-bg)] px-2 py-1">
                    <option value="gratis">Gratis</option>
                    <option value="pro">Pro</option>
                  </select>
                  <label className="flex items-center gap-1 text-[var(--z-muted)]">
                    hasta
                    <input type="date" name="until" defaultValue={u.planUntil ?? ""} className="rounded-lg border border-[var(--z-line)] bg-[var(--z-bg)] px-2 py-1" />
                  </label>
                  <button className="rounded-full bg-[var(--z-ink)] px-3 py-1 text-[var(--z-on-ink)]">Guardar</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
