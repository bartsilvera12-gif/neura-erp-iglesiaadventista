import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/iglesia/gastos/batch — inserta N gastos con filial/fecha/etc compartidos.
 * Body: { filial_id, fecha, forma_pago?, descripcion?, numero_factura?, lineas: [{categoria_gasto_id, monto}] }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const filial_id = typeof body.filial_id === "string" ? body.filial_id : "";
    const fecha = typeof body.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.fecha) ? body.fecha.slice(0, 10) : null;
    const formaPagoIn = typeof body.forma_pago === "string" ? body.forma_pago : "";
    const forma_pago = ["efectivo","transferencia","deposito","cheque"].includes(formaPagoIn) ? formaPagoIn : null;
    const descripcion = body.descripcion != null ? String(body.descripcion).trim() || null : null;
    const numero_factura = typeof body.numero_factura === "string" && body.numero_factura.trim() ? body.numero_factura.trim() : null;
    const lineas = Array.isArray(body.lineas) ? body.lineas : [];

    if (!filial_id) return NextResponse.json(errorResponse("Elegí una filial."), { status: 400 });
    if (!fecha) return NextResponse.json(errorResponse("Fecha inválida."), { status: 400 });
    if (lineas.length === 0) return NextResponse.json(errorResponse("Agregá al menos una categoría con monto."), { status: 400 });

    // Precargar nombres de categoria para el campo legacy `categoria`
    const catIds = Array.from(new Set(lineas.map((l: any) => l.categoria_gasto_id).filter(Boolean) as string[]));
    const catMap = new Map<string, string>();
    if (catIds.length > 0) {
      const cats = await ctx.supabase.from("categorias_gasto").select("id, nombre").in("id", catIds).eq("empresa_id", ctx.auth.empresa_id);
      (cats.data ?? []).forEach((c) => catMap.set(c.id as string, c.nombre as string));
    }

    const rows = [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i] as Record<string, unknown>;
      const categoria_gasto_id = typeof l.categoria_gasto_id === "string" ? l.categoria_gasto_id : "";
      const monto = Number(l.monto);
      if (!categoria_gasto_id) return NextResponse.json(errorResponse(`Línea ${i + 1}: elegí una categoría.`), { status: 400 });
      if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json(errorResponse(`Línea ${i + 1}: el monto debe ser mayor a 0.`), { status: 400 });
      rows.push({
        empresa_id: ctx.auth.empresa_id,
        filial_id, categoria_gasto_id,
        categoria: catMap.get(categoria_gasto_id) ?? null,
        fecha, monto, descripcion, forma_pago, numero_factura,
        tipo: "variable", recurrente: false, descuenta_caja: false,
      });
    }

    const { data, error } = await ctx.supabase.from("gastos").insert(rows).select("id");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ insertadas: data?.length ?? 0 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
