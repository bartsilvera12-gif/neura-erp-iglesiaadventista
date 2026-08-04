import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

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
