"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { getTesoreroFilial, setTesoreroFilial } from "@/lib/iglesia/tesorero";

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
type Aporte = {
  id: string;
  fecha: string;
  monto: number;
  numero_factura: string | null;
  categoria: { id: string; nombre: string } | null;
  filial: { id: string; nombre: string } | null;
};
type Historial = {
  anio: number;
  rows: Aporte[];
  totales: {
    porMes: number[];
    anual: number;
    porTipo: { tipo: string; total: number }[];
  };
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmtGs(n: number) {
  return `${Math.round(Number(n || 0)).toLocaleString("es-PY")} ₲`;
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function tipoAporteCanonico(nombre: string): "DIEZMO" | "OFRENDA" | "VOTO" | null {
  const n = nombre.trim().toUpperCase();
  if (n === "DIEZMO") return "DIEZMO";
  if (n === "OFRENDA") return "OFRENDA";
  if (n === "VOTO" || n === "VOTOS") return "VOTO";
  return null;
}

export default function AportesPage() {
  const [filiales, setFiliales] = useState<Filial[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aportantes, setAportantes] = useState<Aportante[]>([]);
  const [filialId, setFilialId] = useState("");
  const [aportanteId, setAportanteId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [monto, setMonto] = useState("");
  const [factura, setFactura] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anioActual = new Date().getFullYear();
  const [consultaAportante, setConsultaAportante] = useState("");
  const [consultaAnio, setConsultaAnio] = useState(anioActual);
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [consultando, setConsultando] = useState(false);

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
      const previa = getTesoreroFilial();
      if (previa?.id) setFilialId(previa.id);
    })();
  }, []);

  const filialOpts = useMemo(
    () => [{ value: "", label: "Seleccioná una filial" }, ...filiales.map((f) => ({ value: f.id, label: f.nombre }))],
    [filiales]
  );

  const aportantesFilial = useMemo(
    () => aportantes.filter((a) => a.activo !== false && filialId && a.filial_id === filialId),
    [aportantes, filialId]
  );

  const aportanteOpts = useMemo(
    () => [{ value: "", label: filialId ? "Seleccioná un aportante" : "Primero seleccioná una filial" },
      ...aportantesFilial.map((a) => ({ value: a.id, label: `${a.nombre}${a.cedula ? ` · CI ${a.cedula}` : ""}` }))],
    [aportantesFilial, filialId]
  );

  const categoriaOpts = useMemo(
    () => [{ value: "", label: "Seleccioná el tipo de aporte" }, ...categorias
      .filter((c) => tipoAporteCanonico(c.nombre) !== null)
      .map((c) => ({ value: c.id, label: tipoAporteCanonico(c.nombre)! }))],
    [categorias]
  );

  const consultaOpts = useMemo(
    () => [{ value: "", label: "Buscar aportante" }, ...aportantes
      .filter((a) => a.activo !== false)
      .map((a) => ({ value: a.id, label: `${a.nombre}${a.filial?.nombre ? ` · ${a.filial.nombre}` : ""}${a.cedula ? ` · CI ${a.cedula}` : ""}` }))],
    [aportantes]
  );

  const anioOpts = useMemo(() => {
    const ys = [];
    for (let y = anioActual + 1; y >= anioActual - 8; y--) ys.push({ value: String(y), label: String(y) });
    return ys;
  }, [anioActual]);

  function cambiarFilial(id: string) {
    setFilialId(id);
    setAportanteId("");
    const f = filiales.find((x) => x.id === id);
    setTesoreroFilial(f ? { id: f.id, nombre: f.nombre } : null);
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    if (!filialId) return setError("Seleccioná la filial.");
    if (!aportanteId) return setError("Seleccioná el aportante.");
    if (!categoriaId) return setError("Seleccioná el tipo de aporte.");
    if (!factura.trim()) return setError("Ingresá el número de factura legal.");
    const valor = Number(String(monto).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) return setError("Ingresá un monto válido.");

    setGuardando(true);
    try {
      const res = await fetchWithSupabaseSession("/api/iglesia/ingresos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filial_id: filialId,
          aportante_id: aportanteId,
          categoria_id: categoriaId,
          monto: valor,
          numero_factura: factura.trim(),
          fecha,
        }),
      });
      const j = await res.json();
      if (!j?.success) {
        setError(j?.error ?? "No se pudo registrar el aporte.");
        return;
      }
      setMensaje("Aporte registrado correctamente.");
      setMonto("");
      setFactura("");
      setAportanteId("");
    } finally {
      setGuardando(false);
    }
  }

  async function consultar() {
    if (!consultaAportante) return;
    setConsultando(true);
    setHistorial(null);
    try {
      const qs = new URLSearchParams({ aportante: consultaAportante, anio: String(consultaAnio) });
      const res = await fetchWithSupabaseSession(`/api/iglesia/aportes?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (j?.success) setHistorial(j.data);
    } finally {
      setConsultando(false);
    }
  }

  const elegido = aportantes.find((a) => a.id === consultaAportante);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Tesorería</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Aportes</h1>
        <p className="mt-0.5 text-xs text-slate-500">Registro e historial de diezmos, ofrendas y votos.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-[11px] leading-5 text-slate-600 shadow-sm">
          <div className="font-semibold text-slate-900">Iglesia Adventista De La Promesa</div>
          <div>RUC: 80028776-2 · Personería Jurídica: 74/74</div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <h2 className="text-sm font-semibold text-slate-900">Registrar aporte</h2>
        <p className="mt-1 text-xs text-slate-500">Primero seleccioná la filial. Solo se muestran aportantes asociados a esa filial.</p>

        <form onSubmit={registrar} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Filial *</span>
            <FancySelect options={filialOpts} value={filialId} onChange={cambiarFilial} placeholder="Seleccioná una filial" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Aportante *</span>
            <FancySelect options={aportanteOpts} value={aportanteId} onChange={setAportanteId} placeholder="Seleccioná un aportante" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Tipo de aporte *</span>
            <FancySelect options={categoriaOpts} value={categoriaId} onChange={setCategoriaId} placeholder="Tipo" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Monto en guaraníes *</span>
            <input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
              placeholder="Ej. 150000" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">N° de factura legal *</span>
            <input value={factura} onChange={(e) => setFactura(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
              placeholder="Ej. 001-001-0001234" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Fecha del aporte *</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>

          <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-1">
            <div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              {mensaje && <p className="text-sm text-emerald-700">{mensaje}</p>}
            </div>
            <button disabled={guardando}
              className="rounded-xl bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-50">
              {guardando ? "Guardando…" : "Registrar aporte"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Historial por aportante</h2>
          <p className="mt-1 text-xs text-slate-500">Podés consultar personas de cualquier filial y verificar el total aportado en un año.</p>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[260px] flex-1 text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Aportante</span>
            <FancySelect options={consultaOpts} value={consultaAportante} onChange={(v) => { setConsultaAportante(v); setHistorial(null); }} placeholder="Buscar aportante" />
          </label>
          <label className="w-28 text-xs font-semibold text-slate-700">
            <span className="mb-1 block">Año</span>
            <FancySelect options={anioOpts} value={String(consultaAnio)} onChange={(v) => setConsultaAnio(Number(v))} />
          </label>
          <button onClick={consultar} disabled={!consultaAportante || consultando}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {consultando ? "Consultando…" : "Consultar"}
          </button>
        </div>

        {historial && (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">{elegido?.nombre ?? "Aportante"}</p>
              <p className="text-xs text-slate-500">{elegido?.cedula ? `CI ${elegido.cedula} · ` : ""}{elegido?.filial?.nombre ?? "Sin filial"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/5 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Total {historial.anio}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{fmtGs(historial.totales.anual)}</p>
              </div>
              {historial.totales.porTipo.map((t) => (
                <div key={t.tipo} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{t.tipo}</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{fmtGs(t.total)}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {historial.totales.porMes.map((total, i) => (
                <div key={MESES[i]} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <p className="text-[10px] uppercase text-slate-500">{MESES[i]}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">{fmtGs(total)}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Filial</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Factura</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historial.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.fecha}</td>
                      <td className="px-3 py-2">{r.filial?.nombre ?? "—"}</td>
                      <td className="px-3 py-2">{r.categoria?.nombre ?? "—"}</td>
                      <td className="px-3 py-2">{r.numero_factura ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtGs(r.monto)}</td>
                    </tr>
                  ))}
                  {historial.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">No hay aportes en ese año.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
