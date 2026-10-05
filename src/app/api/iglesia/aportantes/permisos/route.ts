import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/iglesia/aportantes/permisos → { esAdmin }
 * Usa la MISMA fuente de rol que el gating de la API (catálogo zentra_erp,
 * vía getTenantSupabaseFromAuthWithRol), para que la UI coincida exactamente
 * con lo que el backend permite. No depende de `usuarios` del schema del tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const esAdmin = esRolAdminEmpresaOGlobal(ctx.auth.rol);
    return NextResponse.json(successResponse({ esAdmin }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
