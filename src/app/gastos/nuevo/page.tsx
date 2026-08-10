"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { buildFilialOptions, type FilialLite } from "@/lib/iglesia/build-filial-options";
import { FORMAS_PAGO } from "@/lib/iglesia/formas-pago";

type Categoria = { id: string; nombre: string; aplica_a: string };

export default function NuevoGastoPage() {
  const router = useRouter();
  const search = useSearchParams();
  const duplicarId = search?.get("duplicar") ?? "";

  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [categoriasAll, setCategoriasAll] = useState<Categoria[]>([]);

  const [filialId, setFilialId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [fRes, cRes] = await Promise.all([
        fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/iglesia/categorias", { cache: "no-store" }),
      ]);
      const fJ = await fRes.json();
      const cJ = await cRes.json();
      if (fJ?.success) setFiliales(fJ.data);
      if (cJ?.success) setCategoriasAll(cJ.data.gasto);

      if (duplicarId) {
        const dRes = await fetchWithSupabaseSession(`/api/iglesia/gastos/${duplicarId}`, { cache: "no-store" });
        const dJ = await dRes.json();
        if (dJ?.success) {
          setFilialId(dJ.data.filial_id ?? "");
          setCategoriaId(dJ.data.categoria_gasto_id ?? "");
          setMonto(String(dJ.data.monto ?? ""));
          setDescripcion(dJ.data.descripcion ?? "");
          setNumeroFactura(dJ.data.numero_factura ?? "");
          setFormaPago(dJ.data.forma_pago ?? "");
        }
      }
    })();
  }, [duplicarId]);

  const filialOptions = useMemo(() => buildFilialOptions(filiales), [filiales]);

  const categorias = useMemo(() => {
    const f = filiales.find((x) => x.id === filialId);
    if (!f) return categoriasAll;
    return categoriasAll.filter((c) =>
      c.aplica_a === "ambos" || (f.es_junta ? c.aplica_a === "junta" : c.aplica_a === "filial")
    );
  }, [filialId, filiales, categoriasAll]);

  const categoriaOptions = useMemo(() => categorias.map((c) => ({ value: c.id, label: c.nombre })), [categorias]);
  const formaPagoOptions = useMemo(
    () => [{ value: "", label: "— sin especificar —" }, ...FORMAS_PAGO.map((f) => ({ value: f.value, label: f.label }))],
    []
  );

  useEffect(() => {
    if (categoriaId && !categorias.some((c) => c.id === categoriaId)) setCategoriaId("");
  }, [categorias, categoriaId]);

  async function guardar(seguirCargando: boolean) {
    setError(null);
    setOkMsg(null);
    if (!filialId) return setError("Elegí una filial.");
    if (!categoriaId) return setError("Elegí una categoría.");
    setGuardando(true);
    const res = await fetchWithSupabaseSession("/api/iglesia/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filial_id: filialId, categoria_gasto_id: categoriaId, fecha,
        monto: Number(monto), descripcion, forma_pago: formaPago,
        numero_factura: numeroFactura,
      }),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    if (seguirCargando) {
      const cat = categoriasAll.find((c) => c.id === categoriaId);
      setOkMsg(`✓ Guardado: ${cat?.nombre ?? "gasto"} · ${Number(monto).toLocaleString("es-PY")} ₲`);
      setCategoriaId("");
      setMonto("");
      setDescripcion("");
      setNumeroFactura("");
      setFormaPago("");
      setTimeout(() => setOkMsg(null), 4000);
    } else {
      router.push("/gastos");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Gastos</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            {duplicarId ? "Duplicar gasto" : "Nuevo gasto"}
          </h1>
          {duplicarId && <p className="mt-0.5 text-xs text-slate-500">Datos precargados. Ajustá la fecha y el monto según corresponda.</p>}
        </div>
        <Link href="/gastos" className="text-xs text-slate-500 hover:underline">← Volver</Link>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); guardar(false); }} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Filial *</label>
          <FancySelect options={filialOptions} value={filialId} onChange={setFilialId} placeholder="Elegí una filial" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Categoría *</label>
          <FancySelect options={categoriaOptions} value={categoriaId} onChange={setCategoriaId}
            placeholder={filialId ? "Elegí una categoría" : "Elegí filial primero"} disabled={!filialId} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Fecha *</span>
            <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Monto (Gs) *</span>
            <input required type="number" step="1" min="1" value={monto} onChange={(e) => setMonto(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Forma de pago</label>
          <FancySelect options={formaPagoOptions} value={formaPago} onChange={setFormaPago} placeholder="— sin especificar —" />
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">N° de factura <span className="font-normal text-slate-400">(opcional)</span></span>
          <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Descripción</span>
          <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {okMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{okMsg}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Link href="/gastos" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</Link>
          <button type="button" disabled={guardando} onClick={() => guardar(true)}
            className="rounded-xl border border-[#4FAEB2] bg-white px-4 py-2 text-sm font-semibold text-[#3F8E91] shadow-sm hover:bg-[#4FAEB2]/10 active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar y agregar otro"}
          </button>
          <button disabled={guardando} type="submit"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar y volver"}
          </button>
        </div>
      </form>
    </div>
  );
}
