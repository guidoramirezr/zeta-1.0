import "server-only";
import { detectPart } from "@/core/automotive/parts";
import { vehicleSearchTerms } from "@/core/automotive/vehicles";
import type { ChatMessage, QuickAction } from "@/core/chat/types";
import type { Interpretation } from "@/core/intent/interpret";
import { newItemKey, vehicleText, type QuoteDraft, type QuoteFlow, type QuoteItem, type QuoteVehicle } from "@/core/quotes/types";
import type { SessionUser } from "@/server/auth/session";
import { normalizeText } from "@/server/catalog/normalize";
import { catalogProvider } from "@/server/catalog/provider";
import { getVehicle } from "@/server/workspace/repository";
import { matchTemplate, matchingVehicles, suggestLaborPrice } from "./repository";

// Cotizador conversacional (V1, reglas, sin IA):
//   pedido → [mano de obra?] → [repuesto: catálogo o precio manual] → [cliente] → tarjeta editable.
// Solo pregunta lo que falta. Los precios salen del mecánico, de sus precios
// habituales o del catálogo conectado. Nada se inventa.

type FlowResult = { reply: ChatMessage; flow: QuoteFlow | null; vehicle?: { brand: string; model: string | null } | null };

const CANCEL = "Cancelar cotización";

// ---------- inicio ----------

export async function startQuote(message: string, it: Interpretation, user: SessionUser | null): Promise<FlowResult> {
  if (!user) {
    return {
      reply: {
        ...msg("Para crear cotizaciones entra a Mi Zeta: ahí guardo tus precios de mano de obra, tus clientes y sus vehículos."),
        link: { label: "Iniciar sesión", href: "/entrar?next=/" },
      },
      flow: null,
    };
  }

  const vehicle: QuoteVehicle | null =
    it.vehicle?.model ? { brand: it.vehicle.brand, model: it.vehicle.model, year: it.year } : null;

  // ¿Coincide con una plantilla guardada? ("mantenimiento de 10 mil")
  const template = await matchTemplate(user.id, message);
  if (template) {
    const draft = emptyDraft(template.name, vehicle);
    draft.items = template.items.map((i) => ({ ...i, key: newItemKey() }));
    return goClient(user, { step: "client", draft, laborSuggestion: null },
      `Usé tu plantilla “${template.name}”${vehicle ? ` para ${vehicleText(vehicle)}` : ""}.`);
  }

  const title = extractJob(message, it);
  if (!title) {
    return {
      reply: msg(`¿Qué trabajo quieres cotizar${vehicle ? ` para el ${vehicleText(vehicle)}` : ""}? Ej: “cambio de pastillas”.`, [cancelAction()]),
      flow: { step: "job", draft: emptyDraft("", vehicle), laborSuggestion: null },
    };
  }
  return beginJob(user, emptyDraft(title, vehicle));
}

async function beginJob(user: SessionUser, draft: QuoteDraft): Promise<FlowResult> {
  const partName = partFromJob(draft.title);
  if (partName) draft.items.push(item("repuesto", partName, null));
  const suggestion = await suggestLaborPrice(user.id, draft.title);
  const flow: QuoteFlow = { step: "labor", draft, laborSuggestion: suggestion };
  const head = `Perfecto. ${draft.vehicle ? `${vehicleText(draft.vehicle)}: ` : ""}${lowerFirst(draft.title)}.`;
  return { reply: laborQuestion(flow, head), flow, vehicle: draft.vehicle };
}

// ---------- continuar ----------

