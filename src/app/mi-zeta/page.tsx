import Link from "next/link";
import { formatDate, formatKm } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listVehicles, workspaceSummary } from "@/server/workspace/repository";

export default async function MiZetaHome() {
  const user = await requireUser();
  const s = await workspaceSummary(user.id);
  const recent = (await listVehicles(user.id)).slice(0, 5);
  const firstName = user.name?.split(" ")[0];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Hola{firstName ? `, ${firstName}` : ""}</h1>
          <p className="text-sm text-[var(--z-muted)]">{user.email}</p>
        </div>
        <Link href="/mi-zeta/vehiculos/nuevo" className="rounded-full bg-[var(--z-accent)] px-4 py-2 text-sm font-semibold text-[var(--z-on-accent)]">
          + Agregar vehículo
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Vehículos" value={s.vehicles} href="/mi-zeta/vehiculos" />
        <Stat label="Clientes" value={s.clients} href="/mi-zeta/clientes" />
        <Stat label="Mantenimientos registrados" value={s.maintenances} />
        <Stat label="Mantenimientos próximos" value={s.dueCount} warn={s.dueCount > 0} />
      </div>

      <section className="grid gap-2">
        <h2 className="font-semibold">Próximos mantenimientos</h2>
        {s.upcoming.length === 0 ? (
          <Empty>Cuando registres un mantenimiento con “próximo mantenimiento”, aparecerá aquí.</Empty>
        ) : (
          <ul className="grid gap-2">
            {s.upcoming.map((u) => (
              <li key={u.vehicleId}>
                <Link href={`/mi-zeta/vehiculos/${u.vehicleId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3 hover:border-[var(--z-ink)]">
                  <span>
                    <span className="font-medium">{u.label}</span>
                    {u.clientName && <span className="text-[var(--z-muted)]"> — {u.clientName}</span>}
                  </span>
                  <span className="text-sm">
                    {u.due && <span className="mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Pendiente</span>}
                    {u.nextMileage != null && <>a los {formatKm(u.nextMileage)}</>}
                    {u.nextMileage != null && u.nextDate && " · "}
                    {u.nextDate && <>el {formatDate(u.nextDate)}</>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Vehículos</h2>
        {recent.length === 0 ? (
          <Empty>
            Todavía no tienes vehículos. <Link href="/mi-zeta/vehiculos/nuevo" className="underline">Agrega el primero</Link>.
          </Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {recent.map((v) => (
              <li key={v.id}>
                <Link href={`/mi-zeta/vehiculos/${v.id}`} className="block rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3 hover:border-[var(--z-ink)]">
                  <p className="font-medium">{[v.brand, v.model, v.year].filter(Boolean).join(" ")}</p>
                  <p className="text-sm text-[var(--z-muted)]">
                    {v.clientName ?? "Sin cliente"} · {formatKm(v.mileage)}
                    {v.lastServiceDate && ` · último servicio ${formatDate(v.lastServiceDate)}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, href, warn }: { label: string; value: number; href?: string; warn?: boolean }) {
  const body = (
    <div className="h-full rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
      <div className="text-xs text-[var(--z-muted)]">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-[var(--z-line)] px-4 py-6 text-center text-sm text-[var(--z-muted)]">{children}</p>;
}
