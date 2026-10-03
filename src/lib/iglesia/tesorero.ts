"use client";

export const ROL_TESORERO = "tesorero";

export function esTesorero(rol: string | null | undefined): boolean {
  return (rol ?? "").trim().toLowerCase() === ROL_TESORERO;
}

/**
 * Lee el rol del usuario desde el servidor para no depender de RLS del navegador.
 */
export async function fetchRolActual(): Promise<string | null> {
  try {
    const r = await fetch("/api/usuarios/me", { cache: "no-store", credentials: "include" });
    if (!r.ok) return null;
    const j = await r.json();
    const rol = j?.usuario?.rol;
    return typeof rol === "string" && rol.trim() ? rol.trim() : null;
  } catch {
    return null;
  }
}

export type TesoreroFilial = { id: string; nombre: string };

const KEY = "tesorero_filial";
const EVENT = "tesorero-filial-change";

export function getTesoreroFilial(): TesoreroFilial | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TesoreroFilial;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function setTesoreroFilial(filial: TesoreroFilial | null): void {
  if (typeof window === "undefined") return;
  if (filial) window.localStorage.setItem(KEY, JSON.stringify(filial));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onTesoreroFilialChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
