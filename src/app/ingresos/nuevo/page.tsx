"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Filial = { id: string; nombre: string; es_junta: boolean; sector_id: string | null;
                sectores: { id: string; nombre: string } | null };
type Categoria = { id: string; nombre: string };

export default function NuevoIngresoPage() {
  const router = useRouter();
  const [filiales, setFiliales] = useState<Filial[]>([]);
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

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
        <h1 className="text-lg font-semibold text-slate-900">Nuevo ingreso</h1>
        <Link href="/ingresos" className="text-xs text-slate-500 hover:underline">← Volver</Link>
      </div>

      <form onSubmit={guardar} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm">
          <span className="text-slate-700">Filial *</span>
          <select required value={filialId} onChange={(e) => setFilialId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Elegir —</option>
            {filiales.map((f) => (
              <option key={f.id} value={f.id}>
                {f.sectores?.nombre ? `[${f.sectores.nombre}] ` : (f.es_junta ? "[JUNTA] " : "")}{f.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-slate-700">Categoría *</span>
          <select required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Elegir —</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-700">Fecha *</span>
            <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">Monto (Gs) *</span>
            <input required type="number" step="1" min="1" value={monto} onChange={(e) => setMonto(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-slate-700">Descripción</span>
          <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/ingresos" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            Cancelar
          </Link>
          <button disabled={guardando} type="submit"
            className="rounded-md bg-[#4FAEB2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
