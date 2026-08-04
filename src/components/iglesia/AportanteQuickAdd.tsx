"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Aportante = { id: string; nombre: string; telefono?: string | null; observaciones?: string | null };

/**
 * Boton "+ Nuevo" que abre un modal para crear un aportante sin salir del form actual.
 * Al guardar, invoca onCreated con el aportante recien creado (para autoseleccionarlo).
 */
export function AportanteQuickAdd({ onCreated }: { onCreated: (a: Aportante) => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setNombre("");
    setTelefono("");
    setObservaciones("");
    setError(null);
    setGuardando(false);
  }

  async function guardar() {
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    setGuardando(true);
    const res = await fetchWithSupabaseSession("/api/iglesia/aportantes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono, observaciones }),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    onCreated(j.data as Aportante);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); guardar(); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]">
        + Nuevo aportante
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={close}>
          <div
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}>
            <h3 className="text-base font-semibold text-slate-900">Nuevo aportante</h3>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre *</span>
              <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Teléfono</span>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Observaciones</span>
              <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={close}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" disabled={guardando} onClick={guardar}
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar y usar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
