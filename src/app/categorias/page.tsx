"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect } from "@/components/ui/FancySelect";

type Tipo = "ingreso" | "gasto";
type Categoria = { id: string; nombre: string; orden: number; aplica_a?: "filial" | "junta" | "ambos" };

const APLICA_LABEL: Record<string, string> = {
  filial: "Filiales",
  junta: "Junta",
  ambos: "Ambos",
};

export default function CategoriasPage() {
  const [ingreso, setIngreso] = useState<Categoria[]>([]);
  const [gasto, setGasto] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);

  const [edit, setEdit] = useState<{ tipo: Tipo; cat: Categoria | null } | null>(null);
  const [del, setDel] = useState<{ tipo: Tipo; cat: Categoria } | null>(null);

  async function cargar() {
    setCargando(true);
    const j = await fetchWithSupabaseSession("/api/iglesia/categorias", { cache: "no-store" }).then((r) => r.json());
    if (j?.success) {
      setIngreso(j.data.ingreso ?? []);
      setGasto(j.data.gasto ?? []);
    }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  async function eliminar() {
    if (!del) return;
    const res = await fetchWithSupabaseSession(`/api/iglesia/categorias/${del.cat.id}?tipo=${del.tipo}`, { method: "DELETE" });
    const j = await res.json();
    setDel(null);
    if (!j?.success) alert(j?.error || "No se pudo eliminar. Puede que tenga movimientos asociados.");
    cargar();
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Iglesia · Configuración</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Categorías</h1>
        <p className="mt-0.5 text-xs text-slate-500">Categorías de ingresos y gastos usadas al cargar movimientos.</p>
      </div>

      <CategoriaSection
        titulo="Categorías de ingreso"
        tipo="ingreso"
        cats={ingreso}
        cargando={cargando}
        onNueva={() => setEdit({ tipo: "ingreso", cat: null })}
        onEditar={(cat) => setEdit({ tipo: "ingreso", cat })}
        onEliminar={(cat) => setDel({ tipo: "ingreso", cat })}
      />

      <CategoriaSection
        titulo="Categorías de gasto"
        tipo="gasto"
        cats={gasto}
        cargando={cargando}
        onNueva={() => setEdit({ tipo: "gasto", cat: null })}
        onEditar={(cat) => setEdit({ tipo: "gasto", cat })}
        onEliminar={(cat) => setDel({ tipo: "gasto", cat })}
      />

      {edit && (
        <CategoriaModal
          tipo={edit.tipo}
          cat={edit.cat}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); cargar(); }}
        />
      )}
      {del && (
        <ConfirmModal
          titulo="¿Eliminar categoría?"
          mensaje={`Categoría "${del.cat.nombre}". Si tiene ingresos/gastos cargados, no se puede eliminar.`}
          onCancel={() => setDel(null)}
          onConfirm={eliminar}
        />
      )}
    </div>
  );
}

function CategoriaSection({ titulo, tipo, cats, cargando, onNueva, onEditar, onEliminar }: {
  titulo: string;
  tipo: Tipo;
  cats: Categoria[];
  cargando: boolean;
  onNueva: () => void;
  onEditar: (cat: Categoria) => void;
  onEliminar: (cat: Categoria) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        <button onClick={onNueva}
          className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95">
          + Nueva categoría
        </button>
      </div>
      {cargando ? (
        <div className="py-8 text-center text-sm text-slate-400">Cargando…</div>
      ) : cats.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-sm">Sin categorías. Creá una para arrancar.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Nombre</th>
              <th className="px-4 py-2 text-left">Orden</th>
              {tipo === "gasto" && <th className="px-4 py-2 text-left">Aplica a</th>}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cats.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{c.nombre}</td>
                <td className="px-4 py-2 text-slate-600">{c.orden}</td>
                {tipo === "gasto" && (
                  <td className="px-4 py-2 text-slate-600 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{APLICA_LABEL[c.aplica_a ?? "ambos"]}</span>
                  </td>
                )}
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onEditar(c)} className="mr-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-[#4FAEB2]/60">✏️ Editar</button>
                  <button onClick={() => onEliminar(c)} className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CategoriaModal({ tipo, cat, onClose, onSaved }: {
  tipo: Tipo;
  cat: Categoria | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(cat?.nombre ?? "");
  const [orden, setOrden] = useState(cat ? String(cat.orden) : "");
  const [aplicaA, setAplicaA] = useState<string>(cat?.aplica_a ?? "ambos");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aplicaOptions = [
    { value: "ambos", label: "Ambos (filiales y junta)" },
    { value: "filial", label: "Solo filiales" },
    { value: "junta", label: "Solo junta" },
  ];

  async function guardar() {
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    setGuardando(true);
    const url = cat ? `/api/iglesia/categorias/${cat.id}` : "/api/iglesia/categorias";
    const method = cat ? "PUT" : "POST";
    const payload: Record<string, unknown> = { tipo, nombre };
    if (orden.trim() !== "") payload.orden = Number(orden) || 0;
    if (tipo === "gasto") payload.aplica_a = aplicaA;
    const res = await fetchWithSupabaseSession(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    setGuardando(false);
    if (!j?.success) return setError(j?.error || "No se pudo guardar.");
    onSaved();
  }

  const titulo = `${cat ? "Editar" : "Nueva"} categoría de ${tipo === "gasto" ? "gasto" : "ingreso"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{titulo}</h3>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre * (se guarda en mayúsculas)</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        {tipo === "gasto" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Aplica a *</label>
            <FancySelect options={aplicaOptions} value={aplicaA} onChange={setAplicaA} />
            <p className="mt-1 text-[11px] text-slate-400">Define en qué filiales se puede usar: solo filiales, solo la JUNTA, o ambas.</p>
          </div>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Orden (opcional, para ordenar en listas)</span>
          <input type="number" value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="Al final"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" disabled={guardando} onClick={guardar}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ titulo, mensaje, onCancel, onConfirm }: {
  titulo: string; mensaje: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{titulo}</h3>
        <p className="mt-2 text-sm text-slate-600">{mensaje}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={onConfirm} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 active:scale-95">Sí, eliminar</button>
        </div>
      </div>
    </div>
  );
}
