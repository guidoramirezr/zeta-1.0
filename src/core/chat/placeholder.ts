import type { ChatMessage } from "./types";

// FASE 1: respuesta fija para probar la interfaz.
// En la Fase 2+ esto se reemplaza por una llamada a /api/chat
// (intención → búsqueda en catálogo → Claude). No inventa datos.
export async function getPlaceholderReply(userText: string): Promise<ChatMessage> {
  await new Promise((r) => setTimeout(r, 700));
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text:
      `Recibí tu consulta: "${userText}".\n\n` +
      "Todavía no estoy conectado a ningún catálogo, así que no puedo confirmar productos, códigos ni precios. " +
      "Muy pronto podré buscarlos por ti.",
  };
}
