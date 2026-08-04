import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { toStdNombre } from "@/lib/iglesia/normalize";

/** GET /api/iglesia/filiales — lista de filiales activas con sector. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { data, error } = await ctx.supabase
      .from("filiales")
      .select("id, nombre, es_junta, aplica_15_porciento, sector_id, sectores(id, nombre, orden)")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("activo", true)
      .order("nombre");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/iglesia/filiales — crea filial. Nombre siempre MAYUSCULAS. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? toStdNombre(body.nombre) : "";
    const sector_id = typeof body.sector_id === "string" && body.sector_id ? body.sector_id : null;
    const es_junta = body.es_junta === true;
    const aplica_15_porciento = body.aplica_15_porciento === true;
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    if (!es_junta && !sector_id) return NextResponse.json(errorResponse("Elegí un sector (o marcá 'Es JUNTA')."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("filiales")
      .insert({ empresa_id: ctx.auth.empresa_id, nombre, sector_id: es_junta ? null : sector_id, es_junta, aplica_15_porciento })
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
