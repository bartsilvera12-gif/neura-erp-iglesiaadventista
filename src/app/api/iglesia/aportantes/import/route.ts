import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { toStdNombre, toStdKey } from "@/lib/iglesia/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Accion = "INSERT" | "SKIP" | "ERROR";
type Fila = {
  row_number: number;
  action: Accion;
  data: { nombre: string; cedula: string | null; filial: string | null };
  warnings: string[];
  errors: string[];
};

/** Normaliza una cédula: solo dígitos (quita puntos/espacios). "" => null. */
function normalizarCedula(raw: unknown): string | null {
  const limpia = String(raw ?? "").replace(/[^\dkK]/g, "").trim();
  return limpia ? limpia : null;
}

/** Texto plano de un valor de celda ExcelJS (maneja richText / formula / number). */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.result !== "undefined") return String(o.result);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if (o.hyperlink && typeof o.text === "string") return o.text;
  }
  return String(v);
}

/**
 * POST /api/iglesia/aportantes/import
 *  - multipart: file (xlsx), crear_filiales ("1"|"0")
 *  - ?dry=1  → solo previsualiza (no escribe)
 * Detecta columnas por encabezado: Nombre / Apellido y nombre, Cédula, Filial.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador puede importar la nómina."), { status: 403 });
    }

    const dry = new URL(request.url).searchParams.get("dry") === "1";
    const form = await request.formData();
    const file = form.get("file");
    const crearFiliales = String(form.get("crear_filiales") ?? "0") === "1";
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Adjuntá un archivo .xlsx."), { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json(errorResponse("Formato no soportado. Subí un archivo .xlsx."), { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json(errorResponse("El archivo no tiene hojas."), { status: 400 });

    let headerRow = -1;
    let colNombre = -1, colCedula = -1, colFilial = -1;
    const maxScan = Math.min(ws.rowCount, 15);
    for (let r = 1; r <= maxScan; r++) {
      const row = ws.getRow(r);
      let cN = -1, cC = -1, cF = -1;
      for (let c = 1; c <= ws.columnCount; c++) {
        const h = toStdKey(cellText(row.getCell(c).value));
        if (!h) continue;
        if (cN < 0 && h.includes("nombre")) cN = c;
        if (cC < 0 && h.includes("cedula")) cC = c;
        if (cF < 0 && h.includes("filial") && !h.includes("codigo")) cF = c;
      }
      if (cN > 0 && (cC > 0 || cF > 0)) {
        headerRow = r; colNombre = cN; colCedula = cC; colFilial = cF;
        break;
      }
    }
    if (headerRow < 0) {
      return NextResponse.json(errorResponse(
        "No se encontró el encabezado. El Excel debe tener columnas 'Nombre', 'Cédula' y 'Filial'."
      ), { status: 400 });
    }

    const { data: filialesDb, error: filErr } = await ctx.supabase
      .from("filiales").select("id, nombre").eq("empresa_id", ctx.auth.empresa_id);
    if (filErr) return NextResponse.json(errorResponse(filErr.message), { status: 400 });
    const filialPorNombre = new Map<string, string>();
    for (const f of filialesDb ?? []) filialPorNombre.set(toStdKey(f.nombre), f.id as string);

    const { data: apDb, error: apErr } = await ctx.supabase
      .from("aportantes").select("cedula").eq("empresa_id", ctx.auth.empresa_id).not("cedula", "is", null);
    if (apErr) return NextResponse.json(errorResponse(apErr.message), { status: 400 });
    const cedulasExistentes = new Set<string>();
    for (const a of apDb ?? []) if (a.cedula) cedulasExistentes.add(String(a.cedula));

    const filas: Fila[] = [];
    const filialesFaltantes = new Set<string>();
    const cedulasEnArchivo = new Set<string>();
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nombreRaw = colNombre > 0 ? cellText(row.getCell(colNombre).value).trim() : "";
      const cedulaRaw = colCedula > 0 ? cellText(row.getCell(colCedula).value) : "";
      const filialRaw = colFilial > 0 ? cellText(row.getCell(colFilial).value).trim() : "";
      if (!nombreRaw && !cedulaRaw && !filialRaw) continue;

      const nombre = toStdNombre(nombreRaw);
      const cedula = normalizarCedula(cedulaRaw);
      const warnings: string[] = [];
      const errors: string[] = [];

      if (!nombre) errors.push("Falta el nombre.");

      let filialMatch: string | null = null;
      if (filialRaw) {
        filialMatch = filialPorNombre.get(toStdKey(filialRaw)) ?? null;
        if (!filialMatch) {
          if (crearFiliales) {
            warnings.push(`Se creará la filial "${toStdNombre(filialRaw)}".`);
            filialesFaltantes.add(toStdNombre(filialRaw));
          } else {
            errors.push(`La filial "${filialRaw}" no existe.`);
            filialesFaltantes.add(toStdNombre(filialRaw));
          }
        }
      } else {
        warnings.push("Sin filial asignada.");
      }

      let action: Accion = errors.length ? "ERROR" : "INSERT";
      if (!errors.length) {
        if (cedula) {
          if (cedulasExistentes.has(cedula) || cedulasEnArchivo.has(cedula)) {
            action = "SKIP";
            warnings.push("Ya existe un aportante con esa cédula.");
          } else {
            cedulasEnArchivo.add(cedula);
          }
        } else {
          warnings.push("Sin cédula (no se puede evitar duplicados).");
        }
      }

      filas.push({
        row_number: r,
        action,
        data: { nombre, cedula, filial: filialRaw ? toStdNombre(filialRaw) : null },
        warnings, errors,
      });
    }

    const summary = {
      total: filas.length,
      insertar: filas.filter((f) => f.action === "INSERT").length,
      omitir: filas.filter((f) => f.action === "SKIP").length,
      errores: filas.filter((f) => f.action === "ERROR").length,
      warnings: filas.reduce((s, f) => s + f.warnings.length, 0),
    };

    if (dry) {
      return NextResponse.json(successResponse({
        summary, rows: filas,
        filiales_faltantes: Array.from(filialesFaltantes),
        crear_filiales: crearFiliales,
      }));
    }

    if (crearFiliales) {
      for (const nombreFilial of filialesFaltantes) {
        const key = toStdKey(nombreFilial);
        if (filialPorNombre.has(key)) continue;
        const { data: nueva, error: cErr } = await ctx.supabase
          .from("filiales")
          .insert({ empresa_id: ctx.auth.empresa_id, nombre: nombreFilial, es_junta: false, activo: true })
          .select("id").single();
        if (cErr) return NextResponse.json(errorResponse(`No se pudo crear la filial "${nombreFilial}": ${cErr.message}`), { status: 400 });
        filialPorNombre.set(key, nueva!.id as string);
      }
    }

    const aInsertar = filas
      .filter((f) => f.action === "INSERT")
      .map((f) => ({
        empresa_id: ctx.auth.empresa_id,
        nombre: f.data.nombre,
        cedula: f.data.cedula,
        filial_id: f.data.filial ? (filialPorNombre.get(toStdKey(f.data.filial)) ?? null) : null,
        activo: true,
      }));

    let inserted = 0;
    const errores: string[] = [];
    const CHUNK = 200;
    for (let i = 0; i < aInsertar.length; i += CHUNK) {
      const lote = aInsertar.slice(i, i + CHUNK);
      const { data: ins, error: insErr } = await ctx.supabase.from("aportantes").insert(lote).select("id");
      if (insErr) { errores.push(insErr.message); continue; }
      inserted += ins?.length ?? 0;
    }

    return NextResponse.json(successResponse({
      summary: {
        total: filas.length,
        inserted,
        skipped: summary.omitir,
        errors: summary.errores + (errores.length ? aInsertar.length - inserted : 0),
        warnings: summary.warnings,
      },
      errors: errores,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
