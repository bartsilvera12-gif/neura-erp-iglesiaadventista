import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("sectores")
      .select("id, nombre, orden, activo")
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("orden")
      .order("nombre");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().toUpperCase() : "";
    const orden = Number(body.orden);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("sectores")
      .insert({ empresa_id: ctx.auth.empresa_id, nombre, orden: Number.isFinite(orden) ? orden : 0 })
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
