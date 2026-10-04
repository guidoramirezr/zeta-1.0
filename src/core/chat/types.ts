// Forma de un mensaje del chat. Pensada para crecer: tarjetas de producto,
// acciones rápidas y (más adelante) talleres, diagnósticos, etc.
import type { PublicProduct } from "@/core/catalog/types";
import type { VehicleRef } from "@/core/automotive/vehicles";
import type { QuoteDraft, QuoteFlow } from "@/core/quotes/types";

export type ChatRole = "user" | "assistant";

export type QuickAction = {
  label: string;
  // Texto que se envía como si el usuario lo hubiera escrito.
  prompt: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  products?: PublicProduct[];
  note?: string;
  actions?: QuickAction[];
  quote?: QuoteDraft; //           tarjeta de cotización editable
  link?: { label: string; href: string }; // ej. "Iniciar sesión"
};

// Lo que Zeta recuerda entre mensajes (ej. "Aveo" para "¿y pastillas?").
export type ChatContext = {
  vehicle: VehicleRef | null;
  quote?: QuoteFlow | null; // cotización en curso (preguntas pendientes)
};

export type ChatRequest = { message: string; context?: ChatContext };
// Consultas con IA que le quedan hoy al usuario (para avisar antes del límite).
export type ChatUsage = { remaining: number; limit: number; tier: "invitado" | "gratis" | "pro" };

export type ChatResponse = { reply: ChatMessage; context: ChatContext; usage?: ChatUsage };
