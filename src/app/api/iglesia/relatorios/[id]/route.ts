import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { RELATORIOS_BUCKET, relatorioPathBelongsToEmpresa } from "@/lib/iglesia/relatorio-storage";

/** DELETE /api/iglesia/relatorios/:id — borra el registro y el archivo del storage. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await params;

    // Traer el path para borrar el archivo (validando empresa).
    const row = await ctx.supabase
      .from("relatorios_aportantes")
      .select("storage_path")
      .eq("id", id)
      .eq("empresa_id", ctx.auth.empresa_id)
      .maybeSingle();

    const { error } = await ctx.supabase
      .from("relatorios_aportantes")
      .delete()
      .eq("id", id)
      .eq("empresa_id", ctx.auth.empresa_id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const path = row.data?.storage_path as string | undefined;
    if (path && relatorioPathBelongsToEmpresa(path, ctx.auth.empresa_id)) {
      await ctx.supabase.storage.from(RELATORIOS_BUCKET).remove([path]).catch(() => {});
    }

    return NextResponse.json(successResponse({ deleted: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
