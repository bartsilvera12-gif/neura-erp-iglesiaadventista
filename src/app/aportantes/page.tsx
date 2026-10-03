"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { buildFilialOptions, type FilialLite } from "@/lib/iglesia/build-filial-options";
import { MESES_LARGO, aniosDisponibles } from "@/lib/iglesia/mes-anio";
import NominaImportModal from "@/components/iglesia/NominaImportModal";

type Aportante = {
  id: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  observaciones: string | null;
  activo: boolean;
  filial_id: string | null;
  filial: { id: string; nombre: string } | null;
};

/** Normaliza texto para buscar (sin acentos, minúsculas). */
function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export default function AportantesPage() {
  const [rows, setRows] = useState<Aportante[]>([]);
  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editing, setEditing] = useState<Aportante | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Aportante | null>(null);
  const [importando, setImportando] = useState(false);

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [fFilial, setFFilial] = useState("");
  const [fEstado, setFEstado] = useState<"activos" | "inactivos" | "todos">("activos");

  async function cargar() {
    setCargando(true);
    const res = await fetchWithSupabaseSession("/api/iglesia/aportantes", { cache: "no-store" });
    const j = await res.json();
    setRows(j?.success ? j.data : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    (async () => {
      const j = await fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }).then((r) => r.json());
      if (j?.success) setFiliales(j.data);
    })();
  }, []);

  const filialOpts = useMemo(() => [{ value: "", label: "Todas las filiales" }, ...buildFilialOptions(filiales)], [filiales]);

  const filtradas = useMemo(() => {
    const q = norm(busqueda);
    return rows.filter((r) => {
      if (fEstado === "activos" && !r.activo) return false;
      if (fEstado === "inactivos" && r.activo) return false;
      if (fFilial && r.filial_id !== fFilial) return false;
      if (q) {
        const hay = norm(r.nombre).includes(q) || (r.cedula ? r.cedula.includes(q.replace(/\D/g, "")) : false);
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, busqueda, fFilial, fEstado]);

  async function eliminarConfirmado() {
    if (!confirmDel) return;
    await fetchWithSupabaseSession(`/api/iglesia/aportantes/${confirmDel.id}`, { method: "DELETE" });
    setConfirmDel(null);
    cargar();
  }

  async function toggleActivo(a: Aportante) {
    await fetchWithSupabaseSession(`/api/iglesia/aportantes/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: a.nombre, cedula: a.cedula, filial_id: a.filial_id,
        telefono: a.telefono, observaciones: a.observaciones, activo: !a.activo,
      }),
    });
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
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportando(true)}
            className="rounded-xl border border-[#4FAEB2]/50 bg-white px-4 py-2 text-xs font-semibold text-[#3F8E91] shadow-sm hover:bg-[#4FAEB2]/10 active:scale-95">
            📥 Importar nómina
          </button>
          <button onClick={() => setCreating(true)}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95">
            + Nuevo aportante
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block">Buscar (nombre o cédula)</span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. Pérez o 1234567"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <div className="w-52">
          <span className="mb-1 block">Filial</span>
          <FancySelect size="sm" options={filialOpts} value={fFilial} onChange={setFFilial} placeholder="Todas" />
        </div>
        <div className="w-40">
          <span className="mb-1 block">Estado</span>
          <FancySelect size="sm"
            options={[
              { value: "activos", label: "Activos" },
              { value: "inactivos", label: "Inactivos" },
              { value: "todos", label: "Todos" },
            ]}
            value={fEstado} onChange={(v) => setFEstado(v as typeof fEstado)} />
        </div>
        <span className="self-center text-slate-400">{filtradas.length} de {rows.length}</span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10">
        {cargando ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <p className="text-4xl mb-3">👤</p>
            <p className="text-sm">{rows.length === 0 ? "Todavía no hay aportantes cargados." : "No hay aportantes para esos filtros."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left">Nombre</th>
                  <th className="px-4 py-2.5 text-left">Cédula</th>
                  <th className="px-4 py-2.5 text-left">Filial</th>
                  <th className="px-4 py-2.5 text-left">Estado</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map((r) => (
                  <tr key={r.id} className={`hover:bg-slate-50 ${r.activo ? "" : "opacity-60"}`}>
                    <td className="px-4 py-2.5 font-medium">{r.nombre}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.cedula ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.filial?.nombre ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.activo
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Activo</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactivo</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <button onClick={() => setEditing(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]">
                          ✏️ Editar
                        </button>
                        <button onClick={() => toggleActivo(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-amber-300 hover:text-amber-700">
                          {r.activo ? "⏸ Inactivar" : "▶ Activar"}
                        </button>
                        <button onClick={() => setConfirmDel(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 shadow-sm hover:bg-rose-50">
                          🗑
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

      <RelatoriosAportantes />

      {importando && (
        <NominaImportModal onClose={() => setImportando(false)} onCompleted={() => cargar()} />
      )}

      {(creating || editing) && (
        <AportanteModal
          aportante={editing}
          filiales={filiales}
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

function AportanteModal({ aportante, filiales, onClose, onSaved }: {
  aportante: Aportante | null; filiales: FilialLite[]; onClose: () => void; onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(aportante?.nombre ?? "");
  const [cedula, setCedula] = useState(aportante?.cedula ?? "");
  const [filialId, setFilialId] = useState(aportante?.filial_id ?? "");
  const [telefono, setTelefono] = useState(aportante?.telefono ?? "");
  const [observaciones, setObservaciones] = useState(aportante?.observaciones ?? "");
  const [activo, setActivo] = useState(aportante?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filialOpts = useMemo(() => [{ value: "", label: "Sin filial" }, ...buildFilialOptions(filiales)], [filiales]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const url = aportante ? `/api/iglesia/aportantes/${aportante.id}` : "/api/iglesia/aportantes";
    const method = aportante ? "PUT" : "POST";
    const res = await fetchWithSupabaseSession(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, cedula, filial_id: filialId || null, telefono, observaciones, activo }),
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
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Cédula</span>
            <input value={cedula ?? ""} onChange={(e) => setCedula(e.target.value)} placeholder="Opcional"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Teléfono</span>
            <input value={telefono ?? ""} onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
        </div>
        <div className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Filial</span>
          <FancySelect options={filialOpts} value={filialId} onChange={setFilialId} placeholder="Sin filial" />
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Observaciones</span>
          <textarea rows={2} value={observaciones ?? ""} onChange={(e) => setObservaciones(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Aportante activo
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

type Relatorio = {
  id: string;
  filial: { id: string; nombre: string; es_junta: boolean; sector: { id: string; nombre: string } | null } | null;
  mes: number;
  anio: number;
  archivo_nombre: string | null;
  mime_type: string | null;
  observacion: string | null;
  created_at: string;
  url: string | null;
};

/** Relatorios de aportantes: subir y consultar el documento físico por filial y mes. */
function RelatoriosAportantes() {
  const now = new Date();
  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [lista, setLista] = useState<Relatorio[]>([]);
  const [cargando, setCargando] = useState(true);

  // Filtros del historial
  const [fFilial, setFFilial] = useState("");
  const [fMes, setFMes] = useState(0);
  const [fAnio, setFAnio] = useState(now.getFullYear());

  // Formulario de carga
  const [uFilial, setUFilial] = useState("");
  const [uMes, setUMes] = useState(now.getMonth() + 1);
  const [uAnio, setUAnio] = useState(now.getFullYear());
  const [uObs, setUObs] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [delRow, setDelRow] = useState<Relatorio | null>(null);

  useEffect(() => {
    (async () => {
      const j = await fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }).then((r) => r.json());
      if (j?.success) setFiliales(j.data);
    })();
  }, []);

  const filialOptsFiltro = useMemo(() => [{ value: "", label: "Todas las filiales" }, ...buildFilialOptions(filiales)], [filiales]);
  const filialOptsCarga = useMemo(() => buildFilialOptions(filiales), [filiales]);
  const mesOptsFiltro = useMemo(() => [{ value: "0", label: "Todos" }, ...MESES_LARGO.map((n, i) => ({ value: String(i + 1), label: n }))], []);
  const mesOptsCarga = useMemo(() => MESES_LARGO.map((n, i) => ({ value: String(i + 1), label: n })), []);
  const anioOpts = useMemo(() => aniosDisponibles().map((y) => ({ value: String(y), label: String(y) })), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const qs = new URLSearchParams();
    if (fFilial) qs.set("filial", fFilial);
    if (fMes > 0) qs.set("mes", String(fMes));
    if (fAnio) qs.set("anio", String(fAnio));
    const j = await fetchWithSupabaseSession(`/api/iglesia/relatorios?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json());
    setLista(j?.success ? j.data : []);
    setCargando(false);
  }, [fFilial, fMes, fAnio]);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOkMsg(null);
    const file = fileRef.current?.files?.[0];
    if (!uFilial) return setError("Elegí una filial.");
    if (!file) return setError("Adjuntá una imagen o archivo (JPG, PNG, WebP o PDF).");
    setSubiendo(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("filial_id", uFilial);
    fd.append("mes", String(uMes));
    fd.append("anio", String(uAnio));
    fd.append("observacion", uObs);
    const j = await fetchWithSupabaseSession("/api/iglesia/relatorios", { method: "POST", body: fd }).then((r) => r.json());
    setSubiendo(false);
    if (!j?.success) return setError(j?.error || "No se pudo subir el relatorio.");
    setOkMsg("✓ Relatorio subido.");
    setUObs("");
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => setOkMsg(null), 3500);
    cargar();
  }

  async function eliminar() {
    if (!delRow) return;
    await fetchWithSupabaseSession(`/api/iglesia/relatorios/${delRow.id}`, { method: "DELETE" });
    setDelRow(null);
    cargar();
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Aportantes</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Relatorios por filial</h2>
        <p className="mt-0.5 text-xs text-slate-500">Adjuntá el documento/boleta de aportantes de cada filial por mes, para no cargarlos uno por uno.</p>
      </div>

      {/* Adjuntar */}
      <form onSubmit={subir} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div className="flex flex-wrap items-end gap-3 text-xs font-semibold text-slate-700">
          <div className="w-52">
            <span className="mb-1 block">Filial *</span>
            <FancySelect size="sm" options={filialOptsCarga} value={uFilial} onChange={setUFilial} placeholder="Elegí una filial" />
          </div>
          <div className="w-36">
            <span className="mb-1 block">Mes *</span>
            <FancySelect size="sm" options={mesOptsCarga} value={String(uMes)} onChange={(v) => setUMes(Number(v))} />
          </div>
          <div className="w-24">
            <span className="mb-1 block">Año *</span>
            <FancySelect size="sm" options={anioOpts} value={String(uAnio)} onChange={(v) => setUAnio(Number(v))} />
          </div>
          <label className="min-w-[200px] flex-1">
            <span className="mb-1 block">Archivo o imagen *</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#4FAEB2] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#3F8E91]" />
          </label>
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block">Observación (opcional)</span>
            <input value={uObs} onChange={(e) => setUObs(e.target.value)} placeholder="Ej. Relatorio de julio"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
          <button type="submit" disabled={subiendo}
            className="self-end rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {subiendo ? "Subiendo…" : "📎 Subir relatorio"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {okMsg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{okMsg}</p>}
      </form>

      {/* Historial */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4 text-xs font-semibold text-slate-700">
          <span className="self-center text-slate-500">Ver:</span>
          <div className="w-52">
            <span className="mb-1 block">Filial</span>
            <FancySelect size="sm" options={filialOptsFiltro} value={fFilial} onChange={setFFilial} placeholder="Todas" />
          </div>
          <div className="w-36">
            <span className="mb-1 block">Mes</span>
            <FancySelect size="sm" options={mesOptsFiltro} value={String(fMes)} onChange={(v) => setFMes(Number(v))} />
          </div>
          <div className="w-24">
            <span className="mb-1 block">Año</span>
            <FancySelect size="sm" options={anioOpts} value={String(fAnio)} onChange={(v) => setFAnio(Number(v))} />
          </div>
        </div>

        {cargando ? (
          <div className="py-12 text-center text-sm text-slate-400">Cargando…</div>
        ) : lista.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm">No hay relatorios para esos filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left">Mes / Año</th>
                  <th className="px-4 py-2.5 text-left">Filial</th>
                  <th className="px-4 py-2.5 text-left">Archivo</th>
                  <th className="px-4 py-2.5 text-left">Observación</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap font-medium">{MESES_LARGO[r.mes - 1]} {r.anio}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.filial?.nombre ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[#4FAEB2]/60 bg-white px-2 py-1 text-xs font-medium text-[#3F8E91] hover:bg-[#4FAEB2]/10">
                          {r.mime_type === "application/pdf" ? "📄" : "🖼"} Ver / Descargar
                        </a>
                      ) : <span className="text-xs text-slate-400">— no disponible —</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.observacion ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => setDelRow(r)}
                        className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {delRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setDelRow(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">¿Eliminar este relatorio?</h3>
            <p className="mt-2 text-sm text-slate-600">
              {delRow.filial?.nombre} · {MESES_LARGO[delRow.mes - 1]} {delRow.anio}
            </p>
            <p className="mt-1 text-xs text-slate-400">Se borra el archivo adjunto. Esta acción no se puede deshacer.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDelRow(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={eliminar} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 active:scale-95">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
