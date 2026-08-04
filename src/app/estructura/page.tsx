"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";

type Sector = { id: string; nombre: string; orden: number; activo: boolean };
type Filial = {
  id: string; nombre: string; es_junta: boolean; aplica_15_porciento: boolean;
  sector_id: string | null;
  sectores: { id: string; nombre: string } | null;
};

export default function EstructuraPage() {
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [filiales, setFiliales] = useState<Filial[]>([]);
  const [cargando, setCargando] = useState(true);

  const [editSec, setEditSec] = useState<Sector | null>(null);
  const [creatingSec, setCreatingSec] = useState(false);
  const [delSec, setDelSec] = useState<Sector | null>(null);

  const [editFil, setEditFil] = useState<Filial | null>(null);
  const [creatingFil, setCreatingFil] = useState(false);
  const [delFil, setDelFil] = useState<Filial | null>(null);

  async function cargar() {
    setCargando(true);
    const [s, f] = await Promise.all([
      fetchWithSupabaseSession("/api/iglesia/sectores", { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (s?.success) setSectores(s.data);
    if (f?.success) setFiliales(f.data);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  async function eliminarSector() {
    if (!delSec) return;
    const res = await fetchWithSupabaseSession(`/api/iglesia/sectores/${delSec.id}`, { method: "DELETE" });
    const j = await res.json();
    setDelSec(null);
    if (!j?.success) alert(j?.error || "No se pudo eliminar. Puede que tenga filiales asociadas.");
    cargar();
  }
  async function eliminarFilial() {
    if (!delFil) return;
    const res = await fetchWithSupabaseSession(`/api/iglesia/filiales/${delFil.id}`, { method: "DELETE" });
    const j = await res.json();
    setDelFil(null);
    if (!j?.success) alert(j?.error || "No se pudo eliminar. Puede que tenga ingresos/gastos asociados.");
    cargar();
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Configuración</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Sectores y Filiales</h1>
        <p className="mt-0.5 text-xs text-slate-500">Cada filial pertenece a un sector (excepto JUNTA, que va aparte).</p>
      </div>

      {/* SECTORES */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Sectores</h2>
          <button onClick={() => setCreatingSec(true)}
            className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95">
            + Nuevo sector
          </button>
        </div>
        {cargando ? (
          <div className="py-8 text-center text-sm text-slate-400">Cargando…</div>
        ) : sectores.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">Sin sectores. Creá uno para arrancar.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Orden</th>
                <th className="px-4 py-2 text-left">Filiales</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectores.map((s) => {
                const cnt = filiales.filter((f) => f.sector_id === s.id).length;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">{s.nombre}</td>
                    <td className="px-4 py-2 text-slate-600">{s.orden}</td>
                    <td className="px-4 py-2 text-slate-600">{cnt}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEditSec(s)} className="mr-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-[#4FAEB2]/60">✏️ Editar</button>
                      <button onClick={() => setDelSec(s)} className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* FILIALES */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Filiales</h2>
          <button onClick={() => setCreatingFil(true)}
            className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95">
            + Nueva filial
          </button>
        </div>
        {cargando ? (
          <div className="py-8 text-center text-sm text-slate-400">Cargando…</div>
        ) : filiales.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">Sin filiales.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Sector</th>
                <th className="px-4 py-2 text-left">Flags</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filiales.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{f.nombre}</td>
                  <td className="px-4 py-2 text-slate-600">{f.es_junta ? "— (JUNTA)" : f.sectores?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">
                    {f.es_junta && <span className="mr-1 rounded-full bg-purple-100 px-2 py-0.5 text-purple-700">JUNTA</span>}
                    {f.aplica_15_porciento && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">15%</span>}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditFil(f)} className="mr-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-[#4FAEB2]/60">✏️ Editar</button>
                    <button onClick={() => setDelFil(f)} className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(creatingSec || editSec) && (
        <SectorModal sector={editSec} onClose={() => { setCreatingSec(false); setEditSec(null); }}
          onSaved={() => { setCreatingSec(false); setEditSec(null); cargar(); }} />
      )}
      {(creatingFil || editFil) && (
        <FilialModal filial={editFil} sectores={sectores}
          onClose={() => { setCreatingFil(false); setEditFil(null); }}
          onSaved={() => { setCreatingFil(false); setEditFil(null); cargar(); }} />
      )}
      {delSec && (
        <ConfirmModal titulo="¿Eliminar sector?" mensaje={`Sector "${delSec.nombre}". Si tiene filiales, no se puede eliminar.`}
          onCancel={() => setDelSec(null)} onConfirm={eliminarSector} />
      )}
      {delFil && (
        <ConfirmModal titulo="¿Eliminar filial?" mensaje={`Filial "${delFil.nombre}". Si tiene ingresos/gastos cargados, no se puede eliminar.`}
          onCancel={() => setDelFil(null)} onConfirm={eliminarFilial} />
      )}
    </div>
  );
}

function SectorModal({ sector, onClose, onSaved }: { sector: Sector | null; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(sector?.nombre ?? "");
  const [orden, setOrden] = useState(String(sector?.orden ?? 0));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    setGuardando(true);
    const url = sector ? `/api/iglesia/sectores/${sector.id}` : "/api/iglesia/sectores";
    const method = sector ? "PUT" : "POST";
    const res = await fetchWithSupabaseSession(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, orden: Number(orden) || 0 }),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{sector ? "Editar sector" : "Nuevo sector"}</h3>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre * (se guarda en mayúsculas)</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Orden (para ordenar en listas, 1, 2, 3…)</span>
          <input type="number" value={orden} onChange={(e) => setOrden(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" disabled={guardando} onClick={guardar}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilialModal({ filial, sectores, onClose, onSaved }: {
  filial: Filial | null; sectores: Sector[]; onClose: () => void; onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(filial?.nombre ?? "");
  const [sectorId, setSectorId] = useState(filial?.sector_id ?? "");
  const [esJunta, setEsJunta] = useState(filial?.es_junta ?? false);
  const [aplica15, setAplica15] = useState(filial?.aplica_15_porciento ?? false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectorOptions = [{ value: "", label: "— elegir —" }, ...sectores.map((s) => ({ value: s.id, label: s.nombre }))];

  async function guardar() {
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    if (!esJunta && !sectorId) return setError("Elegí un sector o marcá 'Es JUNTA'.");
    setGuardando(true);
    const url = filial ? `/api/iglesia/filiales/${filial.id}` : "/api/iglesia/filiales";
    const method = filial ? "PUT" : "POST";
    const res = await fetchWithSupabaseSession(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, sector_id: sectorId, es_junta: esJunta, aplica_15_porciento: aplica15 }),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{filial ? "Editar filial" : "Nueva filial"}</h3>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre * (se guarda en mayúsculas)</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Sector *</label>
          <FancySelect options={sectorOptions} value={sectorId} onChange={setSectorId} placeholder="— elegir sector —" disabled={esJunta} />
          <p className="mt-1 text-[11px] text-slate-400">La filial JUNTA no tiene sector — marcá el checkbox de abajo.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={esJunta} onChange={(e) => setEsJunta(e.target.checked)} />
          <span>Es la filial JUNTA (sin sector, gastos administrativos)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={aplica15} onChange={(e) => setAplica15(e.target.checked)} />
          <span>Aplica 15% de derivación de diezmos (caso Casilla 2)</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" disabled={guardando} onClick={guardar}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ titulo, mensaje, onCancel, onConfirm }: {
  titulo: string; mensaje: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{titulo}</h3>
        <p className="mt-2 text-sm text-slate-600">{mensaje}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={onConfirm} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 active:scale-95">Sí, eliminar</button>
        </div>
      </div>
    </div>
  );
}
