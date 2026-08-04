import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import * as XLSX from "xlsx";

type Movimiento = {
  id: string;
  fecha: string;
  monto: number;
  descripcion: string | null;
  filial: { id: string; nombre: string; es_junta: boolean; aplica_15_porciento: boolean;
            sector?: { id: string; nombre: string } | null } | null;
  categoria: { id: string; nombre: string } | null;
};

function fmtGs(n: number): string {
  return Math.round(n).toLocaleString("es-PY");
}

/** Reemplaza chars fuera de latin-1 (WinAnsi) por equivalentes ASCII. */
function ansiSafe(s: string): string {
  return String(s)
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^\x00-\xff]/g, "?"); // ultima red: cualquier otro no-latin1
}

/**
 * GET /api/iglesia/export?tipo=ingresos|gastos&formato=pdf|xlsx&desde=&hasta=&filial=&categoria=&sector=
 * Devuelve el archivo descargable con los mismos filtros que la lista.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo") === "gastos" ? "gastos" : "ingresos";
    const formato = url.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const filial = url.searchParams.get("filial");
    const categoria = url.searchParams.get("categoria");
    const sector = url.searchParams.get("sector");

    const tabla = tipo === "gastos" ? "gastos" : "ingresos";
    const catFk = tipo === "gastos" ? "categoria_gasto_id" : "categoria_id";
    const catTable = tipo === "gastos" ? "categorias_gasto" : "categorias_ingreso";

    let q = ctx.supabase
      .from(tabla)
      .select(`
        id, fecha, monto, descripcion,
        filial:filiales!inner(id, nombre, es_junta, aplica_15_porciento, sector:sectores(id, nombre)),
        categoria:${catTable}(id, nombre)
      `)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false });

    if (tipo === "gastos") q = q.not("filial_id", "is", null);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    if (filial) q = q.eq("filial_id", filial);
    if (categoria) q = q.eq(catFk, categoria);
    if (sector) q = q.eq("filial.sector_id", sector);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const rows = (data ?? []) as unknown as Movimiento[];
    const titulo = tipo === "gastos" ? "Reporte de Gastos" : "Reporte de Ingresos";
    const rangoTxt = `${desde || "inicio"} a ${hasta || "hoy"}`;
    const filenameBase = `${tipo}_${(desde || "todo")}_${(hasta || "todo")}`;

    if (formato === "xlsx") {
      const aoa: (string | number)[][] = [
        ["Fecha", "Sector", "Filial", "Categoría", "Descripción", "Monto (Gs)"],
        ...rows.map((r) => [
          r.fecha,
          r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : ""),
          r.filial?.nombre ?? "",
          r.categoria?.nombre ?? "",
          r.descripcion ?? "",
          Number(r.monto),
        ]),
      ];
      const total = rows.reduce((s, r) => s + Number(r.monto || 0), 0);
      aoa.push([]);
      aoa.push(["", "", "", "", "TOTAL", total]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tipo);
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        },
      });
    }

    // PDF
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]); // A4 portrait
    const margin = 36;
    let y = page.getHeight() - margin;

    const drawText = (t: string, x: number, yy: number, size = 9, f: PDFFont = font) => {
      page.drawText(ansiSafe(t), { x, y: yy, size, font: f, color: rgb(0, 0, 0) });
    };
    const newPageIfNeeded = () => {
      if (y < margin + 40) {
        page = pdf.addPage([595.28, 841.89]);
        y = page.getHeight() - margin;
      }
    };

    // Cabecera
    drawText("IGLESIA ADVENTISTA DE LA PROMESA", margin, y, 12, bold); y -= 16;
    drawText(titulo, margin, y, 14, bold); y -= 14;
    drawText(`Período: ${rangoTxt}`, margin, y, 9); y -= 10;
    drawText(`Generado: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, margin, y, 8); y -= 16;

    // Columnas
    const cols = [
      { label: "Fecha",     x: margin,     w: 60 },
      { label: "Sector",    x: margin+62,  w: 80 },
      { label: "Filial",    x: margin+144, w: 100 },
      { label: "Categoría", x: margin+246, w: 120 },
      { label: "Descrip.",  x: margin+368, w: 100 },
      { label: "Monto",     x: margin+468, w: 60, align: "right" as const },
    ];

    const drawHeader = () => {
      for (const c of cols) drawText(c.label, c.x, y, 9, bold);
      y -= 4;
      page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.5, color: rgb(0.5,0.5,0.5) });
      y -= 10;
    };
    drawHeader();

    let total = 0;
    for (const r of rows) {
      newPageIfNeeded();
      if (y > page.getHeight() - margin - 20) {
        // recien creamos pagina — repite header
        drawHeader();
      }
      const montoStr = fmtGs(Number(r.monto));
      const cells = [
        r.fecha,
        r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : ""),
        r.filial?.nombre ?? "",
        r.categoria?.nombre ?? "",
        r.descripcion ?? "",
        montoStr,
      ];
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i]!;
        const txt = String(cells[i] ?? "");
        const clipped = txt.length > 24 ? txt.slice(0, 23) + "..." : txt;
        if (c.align === "right") {
          const w = font.widthOfTextAtSize(clipped, 8);
          drawText(clipped, c.x + c.w - w, y, 8);
        } else {
          drawText(clipped, c.x, y, 8);
        }
      }
      total += Number(r.monto || 0);
      y -= 12;
    }

    // Totales
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.5, color: rgb(0.5,0.5,0.5) });
    y -= 12;
    drawText("TOTAL:", cols[4]!.x, y, 10, bold);
    const totalStr = fmtGs(total);
    const wTot = bold.widthOfTextAtSize(totalStr, 10);
    drawText(totalStr, cols[5]!.x + cols[5]!.w - wTot, y, 10, bold);

    const pdfBytes = await pdf.save();
    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
