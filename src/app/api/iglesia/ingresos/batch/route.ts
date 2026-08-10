import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/iglesia/ingresos/batch
 * Inserta N ingresos compartiendo filial/fecha/aportante/forma_pago/descripcion/numero_factura.
 * Cada linea aporta su propia categoria y monto.
 * Body: { filial_id, fecha, aportante_id?, forma_pago?, descripcion?, numero_factura?, lineas: [{categoria_id, monto}] }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const filial_id = typeof body.filial_id === "string" ? body.filial_id : "";
    const fecha = typeof body.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.fecha) ? body.fecha.slice(0, 10) : null;
    const aportante_id = typeof body.aportante_id === "string" && body.aportante_id ? body.aportante_id : null;
    const formaPagoIn = typeof body.forma_pago === "string" ? body.forma_pago : "";
    const forma_pago = ["efectivo","transferencia","deposito","cheque"].includes(formaPagoIn) ? formaPagoIn : null;
    const descripcion = body.descripcion != null ? String(body.descripcion).trim() || null : null;
    const numero_factura = typeof body.numero_factura === "string" && body.numero_factura.trim() ? body.numero_factura.trim() : null;
    const lineas = Array.isArray(body.lineas) ? body.lineas : [];

    if (!filial_id) return NextResponse.json(errorResponse("Elegí una filial."), { status: 400 });
    if (!fecha) return NextResponse.json(errorResponse("Fecha inválida."), { status: 400 });
    if (lineas.length === 0) return NextResponse.json(errorResponse("Agregá al menos una categoría con monto."), { status: 400 });

    const rows = [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i] as Record<string, unknown>;
      const categoria_id = typeof l.categoria_id === "string" ? l.categoria_id : "";
      const monto = Number(l.monto);
      if (!categoria_id) return NextResponse.json(errorResponse(`Línea ${i + 1}: elegí una categoría.`), { status: 400 });
      if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json(errorResponse(`Línea ${i + 1}: el monto debe ser mayor a 0.`), { status: 400 });
      rows.push({
        empresa_id: ctx.auth.empresa_id,
        filial_id, categoria_id, aportante_id,
        fecha, monto, descripcion, forma_pago, numero_factura,
        usuario_id: ctx.auth.usuarioCatalogId ?? null,
      });
    }

    const { data, error } = await ctx.supabase.from("ingresos").insert(rows).select("id");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ insertadas: data?.length ?? 0 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
