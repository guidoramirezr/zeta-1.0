import "server-only";
import { vehicleLabel, vehicleSearchTerms } from "@/core/automotive/vehicles";
import type { CatalogProvider, ProductQuery, SearchResult } from "@/core/catalog/types";
import type { ChatContext, ChatMessage, ChatResponse, QuickAction } from "@/core/chat/types";
import { interpret, type Interpretation } from "@/core/intent/interpret";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { sqliteCatalog } from "@/server/catalog/sqlite-provider";
import { continueQuote, startQuote } from "@/server/quotes/flow";

// Orquestador del chat (V1, sin IA):
//   mensaje → intención → búsqueda en catálogo → respuesta con datos reales.
// Regla de oro: todo producto, código y precio sale de la búsqueda. Si no
// hay resultados, se dice claramente. Nada se inventa.
//
// Próximo paso: Claude redactará el texto a partir de estos mismos
// resultados (sin cambiar cómo se buscan).

const CARD_LIMIT = 6;
const catalog: CatalogProvider = sqliteCatalog;

export function respond(message: string, context: ChatContext | undefined, user: SessionUser | null = null): ChatResponse {
  const it = interpret(message, { vehicle: context?.vehicle ?? null });

  // Cotizador: una cotización en curso, o un pedido nuevo de cotización.
  if (context?.quote || it.intent === "quote") {
    const r = context?.quote ? continueQuote(message, context.quote, it, user) : startQuote(message, it, user);
    log({ message, intent: "quote", step: r.flow?.step ?? "fin", vehicle: it.vehicle, signedIn: user != null });
    return {
      reply: r.reply,
      context: { vehicle: r.vehicle ?? it.vehicle ?? context?.vehicle ?? null, quote: r.flow },
    };
  }

  const nextContext: ChatContext = { vehicle: it.vehicle ?? context?.vehicle ?? null, quote: null };
  const reply = build(message, it);

  log({ message, intent: it.intent, vehicle: it.vehicle, part: it.part?.id, code: it.code, keywords: it.keywords,
    products: reply.products?.length ?? 0 });
  return { reply, context: nextContext };
}

function build(message: string, it: Interpretation): ChatMessage {
  switch (it.intent) {
    case "greeting":
      return msg(
        "Hola, soy Zeta, tu mecánico virtual. Dime qué repuesto buscas y para qué vehículo, por ejemplo: “sensor TPS para Aveo”.",
      );
    case "code_lookup":
      return codeLookup(it.code!);
    case "obd":
      return msg(
        `${it.obdCode} es un código de diagnóstico OBD. Mi módulo de códigos OBD todavía está en preparación, así que prefiero no darte una explicación sin una fuente verificada.`,
        it.vehicle ? [{ label: `Repuestos para ${vehicleLabel(it.vehicle)}`, prompt: `Repuestos para ${vehicleLabel(it.vehicle)}` }] : [],
      );
    case "diagnostic":
      return diagnostic(it);
    case "product_search":
      return productSearch(message, it);
    default:
      return msg(
        "No estoy seguro de qué buscas. Cuéntame el repuesto y el vehículo, por ejemplo “pastillas de freno para Kia Rio”, o escribe un código de producto.",
      );
  }
}

