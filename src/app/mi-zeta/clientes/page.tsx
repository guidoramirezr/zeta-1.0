import { ClientForm } from "@/components/workspace/ClientForm";
import { requireUser } from "@/server/auth/session";
import { listClients } from "@/server/workspace/repository";

export default async function ClientsPage() {
  const user = await requireUser("/mi-zeta/clientes");
  const clients = listClients(user.id);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Clientes</h1>
      <ClientForm />
      {clients.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--z-line)] px-4 py-8 text-center text-sm text-[var(--z-muted)]">
          Todavía no tienes clientes.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {clients.map((c) => (
            <li key={c.id} className="rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3">
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-[var(--z-muted)]">
                {[c.phone, c.email].filter(Boolean).join(" · ") || "Sin contacto"} · {c.vehicles}{" "}
                {c.vehicles === 1 ? "vehículo" : "vehículos"}
              </p>
              {c.notes && <p className="mt-1 text-sm text-[var(--z-muted)]">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
