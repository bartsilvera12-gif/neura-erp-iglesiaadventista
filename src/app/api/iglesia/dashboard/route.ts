import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Row = {
  monto: number;
  filial: { id: string; nombre: string; es_junta: boolean; aplica_15_porciento: boolean;
            sector: { id: string; nombre: string } | null } | null;
  categoria: { id: string; nombre: string } | null;
};

/**
 * GET /api/iglesia/dashboard?desde=&hasta=
 * Devuelve agregados para el dashboard: totales, breakdown por filial, sector y categoria.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const filial = url.searchParams.get("filial"); // filtra ingresos y gastos por la misma filial

    const commonFilters = <T extends { gte: any; lte: any; eq: any }>(q: T): T => {
      let r: any = q;
      if (desde) r = r.gte("fecha", desde);
      if (hasta) r = r.lte("fecha", hasta);
      if (filial) r = r.eq("filial_id", filial);
      return r as T;
    };

    const [ingQ, gasQ] = await Promise.all([
      commonFilters(
        ctx.supabase
          .from("ingresos")
          .select(`
            monto,
            filial:filiales!inner(id, nombre, es_junta, aplica_15_porciento, sector:sectores(id, nombre)),
            categoria:categorias_ingreso(id, nombre)
          `)
          .eq("empresa_id", ctx.auth.empresa_id) as any
      ),
      commonFilters(
        ctx.supabase
          .from("gastos")
          .select(`
            monto,
            filial:filiales!inner(id, nombre, es_junta, aplica_15_porciento, sector:sectores(id, nombre)),
            categoria:categorias_gasto(id, nombre)
          `)
          .eq("empresa_id", ctx.auth.empresa_id)
          .not("filial_id", "is", null) as any
      ),
    ]);
    if (ingQ.error) return NextResponse.json(errorResponse(ingQ.error.message), { status: 400 });
    if (gasQ.error) return NextResponse.json(errorResponse(gasQ.error.message), { status: 400 });

    const ingresos = (ingQ.data ?? []) as unknown as Row[];
    const gastos   = (gasQ.data ?? []) as unknown as Row[];

    const sumar = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.monto || 0), 0);
    const totalIngresos = sumar(ingresos);
    const totalGastos   = sumar(gastos);
    const balance = totalIngresos - totalGastos;

    // Agrupador generico
    const groupBy = (rows: Row[], keyFn: (r: Row) => { id: string; nombre: string } | null) => {
      const map = new Map<string, { id: string; nombre: string; total: number; count: number }>();
      for (const r of rows) {
        const k = keyFn(r);
        if (!k) continue;
        const acc = map.get(k.id) ?? { id: k.id, nombre: k.nombre, total: 0, count: 0 };
        acc.total += Number(r.monto || 0);
        acc.count += 1;
        map.set(k.id, acc);
      }
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    };

    return NextResponse.json(successResponse({
      periodo: { desde, hasta },
      totales: {
        ingresos: totalIngresos,
        gastos: totalGastos,
        balance: Math.round(balance),
        cant_ingresos: ingresos.length,
        cant_gastos: gastos.length,
      },
      ingresos_por_filial:    groupBy(ingresos, (r) => r.filial ? { id: r.filial.id, nombre: r.filial.nombre } : null),
      ingresos_por_sector:    groupBy(ingresos, (r) => r.filial?.sector ? { id: r.filial.sector.id, nombre: r.filial.sector.nombre } : (r.filial?.es_junta ? { id: "junta", nombre: "JUNTA" } : null)),
      ingresos_por_categoria: groupBy(ingresos, (r) => r.categoria),
      gastos_por_filial:      groupBy(gastos,   (r) => r.filial ? { id: r.filial.id, nombre: r.filial.nombre } : null),
      gastos_por_sector:      groupBy(gastos,   (r) => r.filial?.sector ? { id: r.filial.sector.id, nombre: r.filial.sector.nombre } : (r.filial?.es_junta ? { id: "junta", nombre: "JUNTA" } : null)),
      gastos_por_categoria:   groupBy(gastos,   (r) => r.categoria),
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
