"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Accion = "INSERT" | "SKIP" | "ERROR";
type Fila = {
  row_number: number;
  action: Accion;
  data: { nombre: string; cedula: string | null; filial: string | null };
  warnings: string[];
  errors: string[];
};
type Preview = {
  summary: { total: number; insertar: number; omitir: number; errores: number; warnings: number };
  rows: Fila[];
  filiales_faltantes: string[];
  crear_filiales: boolean;
};
type Commit = {
  summary: { total: number; inserted: number; skipped: number; errors: number; warnings: number };
  errors: string[];
};

export default function NominaImportModal({ onClose, onCompleted }: {
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [crearFiliales, setCrearFiliales] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [commit, setCommit] = useState<Commit | null>(null);

  async function enviar(dry: boolean) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("crear_filiales", crearFiliales ? "1" : "0");
      const url = `/api/iglesia/aportantes/import${dry ? "?dry=1" : ""}`;
      const r = await fetchWithSupabaseSession(url, { method: "POST", body: fd });
      const j = await r.json();
      if (!j?.success) { setError(j?.error ?? `Error ${r.status}`); return; }
      if (dry) { setPreview(j.data as Preview); setStep("preview"); }
      else { setCommit(j.data as Commit); setStep("done"); onCompleted(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm px-4 pt-16" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Importar nómina de aportantes</h2>
            <p className="text-xs text-slate-400">
              Paso {step === "upload" ? "1 de 3" : step === "preview" ? "2 de 3" : "3 de 3"}
            </p>
          </div>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-700">×</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Subí un archivo Excel (.xlsx) con las columnas <strong>Nombre</strong>, <strong>Cédula</strong> y <strong>Filial</strong>.
                <a href="/api/iglesia/aportantes/plantilla" className="ml-2 inline-flex items-center gap-1 text-[#3F8E91] underline hover:text-[#2d6a6d]">
                  Descargar plantilla
                </a>
              </p>
              <input type="file" accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#4FAEB2] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#3F8E91]" />
              <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
                <input type="checkbox" checked={crearFiliales} onChange={(e) => setCrearFiliales(e.target.checked)} />
                Crear automáticamente las filiales que no existan todavía
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
                <button onClick={() => enviar(true)} disabled={!file || busy}
                  className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
                  {busy ? "Analizando…" : "Revisar antes de guardar"}
                </button>
              </div>
            </div>
          )}

          {step === "preview" && preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Stat label="Total" value={preview.summary.total} color="slate" />
                <Stat label="A cargar" value={preview.summary.insertar} color="green" />
                <Stat label="Repetidos (se omiten)" value={preview.summary.omitir} color="amber" />
                <Stat label="Con error" value={preview.summary.errores} color="red" />
              </div>
              {preview.filiales_faltantes.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <strong>Filiales que no existen:</strong> {preview.filiales_faltantes.join(", ")}.
                  {preview.crear_filiales
                    ? " Se crearán automáticamente al guardar."
                    : " Marcá la casilla para crearlas, o cargalas antes en Sectores y Filiales."}
                </div>
              )}
              <FilaTabla rows={preview.rows} />
              <div className="flex justify-between gap-2 pt-2">
                <button onClick={() => setStep("upload")} className="rounded-lg border px-4 py-2 text-sm">← Volver</button>
                <button onClick={() => enviar(false)} disabled={busy || preview.summary.insertar === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? "Guardando…" : `Guardar ${preview.summary.insertar} aportante(s)`}
                </button>
              </div>
            </div>
          )}

          {step === "done" && commit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Stat label="Total" value={commit.summary.total} color="slate" />
                <Stat label="Cargados" value={commit.summary.inserted} color="green" />
                <Stat label="Omitidos" value={commit.summary.skipped} color="amber" />
                <Stat label="Errores" value={commit.summary.errors} color="red" />
              </div>
              {commit.errors.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded border border-red-200 bg-red-50 p-2 text-xs">
                  {commit.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
              <p className="text-sm text-emerald-700">✓ Importación terminada.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white">Cerrar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: "slate" | "green" | "amber" | "red" }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color]}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-75">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function FilaTabla({ rows }: { rows: Fila[] }) {
  const visibles = rows.slice(0, 200);
  return (
    <div className="max-h-[40vh] overflow-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-xs sm:min-w-0">
        <thead className="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            <th className="px-2 py-1.5 text-left">Fila</th>
            <th className="px-2 py-1.5 text-left">Acción</th>
            <th className="px-2 py-1.5 text-left">Nombre</th>
            <th className="px-2 py-1.5 text-left">Cédula</th>
            <th className="px-2 py-1.5 text-left">Filial</th>
            <th className="px-2 py-1.5 text-left">Mensajes</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((r) => {
            const badge =
              r.action === "INSERT" ? "bg-emerald-100 text-emerald-700" :
              r.action === "SKIP" ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700";
            const label = r.action === "INSERT" ? "CARGAR" : r.action === "SKIP" ? "OMITIR" : "ERROR";
            return (
              <tr key={r.row_number} className="border-t border-slate-100">
                <td className="px-2 py-1 text-slate-500">{r.row_number}</td>
                <td className="px-2 py-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>{label}</span></td>
                <td className="px-2 py-1 text-slate-700">{r.data.nombre || "—"}</td>
                <td className="px-2 py-1 text-slate-600">{r.data.cedula || "—"}</td>
                <td className="px-2 py-1 text-slate-600">{r.data.filial || "—"}</td>
                <td className="px-2 py-1">
                  {r.errors.map((e, i) => <div key={`e${i}`} className="text-red-700">⚠ {e}</div>)}
                  {r.warnings.map((w, i) => <div key={`w${i}`} className="text-amber-700">• {w}</div>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > visibles.length && (
        <div className="border-t px-2 py-1 text-xs text-slate-400">Mostrando primeras {visibles.length} de {rows.length} filas.</div>
      )}
    </div>
  );
}
