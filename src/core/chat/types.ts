// Forma de un mensaje del chat. Pensada para crecer: tarjetas de producto,
// acciones rápidas y (más adelante) talleres, diagnósticos, etc.
import type { PublicProduct } from "@/core/catalog/types";
import type { VehicleRef } from "@/core/automotive/vehicles";

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
};

// Lo que Zeta recuerda entre mensajes (ej. "Aveo" para "¿y pastillas?").
export type ChatContext = {
  vehicle: VehicleRef | null;
};

export type ChatRequest = { message: string; context?: ChatContext };
export type ChatResponse = { reply: ChatMessage; context: ChatContext };
