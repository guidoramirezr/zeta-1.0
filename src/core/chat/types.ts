// Forma de un mensaje del chat. Pensada para crecer: en fases siguientes
// se agregan tarjetas de producto y acciones rápidas sin cambiar la UI base.

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
  actions?: QuickAction[];
};
