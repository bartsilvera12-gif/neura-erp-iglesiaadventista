"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { buildFilialOptions, type FilialLite } from "@/lib/iglesia/build-filial-options";

type Breakdown = { id: string; nombre: string; total: number; count: number };
type Data = {
  periodo: { desde: string | null; hasta: string | null };
  totales: {
    ingresos: number;
    gastos: number;
    balance: number;
    cant_ingresos: number;
    cant_gastos: number;
  };
  ingresos_por_filial: Breakdown[];
  ingresos_por_sector: Breakdown[];
  ingresos_por_categoria: Breakdown[];
  gastos_por_filial: Breakdown[];
  gastos_por_sector: Breakdown[];
  gastos_por_categoria: Breakdown[];
};

function fmtGs(n: number) {
  return `${Math.round(n).toLocaleString("es-PY")} ₲`;
}

function firstOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type RangoPreset = "hoy" | "7d" | "30d" | "mes" | "año";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
function pad2(n: number) { return String(n).padStart(2, "0"); }
function lastDayOfMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); } // m: 1-12

export default function DashboardIglesia() {
  const [preset, setPreset] = useState<RangoPreset>("mes");
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(today());
  const [data, setData] = useState<Data | null>(null);
  const [cargando, setCargando] = useState(true);

  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [filialId, setFilialId] = useState(""); // "" = todas las filiales
  const filialOptions = useMemo(
    () => [{ value: "", label: "Todas las filiales" }, ...buildFilialOptions(filiales)],
    [filiales]
  );
  const filialNombre = filialId
    ? filiales.find((f) => f.id === filialId)?.nombre ?? "Filial"
    : "Todas las filiales";

  useEffect(() => {
    (async () => {
      const res = await fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" });
      const j = await res.json();
      if (j?.success) setFiliales(j.data);
    })();
  }, []);

  const now = new Date();
  const [mesSel, setMesSel] = useState<number>(now.getMonth() + 1);
  const [anioSel, setAnioSel] = useState<number>(now.getFullYear());
  const aniosDisponibles = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  function irAlMes(m: number, y: number) {
    setMesSel(m);
    setAnioSel(y);
    const d = `${y}-${pad2(m)}-01`;
    const h = `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`;
    setDesde(d);
    setHasta(h);
    setPreset("mes");
  }

  function aplicarPreset(p: RangoPreset) {
    setPreset(p);
    const h = today();
    const d = new Date();
    let desdeStr = h;
    if (p === "hoy") desdeStr = h;
    else if (p === "7d") { d.setDate(d.getDate() - 6); desdeStr = d.toISOString().slice(0, 10); }
    else if (p === "30d") { d.setDate(d.getDate() - 29); desdeStr = d.toISOString().slice(0, 10); }
    else if (p === "mes") desdeStr = firstOfMonth();
    else if (p === "año") { d.setMonth(0, 1); desdeStr = d.toISOString().slice(0, 10); }
    setDesde(desdeStr);
    setHasta(h);
  }

  async function cargar() {
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (filialId) qs.set("filial", filialId);
    const res = await fetchWithSupabaseSession(`/api/iglesia/dashboard?${qs.toString()}`, { cache: "no-store" });
    const j = await res.json();
    setData(j?.success ? j.data : null);
    setCargando(false);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [desde, hasta, filialId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia Adventista</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-0.5 text-xs text-slate-500">Ingresos y gastos por filial / sector / categoría</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["hoy","7d","30d","mes","año"] as RangoPreset[]).map((p) => (
            <button key={p} onClick={() => aplicarPreset(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === p ? "bg-[#4FAEB2] text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}>
              {p === "hoy" ? "Hoy" : p === "7d" ? "7 días" : p === "30d" ? "30 días" : p === "mes" ? "Este mes" : "Este año"}
            </button>
          ))}
        </div>
      </div>

      {/* Selector filial + mes + año */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Filial</span>
          <div className="w-60">
            <FancySelect size="sm" options={filialOptions} value={filialId} onChange={setFilialId} placeholder="Todas las filiales" />
          </div>
        </label>
        <span className="mr-1 self-center text-slate-500">Ir al mes:</span>
        <select value={mesSel} onChange={(e) => irAlMes(Number(e.target.value), anioSel)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          {MESES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
        </select>
        <select value={anioSel} onChange={(e) => irAlMes(mesSel, Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          {aniosDisponibles.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Rango custom */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <label>Desde
          <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPreset("mes"); }}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <label>Hasta
          <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPreset("mes"); }}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <span className="text-slate-400">Período: {desde} → {hasta}</span>
      </div>

      {cargando ? (
        <div className="py-20 text-center text-sm text-slate-400">Cargando…</div>
      ) : !data ? (
        <div className="py-20 text-center text-sm text-red-600">No se pudieron cargar los datos.</div>
      ) : (
        <>
          {/* Resumen: filial + período elegidos */}
          <div className="rounded-2xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/5 px-4 py-3">
            <p className="text-sm font-semibold text-[#2F6E71]">
              {filialNombre}
              <span className="font-normal text-slate-500"> · {desde} → {hasta}</span>
            </p>
          </div>

          {/* Tarjetas de totales (mismos filtros para ingresos y gastos) */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card titulo="Ingresos" valor={fmtGs(data.totales.ingresos)} sub={`${data.totales.cant_ingresos} mov.`} color="emerald" />
            <Card titulo="Gastos"   valor={fmtGs(data.totales.gastos)}   sub={`${data.totales.cant_gastos} mov.`}   color="rose" />
            <Card titulo="Resultado" valor={fmtGs(data.totales.balance)} sub="ingresos − gastos" color={data.totales.balance >= 0 ? "emerald" : "rose"} bold />
          </div>

          {/* Grids de breakdowns */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel titulo="Ingresos por categoría" filas={data.ingresos_por_categoria} tono="emerald" />
            <Panel titulo="Gastos por categoría"   filas={data.gastos_por_categoria}   tono="rose" />
            <Panel titulo="Ingresos por sector"    filas={data.ingresos_por_sector}    tono="emerald" />
            <Panel titulo="Gastos por sector"      filas={data.gastos_por_sector}      tono="rose" />
            <Panel titulo="Ingresos por filial"    filas={data.ingresos_por_filial}    tono="emerald" limite={10} verMas="/ingresos" />
            <Panel titulo="Gastos por filial"      filas={data.gastos_por_filial}      tono="rose"    limite={10} verMas="/gastos" />
          </div>
        </>
      )}
    </div>
  );
}

function Card({ titulo, valor, sub, color, bold }: {
  titulo: string; valor: string; sub?: string;
  color: "emerald" | "rose" | "amber"; bold?: boolean;
}) {
  const colores = {
    emerald: "text-emerald-700",
    rose:    "text-rose-700",
    amber:   "text-amber-700",
  } as const;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titulo}</p>
      <p className={`mt-2 ${bold ? "text-2xl" : "text-xl"} font-semibold ${colores[color]}`}>{valor}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Panel({ titulo, filas, tono, limite, verMas }: {
  titulo: string; filas: Breakdown[]; tono: "emerald" | "rose"; limite?: number; verMas?: string;
}) {
  const filasMostradas = limite ? filas.slice(0, limite) : filas;
  const total = filas.reduce((s, r) => s + r.total, 0);
  const barra = tono === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const texto = tono === "emerald" ? "text-emerald-700" : "text-rose-700";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
        {verMas && filas.length > (limite ?? 0) && (
          <Link href={verMas} className="text-xs text-slate-500 hover:underline">Ver todos →</Link>
        )}
      </div>
      {filas.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Sin datos en el período</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {filasMostradas.map((f) => {
            const pct = total > 0 ? (f.total / total) * 100 : 0;
            return (
              <li key={f.id}>
                <div className="flex justify-between text-xs">
                  <span className="truncate text-slate-700">{f.nombre}</span>
                  <span className={`font-semibold ${texto}`}>{fmtGs(f.total)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${barra}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
