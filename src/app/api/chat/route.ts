import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { ChatMessage, ChatRequest } from "@/core/chat/types";
import { isAIEnabled, writeReply } from "@/server/ai/claude";
import { getCurrentUser } from "@/server/auth/session";
import { respond } from "@/server/chat/respond";
import { recordUse, usageStatus, type UsageStatus, type Who } from "@/server/usage/limits";

const ANON_COOKIE = "zeta_anon";

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
    const who = await identify(user?.id ?? null);
    const { ai, ...result } = respond(message, body.context, user);
    let usage = usageStatus(who);

    // Claude redacta el texto con los datos ya encontrados, si quedan consultas hoy.
    // Si no, queda la respuesta por reglas (las tarjetas y botones no cambian).
    if (ai && isAIEnabled()) {
      if (usage.remaining > 0) {
        const text = await writeReply(message, ai);
        if (text) {
          result.reply = { ...result.reply, text };
          recordUse(who);
          usage = { ...usage, used: usage.used + 1, remaining: usage.remaining - 1 };
        }
      } else {
        result.reply = limitReached(result.reply, usage, ai.catalog.searched);
      }
    }
    return Response.json({ ...result, usage: { remaining: usage.remaining, limit: usage.limit, tier: usage.tier } });
  } catch (err) {
    console.error("[zeta-chat] error", err);
    return Response.json({ error: "No pude procesar tu consulta. Intenta de nuevo." }, { status: 500 });
  }
}

// Invitado: cookie propia (1 año) + IP. Con sesión: el usuario.
async function identify(userId: number | null): Promise<Who> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  if (userId != null) return { userId, anonId: null, ip };
  const store = await cookies();
  let anonId = store.get(ANON_COOKIE)?.value ?? null;
  if (!anonId || !/^[0-9a-f-]{36}$/.test(anonId)) {
    anonId = randomUUID();
    store.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 24 * 3600,
    });
  }
  return { userId: null, anonId, ip };
}

// Sin consultas: si hubo búsqueda en el catálogo, se muestran sus resultados;
// en preguntas técnicas (sin catálogo) solo el aviso.
function limitReached(reply: ChatMessage, usage: UsageStatus, catalogSearched: boolean): ChatMessage {
  const head =
    usage.tier === "invitado"
      ? `Usaste tus ${usage.limit} consultas con IA de hoy. Inicia sesión gratis para tener más cada día.`
      : usage.tier === "gratis"
        ? `Usaste tus ${usage.limit} consultas con IA de hoy. Con Zeta Pro tienes muchas más; se renuevan a medianoche.`
        : `Usaste tus ${usage.limit} consultas con IA de hoy. Se renuevan a medianoche.`;
  return {
    ...reply,
    text: catalogSearched ? `${head}\n\nMientras tanto, esto es lo que encontré en el catálogo:\n\n${reply.text}` : head,
    link:
      usage.tier === "invitado"
        ? { label: "Iniciar sesión", href: "/entrar?next=/" }
        : usage.tier === "gratis"
          ? { label: "Ver planes", href: "/planes" }
          : reply.link,
  };
}
