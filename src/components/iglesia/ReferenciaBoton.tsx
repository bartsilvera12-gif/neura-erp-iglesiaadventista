"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Filial = { id: string; nombre: string; es_junta: boolean; sectores: { nombre: string } | null };
type Categoria = { id: string; nombre: string; aplica_a?: string };

/** Boton (?) que abre un modal con nombres EXACTOS de filiales y categorias. */
export function ReferenciaBoton({ tipo }: { tipo: "ingresos" | "gastos" }) {
  const [open, setOpen] = useState(false);
  const [filiales, setFiliales] = useState<Filial[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    if (!open || cargado) return;
    (async () => {
      const [f, c] = await Promise.all([
        fetchWithSupabaseSession("/api/iglesia/filiales", { cache: "no-store" }).then((r) => r.json()),
        fetchWithSupabaseSession("/api/iglesia/categorias", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (f?.success) setFiliales(f.data);
      if (c?.success) setCategorias(tipo === "ingresos" ? c.data.ingreso : c.data.gasto);
      setCargado(true);
    })();
  }, [open, cargado, tipo]);

  const filialesPorSector = new Map<string, Filial[]>();
  filiales.forEach((f) => {
    const sec = f.es_junta ? "JUNTA" : (f.sectores?.nombre ?? "Sin sector");
    if (!filialesPorSector.has(sec)) filialesPorSector.set(sec, []);
    filialesPorSector.get(sec)!.push(f);
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Ver nombres exactos"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]">
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-5 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">Nombres exactos</h3>
                <p className="text-xs text-slate-500">Usá estos nombres tal cual al llenar la plantilla o cargar manual.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#4FAEB2]">Filiales por sector</h4>
              {!cargado ? (
                <p className="text-sm text-slate-400">Cargando…</p>
              ) : (
                <div className="space-y-3">
                  {Array.from(filialesPorSector.entries()).map(([sector, fs]) => (
                    <div key={sector}>
                      <p className="text-xs font-semibold text-slate-700">{sector}</p>
                      <ul className="mt-1 grid grid-cols-2 gap-1 text-sm text-slate-600 sm:grid-cols-3">
                        {fs.map((f) => <li key={f.id} className="rounded bg-slate-50 px-2 py-1">{f.nombre}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#4FAEB2]">
                Categorías de {tipo === "ingresos" ? "ingreso" : "gasto"}
              </h4>
              <ul className="grid grid-cols-2 gap-1 text-sm text-slate-600 sm:grid-cols-3">
                {categorias.map((c) => (
                  <li key={c.id} className="rounded bg-slate-50 px-2 py-1">
                    {c.nombre}
                    {c.aplica_a === "junta" && <span className="ml-1 rounded-full bg-purple-100 px-1.5 text-[10px] text-purple-700">JUNTA</span>}
                    {c.aplica_a === "filial" && <span className="ml-1 rounded-full bg-teal-100 px-1.5 text-[10px] text-teal-700">filial</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#4FAEB2]">Formas de pago</h4>
              <ul className="flex flex-wrap gap-1 text-sm text-slate-600">
                {["efectivo","transferencia","deposito","cheque"].map((f) => (
                  <li key={f} className="rounded bg-slate-50 px-2 py-1">{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
