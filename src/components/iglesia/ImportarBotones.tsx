"use client";

import { useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Result = { importadas: number; errores: { fila: number; error: string }[] };

/**
 * Par de botones: "Plantilla" (descarga xlsx) e "Importar" (sube xlsx).
 * Muestra un modal con el resumen al terminar.
 */
export function ImportarBotones({ tipo, onImportado }: { tipo: "ingresos" | "gastos"; onImportado: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function descargarPlantilla() {
    window.open(`/api/iglesia/plantilla?tipo=${tipo}`, "_blank");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSubiendo(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tipo", tipo);
    const res = await fetchWithSupabaseSession("/api/iglesia/importar", { method: "POST", body: fd });
    const j = await res.json();
    setSubiendo(false);
    // limpiar input asi el mismo archivo se puede reintentar
    if (inputRef.current) inputRef.current.value = "";
    if (!j?.success) return setError(j?.error || "Error al importar.");
    setResult(j.data as Result);
    if ((j.data as Result).importadas > 0) onImportado();
  }

  return (
    <>
      <button onClick={descargarPlantilla} type="button"
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]">
        📥 Plantilla
      </button>
      <button onClick={() => inputRef.current?.click()} disabled={subiendo} type="button"
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] disabled:opacity-50">
        {subiendo ? "Subiendo…" : "📤 Importar"}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />

      {(result || error) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => { setResult(null); setError(null); }}>
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#4FAEB2]/20" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Resultado de la importación</h3>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {result && (
              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <p className="font-semibold text-emerald-800">✓ {result.importadas} {result.importadas === 1 ? "fila importada" : "filas importadas"}</p>
                </div>
                {result.errores.length > 0 && (
                  <div className="rounded-xl bg-rose-50 px-4 py-3">
                    <p className="font-semibold text-rose-800 mb-2">⚠ {result.errores.length} {result.errores.length === 1 ? "fila con error (salteada)" : "filas con error (salteadas)"}:</p>
                    <ul className="max-h-64 space-y-1 overflow-y-auto text-xs text-rose-700">
                      {result.errores.map((e, i) => (
                        <li key={i}>
                          <span className="font-mono">Fila {e.fila}</span>: {e.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.importadas === 0 && result.errores.length === 0 && (
                  <p className="text-slate-500">El archivo no tenía filas para importar.</p>
                )}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={() => { setResult(null); setError(null); }}
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] active:scale-95">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
