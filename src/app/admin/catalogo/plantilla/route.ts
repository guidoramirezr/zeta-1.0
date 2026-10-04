import { requireAdmin } from "@/server/auth/session";
import { buildTemplate } from "@/server/catalog/import/template";

export async function GET() {
  await requireAdmin("/admin/catalogo");
  const body = await buildTemplate();
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Plantilla_Zeta_Productos.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
