import type { ChatRequest } from "@/core/chat/types";
import { writeReply } from "@/server/ai/claude";
import { getCurrentUser } from "@/server/auth/session";
import { respond } from "@/server/chat/respond";

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (!message) return Response.json({ error: "Mensaje vacío" }, { status: 400 });

  try {
    // El chat es público; si hay sesión, se habilitan funciones privadas (cotizador).
    const user = await getCurrentUser();
    const { ai, ...result } = respond(message, body.context, user);
    // Claude redacta el texto con los datos ya encontrados. Si no está
    // disponible, queda la respuesta por reglas (las tarjetas no cambian).
    if (ai) {
      const text = await writeReply(message, ai);
      if (text) result.reply = { ...result.reply, text };
    }
    return Response.json(result);
  } catch (err) {
    console.error("[zeta-chat] error", err);
    return Response.json({ error: "No pude procesar tu consulta. Intenta de nuevo." }, { status: 500 });
  }
}
