import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { toStdNombre } from "@/lib/iglesia/normalize";

const APLICA_A_VALIDOS = ["filial", "junta", "ambos"];

function tablaDe(tipo: unknown): "categorias_gasto" | "categorias_ingreso" {
  return tipo === "gasto" ? "categorias_gasto" : "categorias_ingreso";
}

/** PUT /api/iglesia/categorias/:id — edita una categoría. Body incluye `tipo`. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tabla = tablaDe(body.tipo);
    const nombre = typeof body.nombre === "string" ? toStdNombre(body.nombre) : "";
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });

    const update: Record<string, unknown> = { nombre };
    if (Number.isFinite(Number(body.orden))) update.orden = Number(body.orden);
    if (body.activo === true || body.activo === false) update.activo = body.activo;
    if (tabla === "categorias_gasto" && APLICA_A_VALIDOS.includes(String(body.aplica_a))) {
      update.aplica_a = body.aplica_a;
    }

    const { data, error } = await ctx.supabase
      .from(tabla)
      .update(update)
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

/** DELETE /api/iglesia/categorias/:id?tipo=ingreso|gasto — elimina una categoría. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;
    const tipo = new URL(request.url).searchParams.get("tipo");
    const tabla = tablaDe(tipo);
    const { error } = await ctx.supabase
      .from(tabla)
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
