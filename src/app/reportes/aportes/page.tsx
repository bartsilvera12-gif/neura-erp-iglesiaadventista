"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";

type Filial = { id: string; nombre: string };
type Categoria = { id: string; nombre: string };
type Aportante = {
  id: string;
  nombre: string;
  cedula: string | null;
  activo: boolean;
  filial_id: string | null;
  filial?: { id: string; nombre: string } | null;
};
type Movimiento = {
  id: string;
  fecha: string;
  monto: number;
  numero_factura: string | null;
  filial: { id: string; nombre: string } | null;
  categoria: { id: string; nombre: string } | null;
  aportante: { id: string; nombre: string; cedula?: string | null } | null;
};

const MESES = [
  { value: "0", label: "Todos" },
  { value: "1", label: "Enero" }, { value: "2", label: "Febrero" }, { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" }, { value: "5", label: "Mayo" }, { value: "6", label: "Junio" },
  { value: "7", label: "Julio" }, { value: "8", label: "Agosto" }, { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" }, { value: "11", label: "Noviembre" }, { value: "12", label: "Diciembre" },
];

function fmtGs(n: number) {
  return `${Math.round(Number(n || 0)).toLocaleString("es-PY")} ₲`;
}
function pad(n: number) { return String(n).padStart(2, "0"); }

function tipoAporteCanonico(nombre: string): "DIEZMO" | "OFRENDA" | "VOTO" | null {
  const n = nombre.trim().toUpperCase();
  if (n === "DIEZMO") return "DIEZMO";
  if (n === "OFRENDA") return "OFRENDA";
  if (n === "VOTO" || n === "VOTOS") return "VOTO";
  return null;
}

export default function ReporteAportesPage() {
  const actual = new Date().getFullYear();
  const [filiales, setFiliales] = useState<Filial[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aportantes, setAportantes] = useState<Aportante[]>([]);
  const [rows, setRows] = useState<Movimiento[]>([]);
  const [filial, setFilial] = useState("");
  const [aportante, setAportante] = useState("");
  const [categoria, setCategoria] = useState("");
  const [mes, setMes] = useState(0);
  const [anio, setAnio] = useState(actual);
  const [factura, setFactura] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [fr, cr, ar] = await Promise.all([
        fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/iglesia/categorias", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/iglesia/aportantes", { cache: "no-store" }),
      ]);
      const [fj, cj, aj] = await Promise.all([fr.json(), cr.json(), ar.json()]);
      if (fj?.success) setFiliales(fj.data ?? []);
      if (cj?.success) setCategorias(cj.data?.ingreso ?? []);
      if (aj?.success) setAportantes(aj.data ?? []);
    })();
  }, []);

  const anios = useMemo(() => {
    const a = [];
    for (let y = actual + 1; y >= actual - 8; y--) a.push({ value: String(y), label: String(y) });
    return a;
  }, [actual]);

  const filialOpts = useMemo(() => [{ value: "", label: "Todas las filiales" }, ...filiales.map((f) => ({ value: f.id, label: f.nombre }))], [filiales]);
  const categoriaOpts = useMemo(() => [{ value: "", label: "Todos los tipos" }, ...categorias
    .filter((c) => tipoAporteCanonico(c.nombre) !== null)
    .map((c) => ({ value: c.id, label: tipoAporteCanonico(c.nombre)! }))], [categorias]);
  const aportanteOpts = useMemo(() => [{ value: "", label: "Todos los aportantes" }, ...aportantes
    .filter((a) => !filial || a.filial_id === filial)
    .map((a) => ({ value: a.id, label: `${a.nombre}${a.cedula ? ` · CI ${a.cedula}` : ""}` }))], [aportantes, filial]);

  function rango() {
    if (!mes) return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
    const fin = new Date(anio, mes, 0).getDate();
    return { desde: `${anio}-${pad(mes)}-01`, hasta: `${anio}-${pad(mes)}-${pad(fin)}` };
  }

  function params(extra?: Record<string, string>) {
    const { desde, hasta } = rango();
    const qs = new URLSearchParams({ desde, hasta, solo_aportes: "1" });
    if (filial) qs.set("filial", filial);
    if (aportante) qs.set("aportante", aportante);
    if (categoria) qs.set("categoria", categoria);
    if (factura.trim()) qs.set("factura", factura.trim());
    if (extra) Object.entries(extra).forEach(([k, v]) => qs.set(k, v));
    return qs;
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/iglesia/ingresos?${params().toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (!j?.success) {
        setRows([]);
        setError(j?.error ?? "No se pudo cargar el reporte.");
      } else {
        setRows(j.data ?? []);
      }
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.monto || 0), 0), [rows]);

  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.categoria?.nombre ? (tipoAporteCanonico(r.categoria.nombre) ?? r.categoria.nombre) : "Sin tipo";
      m.set(k, (m.get(k) ?? 0) + Number(r.monto || 0));
    });
    return Array.from(m.entries()).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
  }, [rows]);

  const porFilial = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.filial?.nombre ?? "Sin filial";
      m.set(k, (m.get(k) ?? 0) + Number(r.monto || 0));
    });
    return Array.from(m.entries()).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
  }, [rows]);

  const aportantesPorFilial = useMemo(() => {
    const m = new Map<string, number>();
    aportantes.filter((a) => a.activo !== false).forEach((a) => {
      const k = a.filial?.nombre ?? "Sin filial";
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [aportantes]);

  function exportar(formato: "pdf" | "xlsx") {
    const qs = params({ tipo: "ingresos", formato });
    window.open(`/api/iglesia/export?${qs.toString()}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Administración</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Reporte de aportes</h1>
          <p className="mt-0.5 text-xs text-slate-500">Consolidado de todas las filiales y aportantes.</p>
          <p className="mt-1 text-[11px] text-slate-500">Iglesia Adventista De La Promesa · RUC 80028776-2 · Personería Jurídica 74/74</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportar("pdf")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#4FAEB2]">PDF</button>
          <button onClick={() => exportar("xlsx")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#4FAEB2]">Excel</button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Filial</span>
            <FancySelect size="sm" options={filialOpts} value={filial} onChange={(v) => { setFilial(v); setAportante(""); }} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Aportante</span>
            <FancySelect size="sm" options={aportanteOpts} value={aportante} onChange={setAportante} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Mes</span>
            <FancySelect size="sm" options={MESES} value={String(mes)} onChange={(v) => setMes(Number(v))} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Año</span>
            <FancySelect size="sm" options={anios} value={String(anio)} onChange={(v) => setAnio(Number(v))} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Tipo de aporte</span>
            <FancySelect size="sm" options={categoriaOpts} value={categoria} onChange={setCategoria} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">N° factura</span>
            <input value={factura} onChange={(e) => setFactura(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#4FAEB2]" placeholder="Buscar..." />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={cargar} disabled={cargando} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {cargando ? "Cargando…" : "Aplicar filtros"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Total general</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtGs(total)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Aportes encontrados</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{rows.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Aportantes activos</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{aportantes.filter((a) => a.activo !== false).length}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Resumen titulo="Totales por tipo" items={porTipo.map((x) => ({ label: x.nombre, value: fmtGs(x.total) }))} />
        <Resumen titulo="Totales por filial" items={porFilial.map((x) => ({ label: x.nombre, value: fmtGs(x.total) }))} />
        <Resumen titulo="Aportantes por filial" items={aportantesPorFilial.map((x) => ({ label: x.nombre, value: String(x.cantidad) }))} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-left">Fecha</th>
                <th className="px-3 py-2.5 text-left">Aportante</th>
                <th className="px-3 py-2.5 text-left">Cédula</th>
                <th className="px-3 py-2.5 text-left">Filial</th>
                <th className="px-3 py-2.5 text-left">Tipo</th>
                <th className="px-3 py-2.5 text-left">Factura</th>
                <th className="px-3 py-2.5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">{r.fecha}</td>
                  <td className="px-3 py-2.5 font-medium">{r.aportante?.nombre ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.aportante?.cedula ?? "—"}</td>
                  <td className="px-3 py-2.5">{r.filial?.nombre ?? "—"}</td>
                  <td className="px-3 py-2.5">{r.categoria?.nombre ?? "—"}</td>
                  <td className="px-3 py-2.5">{r.numero_factura ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmtGs(r.monto)}</td>
                </tr>
              ))}
              {!cargando && rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">No hay aportes con esos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Resumen({ titulo, items }: { titulo: string; items: { label: string; value: string }[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {items.map((x) => (
          <div key={x.label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-xs">
            <span className="min-w-0 truncate text-slate-600">{x.label}</span>
            <span className="shrink-0 font-semibold text-slate-900">{x.value}</span>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-slate-400">Sin datos.</p>}
      </div>
    </section>
  );
}
