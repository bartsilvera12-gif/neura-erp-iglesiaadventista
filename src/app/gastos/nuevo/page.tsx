"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { buildFilialOptions, type FilialLite } from "@/lib/iglesia/build-filial-options";
import { FORMAS_PAGO } from "@/lib/iglesia/formas-pago";

type Categoria = { id: string; nombre: string; aplica_a: string };
type Linea = { categoria_gasto_id: string; monto: string };

function fmtGs(n: number) {
  return `${Math.round(n).toLocaleString("es-PY")} ₲`;
}

export default function NuevoGastoPage() {
  const router = useRouter();
  const search = useSearchParams();
  const duplicarId = search?.get("duplicar") ?? "";
  const filialPreselect = search?.get("filial") ?? "";

  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [categoriasAll, setCategoriasAll] = useState<Categoria[]>([]);

  const [filialId, setFilialId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPago, setFormaPago] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ categoria_gasto_id: "", monto: "" }]);
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

      if (filialPreselect && !duplicarId) setFilialId(filialPreselect);

      if (duplicarId) {
        const dRes = await fetchWithSupabaseSession(`/api/iglesia/gastos/${duplicarId}`, { cache: "no-store" });
        const dJ = await dRes.json();
        if (dJ?.success) {
          setFilialId(dJ.data.filial_id ?? "");
          setLineas([{ categoria_gasto_id: dJ.data.categoria_gasto_id ?? "", monto: String(dJ.data.monto ?? "") }]);
          setDescripcion(dJ.data.descripcion ?? "");
          setNumeroFactura(dJ.data.numero_factura ?? "");
          setFormaPago(dJ.data.forma_pago ?? "");
        }
      }
    })();
  }, [duplicarId, filialPreselect]);

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

  // Si cambia filial y alguna linea tiene categoria que ya no aplica, resetea esa linea
  useEffect(() => {
    setLineas((prev) => prev.map((l) => {
      if (l.categoria_gasto_id && !categorias.some((c) => c.id === l.categoria_gasto_id)) {
        return { ...l, categoria_gasto_id: "" };
      }
      return l;
    }));
  }, [categorias]);

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function addLinea() { setLineas((prev) => [...prev, { categoria_gasto_id: "", monto: "" }]); }
  function removeLinea(i: number) { setLineas((prev) => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)); }

  const totalLineas = lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);

  async function guardar(seguir: boolean) {
    setError(null);
    setOkMsg(null);
    if (!filialId) return setError("Elegí una filial.");
    if (lineas.length === 0 || lineas.some((l) => !l.categoria_gasto_id || !(Number(l.monto) > 0))) {
      return setError("Cada línea necesita categoría y monto mayor a 0.");
    }
    setGuardando(true);
    const res = await fetchWithSupabaseSession("/api/iglesia/gastos/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filial_id: filialId, fecha,
        forma_pago: formaPago, descripcion, numero_factura: numeroFactura,
        lineas: lineas.map((l) => ({ categoria_gasto_id: l.categoria_gasto_id, monto: Number(l.monto) })),
      }),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    if (seguir) {
      setOkMsg(`✓ ${j.data.insertadas} gasto(s) guardado(s) · Total ${fmtGs(totalLineas)}`);
      setLineas([{ categoria_gasto_id: "", monto: "" }]);
      setDescripcion(""); setNumeroFactura(""); setFormaPago("");
      setTimeout(() => setOkMsg(null), 4000);
    } else {
      router.push("/gastos");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Gastos</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            {duplicarId ? "Duplicar gasto" : "Nuevo gasto"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">Podés cargar varias categorías con el botón <strong>+</strong> — se guardan todas juntas.</p>
        </div>
        <Link href="/gastos" className="text-xs text-slate-500 hover:underline">← Volver</Link>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); guardar(false); }} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Filial *</label>
            <FancySelect options={filialOptions} value={filialId} onChange={setFilialId} placeholder="Elegí una filial" />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Fecha *</span>
            <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Categorías y montos</span>
            <span className="text-xs text-slate-500">Total: <strong className="text-rose-700">{fmtGs(totalLineas)}</strong></span>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                <FancySelect
                  size="sm"
                  options={[{ value: "", label: filialId ? "— categoría —" : "— elegí filial primero —" }, ...categoriaOptions]}
                  value={l.categoria_gasto_id}
                  onChange={(v) => setLinea(i, { categoria_gasto_id: v })}
                  placeholder="Categoría"
                  disabled={!filialId}
                />
                <input type="number" step="1" min="1" value={l.monto} onChange={(e) => setLinea(i, { monto: e.target.value })}
                  placeholder="Monto Gs"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
                <button type="button" onClick={() => removeLinea(i)} disabled={lineas.length === 1}
                  className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-30"
                  title="Quitar línea">✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addLinea}
            className="mt-3 rounded-lg border border-dashed border-[#4FAEB2] bg-white px-3 py-1.5 text-xs font-semibold text-[#3F8E91] hover:bg-[#4FAEB2]/10">
            + Agregar otra categoría
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Forma de pago (compartida)</label>
          <FancySelect options={formaPagoOptions} value={formaPago} onChange={setFormaPago} placeholder="— sin especificar —" />
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">N° de factura <span className="font-normal text-slate-400">(opcional, compartido)</span></span>
          <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Descripción <span className="font-normal text-slate-400">(compartida)</span></span>
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
