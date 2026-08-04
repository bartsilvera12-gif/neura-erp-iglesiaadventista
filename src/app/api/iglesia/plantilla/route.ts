import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import * as XLSX from "xlsx";

/**
 * GET /api/iglesia/plantilla?tipo=ingresos|gastos
 * Devuelve un Excel con la hoja para carga + una hoja de referencia
 * (filiales, categorias, aportantes, formas de pago validas).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo") === "gastos" ? "gastos" : "ingresos";

    const [filQ, catIngQ, catGasQ, aportQ] = await Promise.all([
      ctx.supabase.from("filiales").select("nombre, es_junta, sectores(nombre)").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true).order("nombre"),
      ctx.supabase.from("categorias_ingreso").select("nombre").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true).order("orden"),
      ctx.supabase.from("categorias_gasto").select("nombre, aplica_a").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true).order("orden"),
      ctx.supabase.from("aportantes").select("nombre").eq("empresa_id", ctx.auth.empresa_id).eq("activo", true).order("nombre"),
    ]);

    const wb = XLSX.utils.book_new();

    // ==== HOJA 1: Datos ====
    const header = tipo === "ingresos"
      ? ["Fecha (dd-mm-yyyy)", "Filial", "Categoría", "Aportante (opcional)", "Teléfono aportante (opcional)", "Forma de pago (opcional)", "Monto (Gs)", "Descripción (opcional)"]
      : ["Fecha (dd-mm-yyyy)", "Filial", "Categoría", "Forma de pago (opcional)", "Monto (Gs)", "Descripción (opcional)"];

    const filialEjemplo = filQ.data?.find((f) => !f.es_junta)?.nombre ?? "Asunción";
    const catEjemplo = tipo === "ingresos"
      ? (catIngQ.data?.[0]?.nombre ?? "Diezmo")
      : (catGasQ.data?.find((c) => c.aplica_a !== "junta")?.nombre ?? "Agua");

    const ejemplo = tipo === "ingresos"
      ? ["04-08-2026", filialEjemplo, catEjemplo, "JUAN PEREZ", "0981123456", "efectivo", 50000, "Diezmo del sábado"]
      : ["04-08-2026", filialEjemplo, catEjemplo, "efectivo", 25000, "Factura ANDE agosto"];

    const dataAoa: (string | number)[][] = [header, ejemplo];
    // Filas vacias para que el usuario cargue
    for (let i = 0; i < 20; i++) dataAoa.push(new Array(header.length).fill(""));
    const ws = XLSX.utils.aoa_to_sheet(dataAoa);

    // Ajustar anchos (aproximado)
    ws["!cols"] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));

    XLSX.utils.book_append_sheet(wb, ws, "Datos");

    // ==== HOJA 2: Referencias ====
    const refAoa: (string | number)[][] = [];
    refAoa.push(["FILIALES"]);
    refAoa.push(["Sector", "Filial"]);
    (filQ.data ?? []).forEach((f) => {
      const sec = f.es_junta ? "JUNTA" : ((f.sectores as { nombre: string } | { nombre: string }[] | null)
        ? (Array.isArray(f.sectores) ? f.sectores[0]?.nombre : f.sectores?.nombre) ?? ""
        : "");
      refAoa.push([sec, f.nombre]);
    });
    refAoa.push([]);
    refAoa.push([tipo === "ingresos" ? "CATEGORÍAS DE INGRESO" : "CATEGORÍAS DE GASTO"]);
    if (tipo === "ingresos") {
      (catIngQ.data ?? []).forEach((c) => refAoa.push([c.nombre]));
    } else {
      refAoa.push(["Categoría", "Aplica a"]);
      (catGasQ.data ?? []).forEach((c) => refAoa.push([c.nombre, c.aplica_a]));
    }
    refAoa.push([]);
    refAoa.push(["FORMAS DE PAGO VÁLIDAS"]);
    refAoa.push(["efectivo"]);
    refAoa.push(["transferencia"]);
    refAoa.push(["deposito"]);
    refAoa.push(["cheque"]);
    if (tipo === "ingresos") {
      refAoa.push([]);
      refAoa.push(["APORTANTES YA CARGADOS (podés escribir cualquier nombre, si es nuevo se crea automático)"]);
      (aportQ.data ?? []).forEach((a) => refAoa.push([a.nombre]));
    }
    const wsRef = XLSX.utils.aoa_to_sheet(refAoa);
    wsRef["!cols"] = [{ wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsRef, "Referencia");

    // ==== HOJA 3: Instrucciones ====
    const insAoa: string[][] = [
      ["INSTRUCCIONES"],
      [""],
      ["1. Completá los datos en la hoja 'Datos'. Podés borrar la fila de ejemplo."],
      ["2. Fecha: usá formato dd-mm-yyyy (ej. 04-08-2026). También sirven yyyy-mm-dd o dd/mm/yyyy."],
      ["3. Filial y Categoría: escribí el nombre EXACTO como figura en la hoja 'Referencia'."],
      ["4. Categorías de JUNTA solo se pueden usar en la filial JUNTA."],
      tipo === "ingresos"
        ? ["5. Aportante y Teléfono son opcionales. Si escribís un nombre que no existe, se crea automático."]
        : ["5. Forma de pago es opcional. Si la dejás vacía, el gasto queda sin especificar."],
      ["6. Monto: solo números, sin puntos ni comas (ej. 1500000)."],
      ["7. Al subir el archivo, las filas con error se saltean y te mostramos el motivo."],
    ];
    const wsIns = XLSX.utils.aoa_to_sheet(insAoa);
    wsIns["!cols"] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsIns, "Instrucciones");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="plantilla_${tipo}.xlsx"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
