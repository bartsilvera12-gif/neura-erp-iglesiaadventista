"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { buildFilialOptions, type FilialLite } from "@/lib/iglesia/build-filial-options";
import { labelFormaPago } from "@/lib/iglesia/formas-pago";
import { ImportarBotones } from "@/components/iglesia/ImportarBotones";
import { ReferenciaBoton } from "@/components/iglesia/ReferenciaBoton";
import { MESES_LARGO, aniosDisponibles, mesAnioToFecha, labelMesAnio, pad2 } from "@/lib/iglesia/mes-anio";

type Categoria = { id: string; nombre: string; aplica_a: string; orden: number };
type Gasto = {
  id: string;
  fecha: string;
  monto: number;
  descripcion: string | null;
  forma_pago: string | null;
  numero_factura: string | null;
  filial: { id: string; nombre: string; es_junta: boolean;
            sector?: { id: string; nombre: string } | null } | null;
  categoria: { id: string; nombre: string } | null;
};

function fmtGs(n: number) {
  return `${Math.round(n).toLocaleString("es-PY")} ₲`;
}

export default function GastosPage() {
  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState(true);

  const [filtroMes, setFiltroMes] = useState<number>(0);
  const [filtroAnio, setFiltroAnio] = useState<number>(new Date().getFullYear());
  const [filtroSector, setFiltroSector] = useState("");
  const [filtroFilial, setFiltroFilial] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroMesHasta, setFiltroMesHasta] = useState<number>(0); // 0 = rango de un solo mes
  // Mes final del rango: nunca menor al mes inicial (ej. enero→marzo).
  const mesHastaEff = filtroMes > 0 ? Math.max(filtroMes, filtroMesHasta || filtroMes) : 0;
  const desde = filtroMes > 0 ? mesAnioToFecha(filtroMes, filtroAnio) ?? "" : `${filtroAnio}-01-01`;
  const ultimoDiaHasta = mesHastaEff > 0 ? new Date(filtroAnio, mesHastaEff, 0).getDate() : 31;
  const hasta = filtroMes > 0 ? `${filtroAnio}-${pad2(mesHastaEff)}-${pad2(ultimoDiaHasta)}` : `${filtroAnio}-12-31`;

  const [confirmDel, setConfirmDel] = useState<Gasto | null>(null);

  const sectoresUnicos = useMemo(() => {
    const map = new Map<string, string>();
    filiales.forEach((f) => f.sectores && map.set(f.sectores.id, f.sectores.nombre));
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [filiales]);

  const filialOptions = useMemo(() => {
    const scoped = filtroSector ? filiales.filter((f) => f.sector_id === filtroSector) : filiales;
    return [{ value: "", label: "Todas las filiales" }, ...buildFilialOptions(scoped)];
  }, [filiales, filtroSector]);

  const sectorOptions = useMemo(
    () => [{ value: "", label: "Todos los sectores" }, ...sectoresUnicos.map((s) => ({ value: s.id, label: s.nombre }))],
    [sectoresUnicos]
  );

  const categoriaOptions = useMemo(
    () => [{ value: "", label: "Todas las categorías" }, ...categorias.map((c) => ({ value: c.id, label: c.nombre }))],
    [categorias]
  );

  useEffect(() => {
    (async () => {
      const [fRes, cRes] = await Promise.all([
        fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/iglesia/categorias", { cache: "no-store" }),
      ]);
      const fJ = await fRes.json();
      const cJ = await cRes.json();
      if (fJ?.success) setFiliales(fJ.data);
      if (cJ?.success) setCategorias(cJ.data.gasto);
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
    const res = await fetchWithSupabaseSession(`/api/iglesia/gastos?${qs.toString()}`, { cache: "no-store" });
    const j = await res.json();
    setGastos(j?.success ? j.data : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function eliminarConfirmado() {
    if (!confirmDel) return;
    const res = await fetchWithSupabaseSession(`/api/iglesia/gastos/${confirmDel.id}`, { method: "DELETE" });
    if (res.ok) setGastos((prev) => prev.filter((x) => x.id !== confirmDel.id));
    setConfirmDel(null);
  }

  function download(formato: "pdf" | "xlsx") {
    const qs = new URLSearchParams({ tipo: "gastos", formato });
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (filtroSector) qs.set("sector", filtroSector);
    if (filtroFilial) qs.set("filial", filtroFilial);
    if (filtroCategoria) qs.set("categoria", filtroCategoria);
    window.open(`/api/iglesia/export?${qs.toString()}`, "_blank");
  }

  const total = gastos.reduce((s, r) => s + Number(r.monto || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Gastos</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Gastos</h1>
          <p className="mt-0.5 text-xs text-slate-500">Gastos por filial (incluye JUNTA)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReferenciaBoton tipo="gastos" />
          <ImportarBotones tipo="gastos" onImportado={cargar} />
          <button onClick={() => download("pdf")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]">
            📄 PDF
          </button>
          <button onClick={() => download("xlsx")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]">
            📊 Excel
          </button>
          <Link href="/gastos/nuevo"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95">
            + Nuevo gasto
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          <div className="text-xs font-semibold text-slate-700 md:col-span-2">
            <span className="mb-1 block">Mes{filtroMes > 0 && mesHastaEff > filtroMes ? " (rango)" : ""}</span>
            <div className="flex items-center gap-1.5">
              <FancySelect
                size="sm" ariaLabel="Mes desde" className="flex-1 min-w-0"
                value={String(filtroMes)}
                options={[{ value: "0", label: "Todos" }, ...MESES_LARGO.map((n, i) => ({ value: String(i + 1), label: n }))]}
                onChange={(v) => {
                  const n = Number(v);
                  setFiltroMes(n);
                  if (n === 0 || (filtroMesHasta && filtroMesHasta < n)) setFiltroMesHasta(0);
                }}
              />
              <span className="text-xs text-slate-400">a</span>
              <FancySelect
                size="sm" ariaLabel="Mes hasta" className="flex-1 min-w-0"
                disabled={filtroMes === 0}
                placeholder="— sin fin"
                value={filtroMesHasta > filtroMes ? String(filtroMesHasta) : ""}
                options={[{ value: "0", label: "— (quitar)" }, ...MESES_LARGO.flatMap((n, i) => (i + 1 > filtroMes ? [{ value: String(i + 1), label: n }] : []))]}
                onChange={(v) => setFiltroMesHasta(Number(v))}
              />
            </div>
          </div>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Año</span>
            <select value={filtroAnio} onChange={(e) => setFiltroAnio(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20">
              {aniosDisponibles().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Sector</span>
            <FancySelect size="sm" options={sectorOptions} value={filtroSector}
              onChange={(v) => { setFiltroSector(v); setFiltroFilial(""); }} placeholder="Todos" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Filial</span>
            <FancySelect size="sm" options={filialOptions} value={filtroFilial} onChange={setFiltroFilial} placeholder="Todas" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Categoría</span>
            <FancySelect size="sm" options={categoriaOptions} value={filtroCategoria} onChange={setFiltroCategoria} placeholder="Todas" />
          </label>
          <button onClick={cargar}
            className="self-end rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
            Aplicar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10">
        {cargando ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
        ) : gastos.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm">No hay gastos con esos filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left">Mes</th>
                  <th className="px-4 py-2.5 text-left">Sector</th>
                  <th className="px-4 py-2.5 text-left">Filial</th>
                  <th className="px-4 py-2.5 text-left">Categoría</th>
                  <th className="px-4 py-2.5 text-left">Forma pago</th>
                  <th className="px-4 py-2.5 text-left">N° Factura</th>
                  <th className="px-4 py-2.5 text-left">Descripción</th>
                  <th className="px-4 py-2.5 text-right">Monto</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gastos.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{labelMesAnio(r.fecha)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : "")}</td>
                    <td className="px-4 py-2.5 font-medium min-w-[120px] break-words">{r.filial?.nombre ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600 min-w-[180px] break-words">{r.categoria?.nombre ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{labelFormaPago(r.forma_pago) || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.numero_factura ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.descripcion ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-rose-700 whitespace-nowrap">{fmtGs(Number(r.monto))}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <Link href={`/gastos/nuevo?filial=${r.filial?.id ?? ""}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#4FAEB2]/60 bg-white px-2 py-1 text-xs font-medium text-[#3F8E91] shadow-sm hover:bg-[#4FAEB2]/10"
                          title="Agregar otro gasto en esta filial">
                          + Agregar
                        </Link>
                        <Link href={`/gastos/${r.id}/editar`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
                          title="Editar">
                          ✏️ Editar
                        </Link>
                        <button onClick={() => setConfirmDel(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 shadow-sm hover:bg-rose-50"
                          title="Eliminar">
                          🗑 Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td colSpan={7} className="px-4 py-2.5 text-right">TOTAL</td>
                  <td className="px-4 py-2.5 text-right text-rose-800 whitespace-nowrap">{fmtGs(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">¿Eliminar este gasto?</h3>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">{confirmDel.filial?.nombre}</span> · {confirmDel.categoria?.nombre} · {fmtGs(Number(confirmDel.monto))}
            </p>
            <p className="mt-1 text-xs text-slate-400">Esta acción no se puede deshacer.</p>
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
