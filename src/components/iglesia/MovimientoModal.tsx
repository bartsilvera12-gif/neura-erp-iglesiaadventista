"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { buildFilialOptions, type FilialLite } from "@/lib/iglesia/build-filial-options";
import { FORMAS_PAGO } from "@/lib/iglesia/formas-pago";
import { AportanteQuickAdd } from "@/components/iglesia/AportanteQuickAdd";
import { MESES_LARGO, aniosDisponibles, mesAnioToFecha } from "@/lib/iglesia/mes-anio";

type Tipo = "ingreso" | "gasto";
type CatIngreso = { id: string; nombre: string };
type CatGasto = { id: string; nombre: string; aplica_a: string };
type Aportante = { id: string; nombre: string };
type Linea = { categoria: string; monto: string };

function fmtGs(n: number) {
  return `${Math.round(n).toLocaleString("es-PY")} ₲`;
}

/**
 * Modal de carga rápida de un movimiento (ingreso o gasto) con un toggle arriba.
 * Se abre desde las listas de Ingresos y Gastos para cargar los dos tipos sin
 * cambiar de pantalla. `defaultTipo` preselecciona según la página que lo abre.
 */
export function MovimientoModal({ defaultTipo, onClose, onSaved }: {
  defaultTipo: Tipo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [catIngreso, setCatIngreso] = useState<CatIngreso[]>([]);
  const [catGasto, setCatGasto] = useState<CatGasto[]>([]);
  const [aportantes, setAportantes] = useState<Aportante[]>([]);

  const [filialId, setFilialId] = useState("");
  const now = new Date();
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [anio, setAnio] = useState<number>(now.getFullYear());
  const fecha = mesAnioToFecha(mes, anio) ?? "";
  const [aportanteId, setAportanteId] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ categoria: "", monto: "" }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [fRes, cRes, aRes] = await Promise.all([
        fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/iglesia/categorias", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/iglesia/aportantes", { cache: "no-store" }),
      ]);
      const fJ = await fRes.json();
      const cJ = await cRes.json();
      const aJ = await aRes.json();
      if (fJ?.success) setFiliales(fJ.data);
      if (cJ?.success) { setCatIngreso(cJ.data.ingreso ?? []); setCatGasto(cJ.data.gasto ?? []); }
      if (aJ?.success) setAportantes(aJ.data);
    })();
  }, []);

  const esIngreso = tipo === "ingreso";
  const filialOptions = useMemo(() => buildFilialOptions(filiales), [filiales]);

  // Categorías según tipo. Para gastos se filtra por aplicabilidad a la filial elegida.
  const categorias = useMemo(() => {
    if (esIngreso) return catIngreso.map((c) => ({ id: c.id, nombre: c.nombre }));
    const f = filiales.find((x) => x.id === filialId);
    const list = !f
      ? catGasto
      : catGasto.filter((c) => c.aplica_a === "ambos" || (f.es_junta ? c.aplica_a === "junta" : c.aplica_a === "filial"));
    return list.map((c) => ({ id: c.id, nombre: c.nombre }));
  }, [esIngreso, catIngreso, catGasto, filiales, filialId]);

  const categoriaOptions = useMemo(() => categorias.map((c) => ({ value: c.id, label: c.nombre })), [categorias]);
  const formaPagoOptions = useMemo(
    () => [{ value: "", label: "— sin especificar —" }, ...FORMAS_PAGO.map((f) => ({ value: f.value, label: f.label }))],
    []
  );
  const aportanteOptions = useMemo(
    () => [{ value: "", label: "— sin aportante (anónimo) —" }, ...aportantes.map((a) => ({ value: a.id, label: a.nombre }))],
    [aportantes]
  );

  // Bloquear aportante si alguna línea es Votos (solo aplica a ingresos).
  const esVoto = esIngreso && lineas.some((l) => catIngreso.find((c) => c.id === l.categoria)?.nombre?.toLowerCase() === "votos");
  useEffect(() => { if (esVoto && aportanteId) setAportanteId(""); }, [esVoto, aportanteId]);

  // Si cambian las categorías disponibles (por tipo/filial), limpiar líneas que ya no aplican.
  useEffect(() => {
    setLineas((prev) => prev.map((l) => (l.categoria && !categorias.some((c) => c.id === l.categoria) ? { ...l, categoria: "" } : l)));
  }, [categorias]);

  function switchTipo(t: Tipo) {
    if (t === tipo) return;
    setTipo(t);
    setLineas([{ categoria: "", monto: "" }]);
    setAportanteId("");
    setError(null);
    setOkMsg(null);
  }

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLinea() { setLineas((prev) => [...prev, { categoria: "", monto: "" }]); }
  function removeLinea(i: number) { setLineas((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i))); }

  const total = lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);

  async function guardar(seguir: boolean) {
    setError(null);
    setOkMsg(null);
    if (!filialId) return setError("Elegí una filial.");
    if (lineas.some((l) => !l.categoria || !(Number(l.monto) > 0))) {
      return setError("Cada línea necesita categoría y monto mayor a 0.");
    }
    setGuardando(true);
    const url = esIngreso ? "/api/iglesia/ingresos/batch" : "/api/iglesia/gastos/batch";
    const body = esIngreso
      ? {
          filial_id: filialId, fecha, aportante_id: aportanteId, forma_pago: formaPago,
          descripcion, numero_factura: numeroFactura,
          lineas: lineas.map((l) => ({ categoria_id: l.categoria, monto: Number(l.monto) })),
        }
      : {
          filial_id: filialId, fecha, forma_pago: formaPago,
          descripcion, numero_factura: numeroFactura,
          lineas: lineas.map((l) => ({ categoria_gasto_id: l.categoria, monto: Number(l.monto) })),
        };
    const res = await fetchWithSupabaseSession(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    onSaved();
    if (seguir) {
      const etiqueta = esIngreso ? "ingreso(s)" : "gasto(s)";
      setOkMsg(`✓ ${j.data.insertadas} ${etiqueta} guardado(s) · Total ${fmtGs(total)}`);
      setLineas([{ categoria: "", monto: "" }]);
      setAportanteId(""); setDescripcion(""); setNumeroFactura(""); setFormaPago("");
      setTimeout(() => setOkMsg(null), 4000);
    } else {
      onClose();
    }
  }

  const totalColor = esIngreso ? "text-emerald-700" : "text-rose-700";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); guardar(false); }}
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-2xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Nuevo movimiento</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">✕</button>
        </div>

        {/* Toggle Ingreso / Gasto */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button type="button" onClick={() => switchTipo("ingreso")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${esIngreso ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
            Ingreso
          </button>
          <button type="button" onClick={() => switchTipo("gasto")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${!esIngreso ? "bg-rose-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
            Gasto
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Filial *</label>
            <FancySelect options={filialOptions} value={filialId} onChange={setFilialId} placeholder="Elegí una filial" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Mes / Año *</label>
            <div className="grid grid-cols-2 gap-2">
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20">
                {MESES_LARGO.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
              </select>
              <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20">
                {aniosDisponibles().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Líneas de categoría + monto */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Categorías y montos</span>
            <span className="text-xs text-slate-500">Total: <strong className={totalColor}>{fmtGs(total)}</strong></span>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                <FancySelect
                  size="sm"
                  options={[{ value: "", label: !esIngreso && !filialId ? "— elegí filial primero —" : "— categoría —" }, ...categoriaOptions]}
                  value={l.categoria}
                  onChange={(v) => setLinea(i, { categoria: v })}
                  placeholder="Categoría"
                  disabled={!esIngreso && !filialId}
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

        {esIngreso && (
          <div>
            <div className="mb-1 flex items-end justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-700">Aportante (compartido)</label>
              {!esVoto && (
                <AportanteQuickAdd onCreated={(a) => {
                  setAportantes((prev) => [...prev, a].sort((x, y) => x.nombre.localeCompare(y.nombre)));
                  setAportanteId(a.id);
                }} />
              )}
            </div>
            <FancySelect options={aportanteOptions} value={aportanteId} onChange={setAportanteId}
              placeholder={esVoto ? "— no aplica cuando hay Votos —" : "— sin aportante —"} disabled={esVoto} />
          </div>
        )}

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
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" disabled={guardando} onClick={() => guardar(true)}
            className="rounded-xl border border-[#4FAEB2] bg-white px-4 py-2 text-sm font-semibold text-[#3F8E91] shadow-sm hover:bg-[#4FAEB2]/10 active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar y agregar otro"}
          </button>
          <button disabled={guardando} type="submit"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar y cerrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
