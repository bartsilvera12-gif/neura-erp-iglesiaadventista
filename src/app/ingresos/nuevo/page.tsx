"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";
import { buildFilialOptions, type FilialLite } from "@/lib/iglesia/build-filial-options";

type Categoria = { id: string; nombre: string };

export default function NuevoIngresoPage() {
  const router = useRouter();
  const [filiales, setFiliales] = useState<FilialLite[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [filialId, setFilialId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const filialOptions = useMemo(() => buildFilialOptions(filiales), [filiales]);
  const categoriaOptions = useMemo(
    () => categorias.map((c) => ({ value: c.id, label: c.nombre })),
    [categorias]
  );

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!filialId) return setError("Elegí una filial.");
    if (!categoriaId) return setError("Elegí una categoría.");
    setGuardando(true);
    const res = await fetchWithSupabaseSession("/api/iglesia/ingresos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filial_id: filialId,
        categoria_id: categoriaId,
        fecha,
        monto: Number(monto),
        descripcion,
      }),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) {
      setError(j?.error || "No se pudo guardar.");
      return;
    }
    router.push("/ingresos");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Ingresos</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Nuevo ingreso</h1>
        </div>
        <Link href="/ingresos" className="text-xs text-slate-500 hover:underline">← Volver</Link>
      </div>

      <form onSubmit={guardar} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-[#4FAEB2]/10">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Filial *</label>
          <FancySelect
            options={filialOptions}
            value={filialId}
            onChange={setFilialId}
            placeholder="Elegí una filial"
            ariaLabel="Filial"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Categoría *</label>
          <FancySelect
            options={categoriaOptions}
            value={categoriaId}
            onChange={setCategoriaId}
            placeholder="Elegí una categoría"
            ariaLabel="Categoría"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Fecha *</span>
            <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Monto (Gs) *</span>
            <input required type="number" step="1" min="1" value={monto} onChange={(e) => setMonto(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Descripción</span>
          <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/ingresos" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancelar
          </Link>
          <button disabled={guardando} type="submit"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