export async function continueQuote(message: string, flow: QuoteFlow, it: Interpretation, user: SessionUser | null): Promise<FlowResult> {
  if (!user) return startQuote(message, it, null);
  const norm = normalizeText(message);
  if (/\bcancel/.test(norm)) return { reply: msg("Listo, cancelé la cotización."), flow: null };

  // Un pedido de cotización nuevo reemplaza al actual.
  if (it.intent === "quote" && flow.step !== "job" && extractJob(message, it)) return startQuote(message, it, user);

  const f: QuoteFlow = structuredClone(flow);
  const d = f.draft;

  switch (f.step) {
    case "job": {
      d.title = capitalize(message.replace(/[.!?]+$/, "").trim());
      return beginJob(user, d);
    }

    case "labor": {
      const amount = parseMoney(message);
      if (isNo(norm)) return goParts(user, f, "Sin mano de obra.");
      if (isYes(norm) || amount != null) {
        const price = amount ?? f.laborSuggestion?.price ?? null;
        if (price == null) {
          f.step = "labor_price";
          return {
            reply: msg(`¿Cuánto cobras de mano de obra por ${lowerFirst(d.title)}?`, [
              { label: "La escribo después", prompt: "La escribo después" },
              cancelAction(),
            ]),
            flow: f,
          };
        }
        d.items.push(item("mano_obra", laborName(d.title), price));
        return goParts(user, f, `Agregué la mano de obra: $${price.toFixed(2)}.`);
      }
      return { reply: laborQuestion(f, "No te entendí."), flow: f };
    }

    case "labor_price": {
      const amount = parseMoney(message);
      d.items.push(item("mano_obra", laborName(d.title), amount));
      return goParts(user, f, amount != null ? `Mano de obra: $${amount.toFixed(2)}.` : "Dejé la mano de obra sin precio para que la completes.");
    }

    case "parts": {
      if (/\b(mano|manual|despues|no)\b/.test(norm)) return goClient(user, f, "Dejo el precio del repuesto para que lo escribas.");
      // "ver opciones" o una marca ("Gates", "Sachs"…)
      const brand = /\bver\b|\bopciones\b|\bcatalogo\b/.test(norm) ? null : message.trim();
      return showPartOptions(user, f, brand);
    }

    case "parts_pick": {
      const pick = message.match(/producto\s*#\s*(\d+)/i);
      if (pick) {
        const p = await catalogProvider.findById(Number(pick[1]));
        const target = d.items.find((i) => i.kind === "repuesto" && i.unitPrice == null && !i.productId);
        if (p && target) {
          target.description = p.description;
          target.unitPrice = p.price;
          target.productId = p.id;
          return goClient(user, f, p.price != null ? `Usé ${p.code}: $${p.price.toFixed(2)}.` : `Usé ${p.code}; su precio está por confirmar.`);
        }
      }
      if (/\b(mano|manual|despues|no)\b/.test(norm)) return goClient(user, f, "Dejo el precio del repuesto para que lo escribas.");
      return showPartOptions(user, f, message.trim());
    }

    case "client": {
      const pick = message.match(/veh[ií]culo\s*#\s*(\d+)/i);
      if (pick) {
        const v = await getVehicle(user.id, Number(pick[1]));
        if (v) {
          d.vehicleId = v.id;
          d.clientId = v.clientId;
          d.clientName = v.clientName;
          d.clientPhone = v.clientPhone;
          d.vehicle = { brand: v.brand, model: v.model, year: v.year };
          return done(f, `Asociada a ${v.clientName ?? "este vehículo"}.`);
        }
      }
      if (/\bsin cliente\b/.test(norm)) return done(f, "");
      if (/\bcliente nuevo\b|\bnuevo\b/.test(norm)) {
        f.step = "client_new";
        return {
          reply: msg("Escribe el nombre y el teléfono del cliente. Ej: “Juan Pérez 0991234567”.", [
            { label: "Sin cliente por ahora", prompt: "Sin cliente por ahora" },
          ]),
          flow: f,
        };
      }
      const parsed = parseClient(message);
      if (parsed) {
        d.newClient = parsed;
        return done(f, "");
      }
      return goClient(user, f, "No te entendí.");
    }

    case "client_new": {
      if (/\bsin cliente\b/.test(norm)) return done(f, "");
      const parsed = parseClient(message);
      if (!parsed) {
        return { reply: msg("Necesito al menos el nombre del cliente. Ej: “Juan Pérez 0991234567”.", [cancelAction()]), flow: f };
      }
      d.newClient = parsed;
      return done(f, "");
    }
  }
}

// ---------- pasos ----------

function laborQuestion(f: QuoteFlow, head: string): ChatMessage {
  const s = f.laborSuggestion;
  const q = s
    ? `¿Agrego la mano de obra? Tu precio habitual para “${s.name.replace(/^mano de obra\s*[–-]\s*/i, "")}” es $${s.price.toFixed(2)}.`
    : "¿Quieres agregar también la mano de obra?";
  return msg(`${head}\n\n${q}`, [
    { label: s ? `Sí, $${s.price.toFixed(2)}` : "Sí", prompt: "Sí, agregar mano de obra" },
    { label: "No", prompt: "No, sin mano de obra" },
    cancelAction(),
  ]);
}

async function goParts(user: SessionUser, f: QuoteFlow, head: string): Promise<FlowResult> {
  const part = f.draft.items.find((i) => i.kind === "repuesto" && i.unitPrice == null && !i.productId);
  if (!part) return goClient(user, f, head);

  const r = await searchPart(f, null);
  if (r.total === 0) {
    return goClient(user, f,
      `${head}\n\nNo encontré “${lowerFirst(part.description)}”${f.draft.vehicle ? ` para ${vehicleText(f.draft.vehicle)}` : ""} en el catálogo conectado, así que no voy a inventar un precio: lo dejo para que lo escribas.`);
  }
  f.step = "parts";
  return {
    reply: msg(`${head}\n\nPara el ${lowerFirst(part.description)}, ¿quieres utilizar alguna marca específica o deseas ver las opciones disponibles?`, [
      { label: `Ver opciones (${r.total})`, prompt: "Ver opciones del catálogo" },
      { label: "Pondré el precio a mano", prompt: "Pondré el precio a mano" },
      cancelAction(),
    ]),
    flow: f,
  };
}

async function showPartOptions(user: SessionUser, f: QuoteFlow, brand: string | null): Promise<FlowResult> {
  let r = await searchPart(f, brand);
  let head = "Estas son las opciones del catálogo:";
  if (brand && r.total === 0) {
    r = await searchPart(f, null);
    head = `No encontré la marca “${brand}”. Estas son las opciones disponibles:`;
  }
  f.step = "parts_pick";
  return {
    reply: {
      ...msg(head, [
        ...r.items.slice(0, 5).map((p) => ({
          label: `Usar ${p.code}${p.price != null ? ` · $${p.price.toFixed(2)}` : ""}`,
          prompt: `Usar producto #${p.id}`,
        })),
        { label: "Pondré el precio a mano", prompt: "Pondré el precio a mano" },
      ]),
      products: r.items.slice(0, 5),
    },
    flow: f,
  };
}

async function searchPart(f: QuoteFlow, brand: string | null) {
  const part = f.draft.items.find((i) => i.kind === "repuesto" && i.unitPrice == null && !i.productId);
  const ref = part ? detectPart(normalizeText(part.description)) : null;
  const v = f.draft.vehicle;
  return catalogProvider.search({
    vehicleTerms: v ? vehicleSearchTerms({ brand: v.brand, model: v.model }) : [],
    partPhrases: ref?.match ?? [],
    keywords: brand ? normalizeText(brand).split(" ").filter((w) => w.length >= 3) : [],
    limit: 5,
  });
}

async function goClient(user: SessionUser, f: QuoteFlow, head: string): Promise<FlowResult> {
  if (f.draft.vehicleId || f.draft.clientId) return done(f, head);
  const vehicles = await matchingVehicles(user.id, f.draft.vehicle);
  f.step = "client";
  const actions: QuickAction[] = vehicles.map((v) => ({
    label: `${v.clientName ?? "Sin cliente"} · ${[v.brand, v.model, v.year].filter(Boolean).join(" ")}${v.plate ? ` (${v.plate})` : ""}`,
    prompt: `Usar vehículo #${v.id}`,
  }));
  actions.push({ label: "Cliente nuevo", prompt: "Cliente nuevo" }, { label: "Sin cliente por ahora", prompt: "Sin cliente por ahora" });
  return {
    reply: msg(`${head ? `${head}\n\n` : ""}¿Para qué cliente es?${vehicles.length ? " Estos vehículos tuyos coinciden:" : ""}`, actions),
    flow: f,
  };
}

function done(f: QuoteFlow, head: string): FlowResult {
  return {
    reply: {
      ...msg(`${head ? `${head} ` : ""}Listo, aquí está la cotización. Revisa y edita lo que necesites antes de guardarla o enviarla.`),
      quote: f.draft,
    },
    flow: null,
  };
}

// ---------- utilidades ----------

function emptyDraft(title: string, vehicle: QuoteVehicle | null): QuoteDraft {
  return { title, vehicle, items: [], discount: 0, notes: "", vehicleId: null, clientId: null, newClient: null };
}

function item(kind: QuoteItem["kind"], description: string, unitPrice: number | null): QuoteItem {
  return { key: newItemKey(), kind, description, quantity: 1, unitPrice, productId: null };
}

const JOB_RE =
  /\b(cambio|cambiar|reemplazo|reemplazar|reparaci[oó]n|reparar|instalaci[oó]n|instalar|mantenimiento|alineaci[oó]n|balanceo|afinamiento|revisi[oó]n|limpieza|scanner|escaneo)\b[^.?!\n]*/i;

// "Aveo 2010, cambio de kit de embrague." → "Cambio de kit de embrague"
export function extractJob(message: string, it: Interpretation): string | null {
  let job = message.match(JOB_RE)?.[0] ?? null;
  if (!job) {
    const m = message.match(/\b(?:cotiza\w*|presupuesto|proforma)\b\s*(?:de|para|un|una|el|la)?\s*([^.?!\n]*)/i);
    job = m?.[1] ?? null;
  }
  if (!job) return null;
  // Quitar la mención del vehículo al final ("… del Aveo 2010", "… para este carro").
  const model = it.vehicle?.model?.toLowerCase();
  const tail = new RegExp(
    `\\s*(?:,|\\b(?:para|del|de|en|al|a)\\b)?\\s*(?:el|la|este|esta|mi|un|una)?\\s*(?:${[
      "carro", "auto", "veh[ií]culo", "camioneta", it.vehicle?.brand?.toLowerCase(), model,
    ].filter(Boolean).join("|")})\\b.*$`,
    "i",
  );
  job = job.replace(tail, "").replace(/\s+\d{4}\s*$/, "").replace(/[,;:]+$/, "").trim();
  return job.length >= 3 ? capitalize(job) : null;
}

// "Cambio de kit de embrague" → "Kit de embrague" (solo si es un repuesto conocido)
function partFromJob(title: string): string | null {
  if (!/^(cambio|cambiar|reemplazo|reemplazar|instalaci[oó]n|instalar)\b/i.test(title)) return null;
  const object = title.replace(/^(cambio|cambiar|reemplazo|reemplazar|instalaci[oó]n|instalar)\s+(de(l)?\s+)?((la|el|las|los)\s+)?/i, "");
  return detectPart(normalizeText(object)) ? capitalize(object) : null;
}

function laborName(title: string) {
  return `Mano de obra – ${lowerFirst(title)}`;
}

function isYes(norm: string) {
  return /^(si|claro|dale|ok|okay|bueno|listo|agrega|agregala|por favor|de una)\b/.test(norm) || /\bagregar mano de obra\b/.test(norm);
}
function isNo(norm: string) {
  return /^no\b/.test(norm) || /\bsin mano de obra\b/.test(norm);
}

// "$60", "60", "60,50", "60 dólares" → 60
export function parseMoney(text: string): number | null {
  const m = text.replace(/(\d)\.(\d{3})\b/g, "$1$2").match(/\$?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : null;
}

// "Juan Pérez 0991234567" → { name, phone }
function parseClient(text: string): { name: string; phone: string | null } | null {
  const phone = text.match(/\+?\d[\d\s-]{6,}\d/)?.[0]?.replace(/[\s-]/g, "") ?? null;
  const name = text.replace(/\+?\d[\d\s-]{6,}\d/, "").replace(/[,;:.]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length < 2 || /\d/.test(name)) return null;
  return { name: capitalize(name), phone };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function cancelAction(): QuickAction {
  return { label: "Cancelar", prompt: CANCEL };
}
function msg(text: string, actions: QuickAction[] = []): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", text, actions: actions.length ? actions : undefined };
}
