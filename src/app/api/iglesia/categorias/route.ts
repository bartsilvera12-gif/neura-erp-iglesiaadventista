import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { toStdNombre } from "@/lib/iglesia/normalize";

const APLICA_A_VALIDOS = ["filial", "junta", "ambos"];

/**
 * GET /api/iglesia/categorias
 * Devuelve { ingreso: [...], gasto: [...] } para poblar dropdowns.
 * Filtro opcional ?tipoFilial=junta|filial para pre-filtrar gastos por aplicabilidad.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const url = new URL(request.url);
    const tipoFilial = url.searchParams.get("tipoFilial"); // 'junta' | 'filial' | null

    const [ingQ, gastoQ] = await Promise.all([
      ctx.supabase
        .from("categorias_ingreso")
        .select("id, nombre, orden")
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("activo", true)
        .order("orden"),
      ctx.supabase
        .from("categorias_gasto")
        .select("id, nombre, aplica_a, orden")
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("activo", true)
        .order("orden"),
    ]);
    if (ingQ.error) return NextResponse.json(errorResponse(ingQ.error.message), { status: 400 });
    if (gastoQ.error) return NextResponse.json(errorResponse(gastoQ.error.message), { status: 400 });

    let gastos = gastoQ.data ?? [];
    if (tipoFilial === "junta") {
      gastos = gastos.filter((c) => c.aplica_a === "junta" || c.aplica_a === "ambos");
    } else if (tipoFilial === "filial") {
      gastos = gastos.filter((c) => c.aplica_a === "filial" || c.aplica_a === "ambos");
    }

    return NextResponse.json(successResponse({
      ingreso: ingQ.data ?? [],
      gasto: gastos,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST /api/iglesia/categorias — crea una categoría.
 * Body: { tipo: "ingreso"|"gasto", nombre, aplica_a?, orden? }
 * `aplica_a` solo aplica a gastos (filial|junta|ambos, default ambos).
 * El nombre se guarda normalizado en MAYÚSCULAS.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = body.tipo === "gasto" ? "gasto" : "ingreso";
    const nombre = typeof body.nombre === "string" ? toStdNombre(body.nombre) : "";
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });

    const tabla = tipo === "gasto" ? "categorias_gasto" : "categorias_ingreso";

    // Orden: si no viene, lo ubicamos al final (max + 1).
    let orden = Number(body.orden);
    if (!Number.isFinite(orden)) {
      const { data: maxRow } = await ctx.supabase
        .from(tabla)
        .select("orden")
        .eq("empresa_id", ctx.auth.empresa_id)
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle();
      orden = ((maxRow?.orden as number | undefined) ?? 0) + 1;
    }

    const insert: Record<string, unknown> = { empresa_id: ctx.auth.empresa_id, nombre, orden, activo: true };
    if (tipo === "gasto") {
      insert.aplica_a = APLICA_A_VALIDOS.includes(String(body.aplica_a)) ? body.aplica_a : "ambos";
    }

    const { data, error } = await ctx.supabase.from(tabla).insert(insert).select().single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
