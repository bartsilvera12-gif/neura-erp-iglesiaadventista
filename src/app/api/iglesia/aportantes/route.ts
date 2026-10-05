import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { toStdNombre } from "@/lib/iglesia/normalize";

/** Normaliza una cédula: solo dígitos (quita puntos/espacios). "" => null. */
function normalizarCedula(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const limpia = raw.replace(/[^\dkK]/g, "").trim();
  return limpia ? limpia : null;
}

/** GET /api/iglesia/aportantes */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("aportantes")
      .select(`
        id, nombre, cedula, telefono, observaciones, activo, filial_id,
        filial:filiales(id, nombre, es_junta, sector:sectores(id, nombre))
      `)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("nombre");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/iglesia/aportantes — { nombre, cedula?, filial_id?, telefono?, observaciones? } */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador puede crear aportantes."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? toStdNombre(body.nombre) : "";
    const cedula = normalizarCedula(body.cedula);
    const filial_id = typeof body.filial_id === "string" && body.filial_id ? body.filial_id : null;
    const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
    const observaciones = typeof body.observaciones === "string" ? body.observaciones.trim() : "";
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("aportantes")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        nombre, cedula, filial_id,
        telefono: telefono || null, observaciones: observaciones || null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(errorResponse("Ya existe un aportante con esa cédula."), { status: 400 });
      }
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
