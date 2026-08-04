"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Filial = {
  id: string;
  nombre: string;
  es_junta: boolean;
  aplica_15_porciento: boolean;
  sector_id: string | null;
  sectores: { id: string; nombre: string; orden: number } | null;
};

type Categoria = { id: string; nombre: string; orden: number };

type Ingreso = {
  id: string;
  fecha: string;
  monto: number;
  descripcion: string | null;
  filial: { id: string; nombre: string; es_junta: boolean; aplica_15_porciento: boolean;
            sector?: { id: string; nombre: string } | null } | null;
  categoria: { id: string; nombre: string } | null;
};

function fmtGs(n: number) {
  return `${Math.round(n).toLocaleString("es-PY")} ₲`;
}

export default function IngresosPage() {
  const [filiales, setFiliales] = useState<Filial[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [cargando, setCargando] = useState(true);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroSector, setFiltroSector] = useState("");
  const [filtroFilial, setFiltroFilial] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");

  const sectoresUnicos = useMemo(() => {
    const map = new Map<string, string>();
    filiales.forEach((f) => f.sectores && map.set(f.sectores.id, f.sectores.nombre));
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [filiales]);

  const filialesVisibles = useMemo(() => {
    if (!filtroSector) return filiales;
    return filiales.filter((f) => f.sector_id === filtroSector);
  }, [filiales, filtroSector]);

  useEffect(() => {
    (async () => {
      const [fRes, cRes] = await Promise.all([
        fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/iglesia/categorias", { cache: "no-store" }),
      ]);
      const fJ = await fRes.json();
      const cJ = await cRes.json();
      if (fJ?.success) setFiliales(fJ.data);
      if (cJ?.success) setCategorias(cJ.data.ingreso);
    })();
  }, []);

  async function cargar() {
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (filtroSector) qs.set("sector", filtroSector);
    if (filtroFilial) qs.set("filial", filtroFilial);
    if (filtroCategoria) qs.set("categoria", filtroCategoria);
    const res = await fetchWithSupabaseSession(`/api/iglesia/ingresos?${qs.toString()}`, { cache: "no-store" });
    const j = await res.json();
    setIngresos(j?.success ? j.data : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este ingreso?")) return;
    const res = await fetchWithSupabaseSession(`/api/iglesia/ingresos/${id}`, { method: "DELETE" });
    if (res.ok) setIngresos((prev) => prev.filter((x) => x.id !== id));
  }

  function download(formato: "pdf" | "xlsx") {
    const qs = new URLSearchParams({ tipo: "ingresos", formato });
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (filtroSector) qs.set("sector", filtroSector);
    if (filtroFilial) qs.set("filial", filtroFilial);
    if (filtroCategoria) qs.set("categoria", filtroCategoria);
    window.open(`/api/iglesia/export?${qs.toString()}`, "_blank");
  }

  const total = ingresos.reduce((s, r) => s + Number(r.monto || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Ingresos</h1>
          <p className="text-xs text-slate-500">Diezmos, ofrendas y votos por filial</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => download("pdf")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            📄 PDF
          </button>
          <button onClick={() => download("xlsx")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            📊 Excel
          </button>
          <Link href="/ingresos/nuevo" className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]">
            + Nuevo ingreso
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="text-xs">Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs">Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs">Sector
            <select value={filtroSector} onChange={(e) => { setFiltroSector(e.target.value); setFiltroFilial(""); }}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="">Todos</option>
              {sectoresUnicos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label className="text-xs">Filial
            <select value={filtroFilial} onChange={(e) => setFiltroFilial(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="">Todas</option>
              {filialesVisibles.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </label>
          <label className="text-xs">Categoría
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <button onClick={cargar} className="self-end rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
            Aplicar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {cargando ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
        ) : ingresos.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <p className="text-4xl mb-3">📥</p>
            <p className="text-sm">No hay ingresos con esos filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Sector</th>
                  <th className="px-4 py-2 text-left">Filial</th>
                  <th className="px-4 py-2 text-left">Categoría</th>
                  <th className="px-4 py-2 text-left">Descripción</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ingresos.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">{r.fecha}</td>
                    <td className="px-4 py-2 text-slate-600">{r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : "")}</td>
                    <td className="px-4 py-2 font-medium">{r.filial?.nombre ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{r.categoria?.nombre ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{r.descripcion ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmtGs(Number(r.monto))}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => eliminar(r.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td colSpan={5} className="px-4 py-2 text-right">TOTAL</td>
                  <td className="px-4 py-2 text-right text-emerald-800">{fmtGs(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