function productSearch(message: string, it: Interpretation): ChatMessage {
  if (catalogIsEmpty()) {
    return msg("Todavía no hay ningún catálogo conectado, así que no puedo confirmar productos ni precios.");
  }

  const vehicleTerms = it.vehicle ? vehicleSearchTerms(it.vehicle) : [];
  const partPhrases = it.part?.match ?? [];
  const vLabel = it.vehicle ? vehicleLabel(it.vehicle) : null;
  const wantsAll = /\bver todos?\b/i.test(message);

  // 1) Solo vehículo: "¿Tienes repuestos para Aveo?" → resumen + categorías.
  if (it.vehicle && !it.part && it.keywords.length === 0) {
    const r = search({ vehicleTerms, partPhrases: [], keywords: [] });
    if (r.total === 0) return notFound(`productos para ${vLabel}`);
    if (wantsAll) {
      return withCards(`Estos son algunos de los ${r.total} productos para ${vLabel}.`, r, [
        ...categoryActions(r, vLabel!),
      ]);
    }
    return msg(
      `Sí, encontré ${plural(r.total, "producto relacionado", "productos relacionados")} con ${vLabel}. ¿Qué estás buscando?`,
      [...categoryActions(r, vLabel!), { label: "Ver todos", prompt: `Ver todos los repuestos para ${vLabel}` }],
    );
  }

  // 2) Repuesto (y quizá vehículo / palabras libres).
  let r = search({ vehicleTerms, partPhrases, keywords: it.keywords });
  if (r.total === 0 && it.keywords.length && (partPhrases.length || vehicleTerms.length)) {
    r = search({ vehicleTerms, partPhrases, keywords: [] });
  }
  const what = it.part?.label ?? (it.keywords.join(" ") || "ese producto");

  if (r.total === 0) {
    if (it.vehicle) {
      const forVehicle = search({ vehicleTerms, partPhrases: [], keywords: [] });
      if (forVehicle.total > 0) {
        return msg(
          `No encontré ${lower(what)} para ${vLabel} en el catálogo disponible actualmente. Sí tengo ${plural(forVehicle.total, "otro producto", "otros productos")} para ${vLabel}:`,
          categoryActions(forVehicle, vLabel!),
        );
      }
    }
    return notFound(it.vehicle ? `${lower(what)} para ${vLabel}` : lower(what));
  }

  const head = vLabel
    ? `Sí. Encontré ${plural(r.total, "opción", "opciones")} de ${lower(what)} para ${vLabel}.`
    : `Encontré ${plural(r.total, "opción", "opciones")} de ${lower(what)}. ¿Para qué vehículo es? Así te muestro solo lo compatible.`;
  const actions: QuickAction[] = vLabel ? [{ label: `Otros repuestos para ${vLabel}`, prompt: `Repuestos para ${vLabel}` }] : [];
  return withCards(head, r, actions);
}

function codeLookup(code: string): ChatMessage {
  const items = catalog.findByCode(code);
  if (items.length === 0) {
    return msg(
      `No encontré el código ${code} en el catálogo disponible actualmente. Si quieres, puedo buscar por descripción o por vehículo.`,
    );
  }
  return {
    ...msg(items.length === 1 ? `El código ${code} corresponde a:` : `Encontré ${items.length} productos con el código ${code}:`),
    products: items,
  };
}

function diagnostic(it: Interpretation): ChatMessage {
  const v = it.vehicle ? ` de tu ${vehicleLabel(it.vehicle)}` : "";
  return msg(
    `Entiendo, hay una falla${v}. No voy a suponer qué repuesto necesitas sin un diagnóstico: la misma falla puede tener varias causas.\n\n` +
      "Para orientarte mejor dime: ¿año y motor del vehículo? ¿se enciende la luz de check engine? ¿pasa en frío, en caliente o siempre?\n\n" +
      "Mi módulo de diagnóstico está en preparación. Si ya sabes qué repuesto necesitas, dímelo y lo busco.",
    it.vehicle ? [{ label: `Ver repuestos para ${vehicleLabel(it.vehicle)}`, prompt: `Repuestos para ${vehicleLabel(it.vehicle)}` }] : [],
  );
}

// ---------- utilidades ----------

function search(q: Omit<ProductQuery, "limit">): SearchResult {
  return catalog.search({ ...q, limit: CARD_LIMIT });
}

function withCards(text: string, r: SearchResult, actions: QuickAction[]): ChatMessage {
  return {
    ...msg(text, actions),
    products: r.items,
    note: r.total > r.items.length ? `Mostrando ${r.items.length} de ${r.total}. Dime año o motor para afinar.` : undefined,
  };
}

function categoryActions(r: SearchResult, vLabel: string): QuickAction[] {
  return r.topCategories.slice(0, 4).map((c) => {
    const label = prettyCategory(c.name);
    return { label: `${label} (${c.count})`, prompt: `${label} para ${vLabel}` };
  });
}

function notFound(what: string): ChatMessage {
  return msg(
    `No encontré ${what} en el catálogo disponible actualmente. Si quieres, puedo ayudarte a buscar por otra descripción o por vehículo.`,
  );
}

function msg(text: string, actions: QuickAction[] = []): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", text, actions: actions.length ? actions : undefined };
}

function catalogIsEmpty() {
  return !db().prepare("SELECT 1 FROM products WHERE active = 1 LIMIT 1").get();
}

const ACRONYMS = new Set(["tps", "maf", "map", "abs", "iac", "pcv", "ckp", "cmp", "o2", "hm", "jgo"]);
function prettyCategory(name: string) {
  const words = name.toLowerCase().split(/\s+/).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const s = words.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lower(s: string) {
  // "Sensor TPS (…)" → "sensor TPS (…)" sin tocar siglas.
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function log(data: Record<string, unknown>) {
  // Desarrollo: pregunta, intención, filtros y resultados. Nunca secretos ni costos.
  if (process.env.NODE_ENV !== "production") console.info("[zeta-chat]", JSON.stringify(data));
}
