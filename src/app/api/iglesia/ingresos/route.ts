import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { esTesoreroRol } from "@/lib/iglesia/roles-server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/iglesia/ingresos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&filial=<uuid>&categoria=<uuid>&sector=<uuid>
 * Devuelve la lista de ingresos con datos de filial/sector/categoria embebidos.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    // El rol Tesorero usa el endpoint dedicado /api/iglesia/aportes para consultar
    // historiales. Evita exponerle el listado general de ingresos.
    if (esTesoreroRol(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("No tenés permiso para consultar el reporte general."), { status: 403 });
    }
    const url = new URL(request.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const filial = url.searchParams.get("filial");
    const categoria = url.searchParams.get("categoria");
    const sector = url.searchParams.get("sector");
    const aportante = url.searchParams.get("aportante");
    const factura = url.searchParams.get("factura");
    const soloAportes = url.searchParams.get("solo_aportes") === "1";

    let q = ctx.supabase
      .from("ingresos")
      .select(`
        id, fecha, monto, descripcion, forma_pago, numero_factura, created_at,
        filial:filiales!inner(id, nombre, es_junta, aplica_15_porciento, sector:sectores(id, nombre)),
        categoria:categorias_ingreso(id, nombre),
        aportante:aportantes(id, nombre, cedula)
      `)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false });

    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    if (filial) q = q.eq("filial_id", filial);
    if (categoria) q = q.eq("categoria_id", categoria);
    if (sector) q = q.eq("filial.sector_id", sector);
    if (aportante) q = q.eq("aportante_id", aportante);
    if (factura) q = q.ilike("numero_factura", `%${factura}%`);
    if (soloAportes) q = q.not("aportante_id", "is", null);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/iglesia/ingresos — { filial_id, categoria_id, fecha, monto, descripcion? } */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const filial_id = typeof body.filial_id === "string" ? body.filial_id : "";
    const categoria_id = typeof body.categoria_id === "string" ? body.categoria_id : "";
    const monto = Number(body.monto);
    const fecha = typeof body.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.fecha)
      ? body.fecha.slice(0, 10)
      : null;
    const descripcion = body.descripcion != null ? String(body.descripcion).trim() : "";
    const formaPagoIn = typeof body.forma_pago === "string" ? body.forma_pago : "";
    const forma_pago = ["efectivo","transferencia","deposito","cheque"].includes(formaPagoIn) ? formaPagoIn : null;
    const aportante_id = typeof body.aportante_id === "string" && body.aportante_id ? body.aportante_id : null;
    const numero_factura = typeof body.numero_factura === "string" && body.numero_factura.trim() ? body.numero_factura.trim() : null;

    if (!filial_id) return NextResponse.json(errorResponse("Elegí una filial."), { status: 400 });
    if (!categoria_id) return NextResponse.json(errorResponse("Elegí una categoría."), { status: 400 });
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
    }
    if (!fecha) return NextResponse.json(errorResponse("Fecha inválida."), { status: 400 });

    // Cuando se registra un aporte, el aportante debe pertenecer a la filial elegida.
    // Los ingresos tradicionales sin aportante conservan el comportamiento anterior.
    if (aportante_id) {
      const { data: ap, error: apErr } = await ctx.supabase
        .from("aportantes")
        .select("id, filial_id, activo")
        .eq("id", aportante_id)
        .eq("empresa_id", ctx.auth.empresa_id)
        .maybeSingle();
      if (apErr) return NextResponse.json(errorResponse(apErr.message), { status: 400 });
      if (!ap || ap.activo === false) {
        return NextResponse.json(errorResponse("El aportante no existe o está inactivo."), { status: 400 });
      }
      if (ap.filial_id && ap.filial_id !== filial_id) {
        return NextResponse.json(errorResponse("El aportante no pertenece a la filial seleccionada."), { status: 400 });
      }

      const { data: cat, error: catErr } = await ctx.supabase
        .from("categorias_ingreso")
        .select("nombre")
        .eq("id", categoria_id)
        .eq("empresa_id", ctx.auth.empresa_id)
        .maybeSingle();
      if (catErr) return NextResponse.json(errorResponse(catErr.message), { status: 400 });
      const nombreTipo = String(cat?.nombre ?? "").trim().toUpperCase();
      if (!["DIEZMO", "OFRENDA", "VOTO", "VOTOS"].includes(nombreTipo)) {
        return NextResponse.json(errorResponse("El tipo de aporte debe ser Diezmo, Ofrenda o Voto."), { status: 400 });
      }
    }

    const { data, error } = await ctx.supabase
      .from("ingresos")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        filial_id,
        categoria_id,
        fecha,
        monto,
        descripcion: descripcion || null,
        forma_pago,
        aportante_id,
        numero_factura,
        usuario_id: ctx.auth.usuarioCatalogId ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
