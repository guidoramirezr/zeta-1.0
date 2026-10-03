"use server";

import { redirect } from "next/navigation";
import { AuthError, requestLoginCode, verifyLoginCode } from "@/server/auth/otp";
import { endSession, startSession } from "@/server/auth/session";

export type RequestCodeResult = { ok: true; email: string; localCode: string | null } | { ok: false; error: string };

export async function requestCodeAction(email: string): Promise<RequestCodeResult> {
  try {
    return { ok: true, ...requestLoginCode(email) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function verifyCodeAction(input: { email: string; code: string; name: string; next: string }) {
  try {
    const userId = verifyLoginCode(input.email, input.code, input.name);
    await startSession(userId);
  } catch (err) {
    return { ok: false as const, error: message(err) };
  }
  redirect(safeNext(input.next));
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

// Solo rutas internas (evita redirigir a otro sitio).
function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/mi-zeta";
}

function message(err: unknown) {
  if (err instanceof AuthError) return err.message;
  console.error("[auth]", err);
  return "Ocurrió un error. Intenta de nuevo.";
}
