import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  fecha: string;
  monto: number;
  numero_factura: string | null;
  categoria: { id: string; nombre: string } | null;
  filial: { id: string; nombre: string } | null;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const aportante = url.searchParams.get("aportante");
    const anioRaw = Number(url.searchParams.get("anio"));
    const anio = Number.isFinite(anioRaw) && anioRaw > 2000 ? anioRaw : new Date().getFullYear();
    if (!aportante) return NextResponse.json(errorResponse("Falta el aportante."), { status: 400 });

    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;

    const { data, error } = await ctx.supabase
      .from("ingresos")
      .select(`
        id, fecha, monto, numero_factura,
        categoria:categorias_ingreso(id, nombre),
        filial:filiales(id, nombre)
      `)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("aportante_id", aportante)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const rows = (data ?? []) as unknown as Row[];
    const porMes = Array.from({ length: 12 }, () => 0);
    const porTipo = new Map<string, number>();
    let totalAnual = 0;
    for (const r of rows) {
      const m = Number((r.fecha ?? "").slice(5, 7));
      const monto = Number(r.monto || 0);
      if (m >= 1 && m <= 12) porMes[m - 1] += monto;
      totalAnual += monto;
      const tipo = r.categoria?.nombre ?? "Sin tipo";
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + monto);
    }

    return NextResponse.json(successResponse({
      anio,
      rows,
      totales: {
        porMes,
        anual: totalAnual,
        porTipo: Array.from(porTipo.entries()).map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total),
      },
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
