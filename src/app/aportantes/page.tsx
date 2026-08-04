"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Aportante = {
  id: string;
  nombre: string;
  telefono: string | null;
  observaciones: string | null;
  activo: boolean;
};

export default function AportantesPage() {
  const [rows, setRows] = useState<Aportante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editing, setEditing] = useState<Aportante | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Aportante | null>(null);

  async function cargar() {
    setCargando(true);
    const res = await fetchWithSupabaseSession("/api/iglesia/aportantes", { cache: "no-store" });
    const j = await res.json();
    setRows(j?.success ? j.data : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  async function eliminarConfirmado() {
    if (!confirmDel) return;
    await fetchWithSupabaseSession(`/api/iglesia/aportantes/${confirmDel.id}`, { method: "DELETE" });
    setConfirmDel(null);
    cargar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Aportantes</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Aportantes</h1>
          <p className="mt-0.5 text-xs text-slate-500">Personas que hacen diezmos, ofrendas o votos</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95">
          + Nuevo aportante
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10">
        {cargando ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <p className="text-4xl mb-3">👤</p>
            <p className="text-sm">Todavía no hay aportantes cargados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left">Nombre</th>
                  <th className="px-4 py-2.5 text-left">Teléfono</th>
                  <th className="px-4 py-2.5 text-left">Observaciones</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium">{r.nombre}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.telefono ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.observaciones ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <button onClick={() => setEditing(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]">
                          ✏️ Editar
                        </button>
                        <button onClick={() => setConfirmDel(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 shadow-sm hover:bg-rose-50">
                          🗑 Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <AportanteModal
          aportante={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); cargar(); }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">¿Eliminar este aportante?</h3>
            <p className="mt-2 text-sm text-slate-600"><span className="font-medium">{confirmDel.nombre}</span></p>
            <p className="mt-1 text-xs text-slate-400">Los ingresos ya cargados con este aportante se mantienen (queda como "sin aportante").</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={eliminarConfirmado}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 active:scale-95">
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AportanteModal({ aportante, onClose, onSaved }: {
  aportante: Aportante | null; onClose: () => void; onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(aportante?.nombre ?? "");
  const [telefono, setTelefono] = useState(aportante?.telefono ?? "");
  const [observaciones, setObservaciones] = useState(aportante?.observaciones ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const url = aportante ? `/api/iglesia/aportantes/${aportante.id}` : "/api/iglesia/aportantes";
    const method = aportante ? "PUT" : "POST";
    const res = await fetchWithSupabaseSession(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono, observaciones }),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form onSubmit={guardar} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">
          {aportante ? "Editar aportante" : "Nuevo aportante"}
        </h3>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre *</span>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Teléfono</span>
          <input value={telefono ?? ""} onChange={(e) => setTelefono(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Observaciones</span>
          <textarea rows={2} value={observaciones ?? ""} onChange={(e) => setObservaciones(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button disabled={guardando} type="submit"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
