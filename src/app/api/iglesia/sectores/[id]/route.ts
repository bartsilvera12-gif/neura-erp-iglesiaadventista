import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().toUpperCase() : "";
    const orden = Number(body.orden);
    const activo = body.activo === false ? false : true;
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("sectores")
      .update({ nombre, orden: Number.isFinite(orden) ? orden : 0, activo })
      .eq("id", id)
      .eq("empresa_id", ctx.auth.empresa_id)
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const { error } = await ctx.supabase
      .from("sectores")
      .delete()
      .eq("id", id)
      .eq("empresa_id", ctx.auth.empresa_id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ deleted: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
