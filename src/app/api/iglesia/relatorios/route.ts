import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_RELATORIO_MIME,
  MAX_RELATORIO_BYTES,
  RELATORIOS_BUCKET,
  buildRelatorioPath,
  ensureRelatoriosBucket,
  signRelatorio,
} from "@/lib/iglesia/relatorio-storage";

export const dynamic = "force-dynamic";

type RelatorioRow = {
  id: string;
  filial_id: string;
  mes: number;
  anio: number;
  storage_path: string;
  archivo_nombre: string | null;
  mime_type: string | null;
  observacion: string | null;
  created_at: string;
  filial: { id: string; nombre: string; es_junta: boolean; sector: { id: string; nombre: string } | null } | null;
};

/**
 * GET /api/iglesia/relatorios?filial=&mes=&anio=
 * Lista los relatorios de aportantes (con URL firmada para ver/descargar).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const filial = url.searchParams.get("filial");
    const mes = Number(url.searchParams.get("mes"));
    const anio = Number(url.searchParams.get("anio"));

    let q = ctx.supabase
      .from("relatorios_aportantes")
      .select(`
        id, filial_id, mes, anio, storage_path, archivo_nombre, mime_type, observacion, created_at,
        filial:filiales!inner(id, nombre, es_junta, sector:sectores(id, nombre))
      `)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false })
      .order("created_at", { ascending: false });
    if (filial) q = q.eq("filial_id", filial);
    if (Number.isFinite(mes) && mes >= 1 && mes <= 12) q = q.eq("mes", mes);
    if (Number.isFinite(anio) && anio > 2000) q = q.eq("anio", anio);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const rows = (data ?? []) as unknown as RelatorioRow[];
    const conUrl = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        filial: r.filial,
        mes: r.mes,
        anio: r.anio,
        archivo_nombre: r.archivo_nombre,
        mime_type: r.mime_type,
        observacion: r.observacion,
        created_at: r.created_at,
        url: await signRelatorio(ctx.supabase, r.storage_path, 3600),
      }))
    );
    return NextResponse.json(successResponse(conUrl));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST /api/iglesia/relatorios (multipart/form-data)
 * Campos: file, filial_id, mes, anio, observacion(opcional).
 * Sube el archivo al bucket y registra la fila.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const form = await request.formData();
    const file = form.get("file");
    const filialId = String(form.get("filial_id") ?? "");
    const mes = Number(form.get("mes"));
    const anio = Number(form.get("anio"));
    const observacion = String(form.get("observacion") ?? "").trim();

    if (!filialId) return NextResponse.json(errorResponse("Elegí una filial."), { status: 400 });
    if (!Number.isFinite(mes) || mes < 1 || mes > 12) return NextResponse.json(errorResponse("Mes inválido."), { status: 400 });
    if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) return NextResponse.json(errorResponse("Año inválido."), { status: 400 });
    if (!(file instanceof File)) return NextResponse.json(errorResponse("Falta el archivo."), { status: 400 });
    if (!ALLOWED_RELATORIO_MIME.has(file.type)) {
      return NextResponse.json(errorResponse("Formato no permitido. Usá JPG, PNG, WebP o PDF."), { status: 400 });
    }
    if (file.size > MAX_RELATORIO_BYTES) {
      const mb = (MAX_RELATORIO_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(errorResponse(`Archivo demasiado grande (máx. ${mb} MB).`), { status: 413 });
    }

    // Validar que la filial pertenezca a la empresa
    const filQ = await supabase.from("filiales").select("id").eq("id", filialId).eq("empresa_id", empresaId).maybeSingle();
    if (!filQ.data) return NextResponse.json(errorResponse("Filial no encontrada."), { status: 400 });

    try {
      await ensureRelatoriosBucket(supabase);
    } catch (bucketErr) {
      console.error("[iglesia/relatorios] ensureBucket", bucketErr instanceof Error ? bucketErr.message : bucketErr);
    }

    const path = buildRelatorioPath(empresaId, randomUUID(), file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage.from(RELATORIOS_BUCKET).upload(path, buf, { contentType: file.type, upsert: false });
    if (up.error) {
      console.error("[iglesia/relatorios] upload", up.error.message);
      return NextResponse.json(errorResponse(`No se pudo subir el archivo: ${up.error.message}`), { status: 500 });
    }

    const ins = await supabase
      .from("relatorios_aportantes")
      .insert({
        empresa_id: empresaId,
        filial_id: filialId,
        mes, anio,
        storage_path: path,
        archivo_nombre: (file.name || "relatorio").slice(0, 200),
        mime_type: file.type,
        observacion: observacion || null,
      })
      .select("id")
      .single();
    if (ins.error) {
      // rollback del archivo si falló el insert
      await supabase.storage.from(RELATORIOS_BUCKET).remove([path]).catch(() => {});
      return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    }

    return NextResponse.json(successResponse({ id: ins.data.id }));
  } catch (err) {
    console.error("[iglesia/relatorios] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir el relatorio."), { status: 500 });
  }
}
