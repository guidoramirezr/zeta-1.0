import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { PublicProduct } from "@/core/catalog/types";

// Única conexión de Zeta con Claude (solo servidor; la clave vive en .env.local).
//
// Claude NO es la base de datos: no busca productos ni decide precios.
// Recibe la pregunta + lo que encontró el motor de búsqueda y REDACTA la respuesta.
// Si no hay clave, falla o tarda, Zeta usa la respuesta por reglas (nunca se queda mudo).

const MODEL = process.env.ZETA_AI_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Siempre la API oficial: no heredar ANTHROPIC_BASE_URL de otras herramientas del equipo.
    baseURL: process.env.ZETA_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    timeout: 25_000,
    maxRetries: 1,
  });
  return client;
}

export function isAIEnabled() {
  return getClient() != null;
}

// Lo que Claude puede ver. Solo datos PÚBLICOS: nunca costo ni empresa proveedora.
export type AIContext = {
  intent: string;
  vehicle: string | null;
  part: string | null;
  code: string | null;
  catalog: {
    searched: boolean;
    total: number;
    products: PublicProduct[];
    categories: { name: string; count: number }[];
  };
  draft: string; // respuesta por reglas (guía y plan B)
};

const SYSTEM_PROMPT = `Eres Zeta, una inteligencia automotriz ("tu mecánico virtual") para mecánicos y conductores en Ecuador.

Reglas de datos (obligatorias):
- Productos, códigos, precios, stock, disponibilidad y compatibilidades: usa ÚNICAMENTE lo que aparece en RESULTADOS DEL CATÁLOGO. Nunca inventes ni supongas ninguno de esos datos.
- Si el catálogo no tiene resultados para lo que piden, dilo claramente ("No encontré ese producto en el catálogo disponible actualmente") y ofrece buscar por otra descripción o por vehículo.
- No afirmes compatibilidad que no esté escrita en la descripción del producto. Si el usuario pide una versión, año o motor que la descripción no confirma, di que no tienes información suficiente para confirmar compatibilidad con esa versión.
- Debajo de tu texto la aplicación ya muestra las tarjetas de producto con código y precio, y botones de categorías: no repitas la lista ni los precios; resume (cuántos encontraste y para qué vehículo) y guía el siguiente paso.
- Nunca menciones proveedores, distribuidores ni costos.

Conocimiento técnico (OBD, síntomas, sensores, mantenimiento):
- Puedes explicar con tu conocimiento general, separando información técnica de diagnóstico confirmado. Usa expresiones como "podría", "conviene verificar", "lo más común es".
- Ante un síntoma, no asumas un repuesto concreto: menciona causas posibles y haz 1-3 preguntas de diagnóstico (año, motor, cuándo ocurre, luz de check engine).
- Si hay riesgo de seguridad (frenos, dirección, sobrecalentamiento, fugas de combustible), recomienda revisión profesional.

Estilo: español claro y cercano, breve (2 a 6 frases). Texto plano; si listas, usa "•". Sin títulos ni negritas.`;

export async function writeReply(userMessage: string, ctx: AIContext): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const catalogBlock = ctx.catalog.searched
    ? JSON.stringify({
        total_encontrados: ctx.catalog.total,
        mostrados: ctx.catalog.products.map((p) => ({
          codigo: p.code,
          descripcion: p.description,
          marca: p.partBrand,
          categoria: p.category,
          precio: p.price,
        })),
        categorias_principales: ctx.catalog.categories,
      })
    : "(no se consultó el catálogo para esta pregunta)";

  const content = [
    `PREGUNTA DEL USUARIO:\n${userMessage}`,
    `INTERPRETACIÓN:\nintención=${ctx.intent}; vehículo=${ctx.vehicle ?? "—"}; repuesto=${ctx.part ?? "—"}; código=${ctx.code ?? "—"}`,
    `RESULTADOS DEL CATÁLOGO:\n${catalogBlock}`,
    `RESPUESTA BASE (por reglas; mejórala sin contradecir los datos):\n${ctx.draft}`,
  ].join("\n\n");

  const started = Date.now();
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Chat breve: poco razonamiento = rápido y barato.
      output_config: { effort: "low" },
      // Si el modelo declina por política, la API reintenta con otro modelo adecuado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      log({ ok: false, reason: "refusal", ms: Date.now() - started });
      return null;
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    log({
      ok: true,
      model: response.model,
      ms: Date.now() - started,
      in: response.usage.input_tokens,
      out: response.usage.output_tokens,
    });
    return text || null;
  } catch (err) {
    // Sin detalles sensibles: solo el tipo de error.
    const kind =
      err instanceof Anthropic.AuthenticationError
        ? "clave inválida"
        : err instanceof Anthropic.RateLimitError
          ? "límite de uso"
          : err instanceof Anthropic.APIConnectionTimeoutError
            ? "tiempo agotado"
            : err instanceof Anthropic.APIError
              ? `error API ${err.status}`
              : "error inesperado";
    log({ ok: false, reason: kind, ms: Date.now() - started });
    return null;
  }
}

function log(data: Record<string, unknown>) {
  console.info("[zeta-ai]", JSON.stringify(data));
}
