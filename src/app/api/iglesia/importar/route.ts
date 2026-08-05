import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import * as XLSX from "xlsx";
import { parseFecha } from "@/lib/iglesia/date-parse";
import { toStdKey } from "@/lib/iglesia/normalize";

const FORMAS_VALIDAS = ["efectivo", "transferencia", "deposito", "cheque"];

type ImportResult = {
  importadas: number;
  errores: { fila: number; error: string }[];
};

// Normaliza para matcheo (sin acentos, sin mayusculas, sin espacios extras)
function norm(s: unknown): string {
  return toStdKey(s);
}

/**
 * POST /api/iglesia/importar (multipart/form-data)
 * Fields: file (xlsx), tipo=ingresos|gastos
 * Salta filas con error y devuelve un resumen.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const tipo = form.get("tipo") === "gastos" ? "gastos" : "ingresos";
    if (!file) return NextResponse.json(errorResponse("Falta el archivo."), { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "datos") ?? wb.SheetNames[0];
    if (!sheetName) return NextResponse.json(errorResponse("Archivo vacío."), { status: 400 });
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    // Cargar catalogos en memoria (por-lookup rapido)
    const [filQ, catIngQ, catGasQ, aportQ] = await Promise.all([
      ctx.supabase.from("filiales").select("id, nombre, es_junta").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true),
      ctx.supabase.from("categorias_ingreso").select("id, nombre").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true),
      ctx.supabase.from("categorias_gasto").select("id, nombre, aplica_a").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true),
      ctx.supabase.from("aportantes").select("id, nombre").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true),
    ]);
    const filialByName = new Map<string, { id: string; es_junta: boolean }>(
      (filQ.data ?? []).map((f) => [norm(f.nombre), { id: f.id as string, es_junta: !!f.es_junta }])
    );
    const catIngByName = new Map<string, string>((catIngQ.data ?? []).map((c) => [norm(c.nombre), c.id as string]));
    const catGasByName = new Map<string, { id: string; aplica_a: string }>(
      (catGasQ.data ?? []).map((c) => [norm(c.nombre), { id: c.id as string, aplica_a: c.aplica_a as string }])
    );
    const aportByName = new Map<string, string>((aportQ.data ?? []).map((a) => [norm(a.nombre), a.id as string]));

    const result: ImportResult = { importadas: 0, errores: [] };

    // Helpers para leer columnas por nombre parcial (evita romper por espacios/mayus)
    const getCol = (row: Record<string, unknown>, patrones: string[]): unknown => {
      const keys = Object.keys(row);
      for (const pat of patrones) {
        const k = keys.find((kk) => norm(kk).startsWith(pat));
        if (k != null) return row[k];
      }
      return "";
    };

    for (let i = 0; i < rows.length; i++) {
      const filaExcel = i + 2; // +1 header, +1 base 1
      const row = rows[i];

      // Si toda la fila esta vacia, saltar sin error
      const vacio = Object.values(row).every((v) => v == null || String(v).trim() === "");
      if (vacio) continue;

      const fechaRaw = getCol(row, ["fecha"]);
      const filialRaw = getCol(row, ["filial"]);
      const catRaw = getCol(row, ["categor"]);
      const formaRaw = getCol(row, ["forma"]);
      const facturaRaw = getCol(row, ["n° factura", "n factura", "nº factura", "factura"]);
      const montoRaw = getCol(row, ["monto"]);
      const descRaw = getCol(row, ["descrip"]);

      const fecha = parseFecha(fechaRaw);
      if (!fecha) { result.errores.push({ fila: filaExcel, error: `Fecha inválida: "${fechaRaw}"` }); continue; }

      const filialKey = norm(filialRaw);
      const filial = filialKey ? filialByName.get(filialKey) : undefined;
      if (!filial) { result.errores.push({ fila: filaExcel, error: `Filial no encontrada: "${filialRaw}"` }); continue; }

      const catKey = norm(catRaw);
      let categoriaId: string | undefined;
      if (tipo === "ingresos") {
        categoriaId = catIngByName.get(catKey);
        if (!categoriaId) { result.errores.push({ fila: filaExcel, error: `Categoría de ingreso no encontrada: "${catRaw}"` }); continue; }
      } else {
        const cat = catGasByName.get(catKey);
        if (!cat) { result.errores.push({ fila: filaExcel, error: `Categoría de gasto no encontrada: "${catRaw}"` }); continue; }
        // Validar aplica_a vs tipo de filial
        const okJunta = filial.es_junta && (cat.aplica_a === "junta" || cat.aplica_a === "ambos");
        const okFilial = !filial.es_junta && (cat.aplica_a === "filial" || cat.aplica_a === "ambos");
        if (!okJunta && !okFilial) {
          result.errores.push({ fila: filaExcel, error: `Categoría "${catRaw}" no aplica a la filial "${filialRaw}"` });
          continue;
        }
        categoriaId = cat.id;
      }

      const monto = Number(String(montoRaw).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(monto) || monto <= 0) {
        result.errores.push({ fila: filaExcel, error: `Monto inválido: "${montoRaw}"` });
        continue;
      }

      let forma_pago: string | null = null;
      const formaKey = norm(formaRaw);
      if (formaKey) {
        if (!FORMAS_VALIDAS.includes(formaKey)) {
          result.errores.push({ fila: filaExcel, error: `Forma de pago inválida: "${formaRaw}" (usá: efectivo, transferencia, deposito, cheque)` });
          continue;
        }
        forma_pago = formaKey;
      }

      const descripcion = String(descRaw ?? "").trim() || null;
      const numero_factura = String(facturaRaw ?? "").trim() || null;

      if (tipo === "ingresos") {
        // Aportante: opcional. Si viene y no existe, se crea.
        const aportanteRaw = getCol(row, ["aportante"]);
        const aportanteTelRaw = getCol(row, ["telefono", "tel"]);
        let aportante_id: string | null = null;
        const aportanteName = String(aportanteRaw ?? "").trim();
        if (aportanteName) {
          const upperName = aportanteName.toUpperCase();
          const key = norm(upperName);
          const found = aportByName.get(key);
          if (found) {
            aportante_id = found;
          } else {
            // Crear automatico
            const tel = String(aportanteTelRaw ?? "").trim() || null;
            const ins = await ctx.supabase
              .from("aportantes")
              .insert({ empresa_id: ctx.auth.empresa_id, nombre: upperName, telefono: tel })
              .select("id")
              .single();
            if (ins.error) {
              result.errores.push({ fila: filaExcel, error: `No se pudo crear aportante "${aportanteName}": ${ins.error.message}` });
              continue;
            }
            aportante_id = ins.data.id as string;
            aportByName.set(key, aportante_id);
          }
        }

        const ins = await ctx.supabase
          .from("ingresos")
          .insert({
            empresa_id: ctx.auth.empresa_id,
            filial_id: filial.id,
            categoria_id: categoriaId,
            aportante_id,
            fecha, monto, descripcion, forma_pago, numero_factura,
            usuario_id: ctx.auth.usuarioCatalogId ?? null,
          });
        if (ins.error) { result.errores.push({ fila: filaExcel, error: ins.error.message }); continue; }
        result.importadas++;
      } else {
        const catRow = await ctx.supabase.from("categorias_gasto").select("nombre").eq("id", categoriaId!).maybeSingle();
        const ins = await ctx.supabase
          .from("gastos")
          .insert({
            empresa_id: ctx.auth.empresa_id,
            filial_id: filial.id,
            categoria_gasto_id: categoriaId,
            categoria: (catRow.data?.nombre as string | undefined) ?? null,
            fecha, monto, descripcion, forma_pago, numero_factura,
            tipo: "variable", recurrente: false, descuenta_caja: false,
          });
        if (ins.error) { result.errores.push({ fila: filaExcel, error: ins.error.message }); continue; }
        result.importadas++;
      }
    }

    return NextResponse.json(successResponse(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
