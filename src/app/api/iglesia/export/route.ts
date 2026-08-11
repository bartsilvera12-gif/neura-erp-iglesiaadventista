import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from "pdf-lib";
import ExcelJS from "exceljs";
import { labelFormaPago } from "@/lib/iglesia/formas-pago";
import { toStdNombre } from "@/lib/iglesia/normalize";

// ============================================================================
// Tipos y helpers
// ============================================================================

type Movimiento = {
  id: string;
  fecha: string;
  monto: number;
  descripcion: string | null;
  forma_pago: string | null;
  numero_factura: string | null;
  filial: {
    id: string; nombre: string; es_junta: boolean; aplica_15_porciento: boolean;
    sector?: { id: string; nombre: string } | null;
  } | null;
  categoria: { id: string; nombre: string } | null;
  aportante?: { id: string; nombre: string } | null;
};

const EMPRESA_NOMBRE = "IGLESIA ADVENTISTA DE LA PROMESA";
const COLOR_PRIMARY = "0B3A3D";
const COLOR_ACCENT = "4FAEB2";

function fmtGs(n: number): string {
  return Math.round(n).toLocaleString("es-PY");
}

function ansiSafe(s: string): string {
  return String(s)
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^\x00-\xff]/g, "?");
}

function slugify(s: string): string {
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function agrupar(rows: Movimiento[], keyFn: (r: Movimiento) => string | null): { key: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const acc = map.get(k) ?? { total: 0, count: 0 };
    acc.total += Number(r.monto || 0);
    acc.count += 1;
    map.set(k, acc);
  }
  return Array.from(map.entries()).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
}

// ============================================================================
// GET /api/iglesia/export
// ============================================================================
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

    const selectFields = tipo === "ingresos"
      ? `id, fecha, monto, descripcion, forma_pago, numero_factura,
         filial:filiales!inner(id, nombre, es_junta, aplica_15_porciento, sector:sectores(id, nombre)),
         categoria:${catTable}(id, nombre),
         aportante:aportantes(id, nombre)`
      : `id, fecha, monto, descripcion, forma_pago, numero_factura,
         filial:filiales!inner(id, nombre, es_junta, aplica_15_porciento, sector:sectores(id, nombre)),
         categoria:${catTable}(id, nombre)`;

    let q = ctx.supabase.from(tabla).select(selectFields).eq("empresa_id", ctx.auth.empresa_id).order("fecha", { ascending: false });
    if (tipo === "gastos") q = q.not("filial_id", "is", null);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    if (filial) q = q.eq("filial_id", filial);
    if (categoria) q = q.eq(catFk, categoria);
    if (sector) q = q.eq("filial.sector_id", sector);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const rows = (data ?? []) as unknown as Movimiento[];

    // Nombre archivo dinámico
    const [secQ, filQ, catQ] = await Promise.all([
      sector ? ctx.supabase.from("sectores").select("nombre").eq("id", sector).eq("empresa_id", ctx.auth.empresa_id).maybeSingle() : Promise.resolve({ data: null }),
      filial ? ctx.supabase.from("filiales").select("nombre").eq("id", filial).eq("empresa_id", ctx.auth.empresa_id).maybeSingle() : Promise.resolve({ data: null }),
      categoria ? ctx.supabase.from(catTable).select("nombre").eq("id", categoria).eq("empresa_id", ctx.auth.empresa_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const parts: string[] = ["reporte", tipo];
    if (secQ.data?.nombre) parts.push(slugify(secQ.data.nombre));
    if (filQ.data?.nombre) parts.push(slugify(filQ.data.nombre));
    if (catQ.data?.nombre) parts.push(slugify(catQ.data.nombre));
    if (desde || hasta) parts.push(`${desde || "todo"}_a_${hasta || "hoy"}`);
    const filenameBase = parts.filter(Boolean).join("_");

    const filtroTexto = {
      sector: secQ.data?.nombre ? toStdNombre(secQ.data.nombre) : null,
      filial: filQ.data?.nombre ? toStdNombre(filQ.data.nombre) : null,
      categoria: catQ.data?.nombre ? toStdNombre(catQ.data.nombre) : null,
      desde, hasta,
    };

    if (formato === "xlsx") {
      const buf = await buildExcel(tipo, rows, filtroTexto);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        },
      });
    }

    const pdfBytes = await buildPdf(tipo, rows, filtroTexto);
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

// ============================================================================
// EXCEL — con estilos, hoja de resumen, filtro automatico
// ============================================================================
async function buildExcel(tipo: "ingresos" | "gastos", rows: Movimiento[], f: { sector: string | null; filial: string | null; categoria: string | null; desde: string | null; hasta: string | null }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = EMPRESA_NOMBRE;
  wb.created = new Date();

  const titulo = tipo === "gastos" ? "REPORTE DE GASTOS" : "REPORTE DE INGRESOS";
  const accent = tipo === "gastos" ? "B91C1C" : "047857"; // rose-800 / emerald-800

  // ================== HOJA 1: DATOS ==================
  const ws = wb.addWorksheet("Datos", { views: [{ state: "frozen", ySplit: 6 }] });

  // Cabecera (filas 1-4)
  ws.mergeCells("A1", tipo === "ingresos" ? "H1" : "G1");
  ws.getCell("A1").value = EMPRESA_NOMBRE;
  ws.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF" + COLOR_PRIMARY } };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;

  ws.mergeCells("A2", tipo === "ingresos" ? "H2" : "G2");
  ws.getCell("A2").value = titulo;
  ws.getCell("A2").font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF" + accent } };
  ws.getCell("A2").alignment = { horizontal: "center" };

  ws.mergeCells("A3", tipo === "ingresos" ? "H3" : "G3");
  const rangoTxt = `Período: ${f.desde || "inicio"} al ${f.hasta || "hoy"}`;
  const filtros: string[] = [];
  if (f.sector) filtros.push(`Sector: ${f.sector}`);
  if (f.filial) filtros.push(`Filial: ${f.filial}`);
  if (f.categoria) filtros.push(`Categoría: ${f.categoria}`);
  ws.getCell("A3").value = filtros.length ? `${rangoTxt}  |  ${filtros.join("  |  ")}` : rangoTxt;
  ws.getCell("A3").font = { size: 9, color: { argb: "FF64748B" } };
  ws.getCell("A3").alignment = { horizontal: "center" };

  ws.mergeCells("A4", tipo === "ingresos" ? "H4" : "G4");
  ws.getCell("A4").value = `Generado: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  ws.getCell("A4").font = { size: 8, color: { argb: "FF94A3B8" }, italic: true };
  ws.getCell("A4").alignment = { horizontal: "center" };

  // Header de tabla (fila 6)
  const header = tipo === "ingresos"
    ? ["Fecha", "Sector", "Filial", "Categoría", "Aportante", "Forma pago", "N° Factura", "Monto (Gs)"]
    : ["Fecha", "Sector", "Filial", "Categoría", "Forma pago", "N° Factura", "Monto (Gs)"];
  ws.columns = header.map((_h, i) => ({ width: i === header.length - 1 ? 15 : 20 }));

  const headerRow = ws.getRow(6);
  header.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + COLOR_PRIMARY } };
    cell.alignment = { horizontal: i === header.length - 1 ? "right" : "left", vertical: "middle" };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  headerRow.height = 22;

  // Filas de datos (desde 7)
  rows.forEach((r, idx) => {
    const row = ws.getRow(7 + idx);
    const cells = tipo === "ingresos"
      ? [
          r.fecha,
          toStdNombre(r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : "")),
          toStdNombre(r.filial?.nombre ?? ""),
          toStdNombre(r.categoria?.nombre ?? ""),
          toStdNombre(r.aportante?.nombre ?? ""),
          labelFormaPago(r.forma_pago),
          r.numero_factura ?? "",
          Number(r.monto),
        ]
      : [
          r.fecha,
          toStdNombre(r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : "")),
          toStdNombre(r.filial?.nombre ?? ""),
          toStdNombre(r.categoria?.nombre ?? ""),
          labelFormaPago(r.forma_pago),
          r.numero_factura ?? "",
          Number(r.monto),
        ];
    cells.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", horizontal: i === cells.length - 1 ? "right" : "left" };
      if (i === cells.length - 1) cell.numFmt = '#,##0" Gs"';
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });
  });

  // Fila TOTAL
  const totalGeneral = rows.reduce((s, r) => s + Number(r.monto || 0), 0);
  const totalRowIdx = 7 + rows.length;
  const totalRow = ws.getRow(totalRowIdx);
  const totalLabelCol = header.length - 1;
  totalRow.getCell(totalLabelCol).value = "TOTAL";
  totalRow.getCell(totalLabelCol).alignment = { horizontal: "right" };
  totalRow.getCell(totalLabelCol).font = { bold: true, size: 11 };
  totalRow.getCell(header.length).value = totalGeneral;
  totalRow.getCell(header.length).numFmt = '#,##0" Gs"';
  totalRow.getCell(header.length).font = { bold: true, size: 11, color: { argb: "FF" + accent } };
  totalRow.getCell(header.length).alignment = { horizontal: "right" };
  totalRow.eachCell((c) => { c.border = { top: { style: "medium", color: { argb: "FF" + COLOR_PRIMARY } } }; });

  // Autofilter sobre la tabla
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + rows.length, column: header.length } };

  // ================== HOJA 2: RESUMEN ==================
  const wsSum = wb.addWorksheet("Resumen");
  wsSum.columns = [{ width: 35 }, { width: 15 }, { width: 15 }];

  let cursor = 1;
  const putSection = (titulo: string, headers: string[], data: { key: string; total: number; count: number }[]) => {
    // Titulo de seccion
    wsSum.mergeCells(cursor, 1, cursor, 3);
    const t = wsSum.getCell(cursor, 1);
    t.value = titulo;
    t.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + COLOR_PRIMARY } };
    t.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    wsSum.getRow(cursor).height = 20;
    cursor++;

    // Headers
    headers.forEach((h, i) => {
      const c = wsSum.getCell(cursor, i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + accent } };
      c.alignment = { horizontal: i === 0 ? "left" : "right" };
    });
    cursor++;

    // Data
    const total = data.reduce((s, d) => s + d.total, 0);
    data.forEach((d, idx) => {
      const r = wsSum.getRow(cursor);
      r.getCell(1).value = toStdNombre(d.key);
      r.getCell(2).value = d.total;
      r.getCell(2).numFmt = '#,##0" Gs"';
      r.getCell(2).alignment = { horizontal: "right" };
      r.getCell(3).value = total > 0 ? d.total / total : 0;
      r.getCell(3).numFmt = "0.0%";
      r.getCell(3).alignment = { horizontal: "right" };
      if (idx % 2 === 1) r.eachCell((c) => c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } });
      cursor++;
    });

    // Total de seccion
    const rt = wsSum.getRow(cursor);
    rt.getCell(1).value = "Total";
    rt.getCell(1).font = { bold: true };
    rt.getCell(2).value = total;
    rt.getCell(2).numFmt = '#,##0" Gs"';
    rt.getCell(2).font = { bold: true, color: { argb: "FF" + accent } };
    rt.getCell(2).alignment = { horizontal: "right" };
    rt.eachCell((c) => c.border = { top: { style: "thin" } });
    cursor += 2;
  };

  putSection("TOTAL POR CATEGORIA", ["Categoría", "Monto", "%"], agrupar(rows, (r) => r.categoria?.nombre ?? null));
  putSection("TOTAL POR FILIAL", ["Filial", "Monto", "%"], agrupar(rows, (r) => r.filial?.nombre ?? null));
  putSection("TOTAL POR SECTOR", ["Sector", "Monto", "%"], agrupar(rows, (r) => r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : null)));
  putSection("TOTAL POR FORMA DE PAGO", ["Forma de pago", "Monto", "%"], agrupar(rows, (r) => r.forma_pago ? labelFormaPago(r.forma_pago) : "Sin especificar"));

  return await wb.xlsx.writeBuffer() as Buffer;
}

// ============================================================================
// PDF PROFESIONAL — con logo, header, resumen y firma
// ============================================================================
async function buildPdf(tipo: "ingresos" | "gastos", rows: Movimiento[], f: { sector: string | null; filial: string | null; categoria: string | null; desde: string | null; hasta: string | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const margin = 36;
  const PRIMARY = rgb(11 / 255, 58 / 255, 61 / 255);
  const ACCENT = rgb(79 / 255, 174 / 255, 178 / 255);
  const GRAY = rgb(0.4, 0.4, 0.4);
  const LIGHT = rgb(0.94, 0.97, 0.97);
  const accentColor = tipo === "gastos" ? rgb(185/255, 28/255, 28/255) : rgb(4/255, 120/255, 87/255);

  const titulo = tipo === "gastos" ? "REPORTE DE GASTOS" : "REPORTE DE INGRESOS";

  // Cargar logo (Zentra)
  let logoImg: any = null;
  try {
    const candidatos = [
      path.join(process.cwd(), "public", "brand", "zentra-logo-official.png"),
      path.join(process.cwd(), "public", "brand", "zentralogo.png"),
    ];
    for (const p of candidatos) {
      if (fs.existsSync(p)) {
        logoImg = await pdf.embedPng(new Uint8Array(fs.readFileSync(p)));
        break;
      }
    }
  } catch { /* sin logo */ }

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - margin;

  const draw = (t: string, x: number, yy: number, size = 9, f: PDFFont = font, color: RGB = rgb(0,0,0)) => {
    page.drawText(ansiSafe(t), { x, y: yy, size, font: f, color });
  };
  const drawRight = (t: string, rightX: number, yy: number, size: number, f: PDFFont, color: RGB = rgb(0,0,0)) => {
    const w = f.widthOfTextAtSize(ansiSafe(t), size);
    draw(t, rightX - w, yy, size, f, color);
  };
  const newPageIfNeeded = (needed = 40) => {
    if (y < margin + needed) {
      drawFooter();
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - margin;
    }
  };
  const drawFooter = () => {
    const pageCount = pdf.getPageCount();
    page.drawText(ansiSafe(`${EMPRESA_NOMBRE} — Pag. ${pageCount}`), {
      x: margin, y: 20, size: 7, font, color: GRAY,
    });
    const gen = `Generado ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    const w = font.widthOfTextAtSize(gen, 7);
    page.drawText(gen, { x: PAGE_W - margin - w, y: 20, size: 7, font, color: GRAY });
  };

  // ==== HEADER ====
  const headerH = 60;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: PRIMARY });
  // Logo
  if (logoImg) {
    const logoScale = 44 / logoImg.height;
    page.drawImage(logoImg, { x: margin, y: PAGE_H - headerH + 8, width: logoImg.width * logoScale, height: 44 });
  }
  // Textos
  page.drawText(EMPRESA_NOMBRE, { x: margin + 60, y: PAGE_H - 25, size: 13, font: bold, color: rgb(1,1,1) });
  page.drawText(titulo, { x: margin + 60, y: PAGE_H - 42, size: 10, font, color: rgb(0.85, 0.95, 0.95) });
  const genTxt = `${new Date().toISOString().slice(0, 10)}`;
  drawRight(genTxt, PAGE_W - margin, PAGE_H - 25, 9, font, rgb(0.85, 0.95, 0.95));

  y = PAGE_H - headerH - 20;

  // ==== FILTROS Y RANGO ====
  const rangoTxt = `Periodo: ${f.desde || "inicio"} al ${f.hasta || "hoy"}`;
  draw(rangoTxt, margin, y, 10, bold, PRIMARY);
  y -= 12;
  const chips: string[] = [];
  if (f.sector) chips.push(`Sector: ${f.sector}`);
  if (f.filial) chips.push(`Filial: ${f.filial}`);
  if (f.categoria) chips.push(`Categoria: ${f.categoria}`);
  if (chips.length) {
    draw(chips.join("   |   "), margin, y, 8, font, GRAY);
    y -= 12;
  }
  y -= 6;

  // ==== TABLA DE DATOS ====
  const cols = tipo === "ingresos"
    ? [
        { label: "Fecha", x: margin, w: 50 },
        { label: "Sector", x: margin + 52, w: 62 },
        { label: "Filial", x: margin + 116, w: 74 },
        { label: "Categoria", x: margin + 192, w: 80 },
        { label: "Aportante", x: margin + 274, w: 80 },
        { label: "F. pago", x: margin + 356, w: 42 },
        { label: "Factura", x: margin + 400, w: 55 },
        { label: "Monto", x: margin + 457, w: 66, align: "right" as const },
      ]
    : [
        { label: "Fecha", x: margin, w: 55 },
        { label: "Sector", x: margin + 57, w: 75 },
        { label: "Filial", x: margin + 134, w: 90 },
        { label: "Categoria", x: margin + 226, w: 100 },
        { label: "F. pago", x: margin + 328, w: 50 },
        { label: "Factura", x: margin + 380, w: 75 },
        { label: "Monto", x: margin + 457, w: 66, align: "right" as const },
      ];
  const rowFontSize = tipo === "ingresos" ? 6.5 : 8;
  const truncMax = tipo === "ingresos" ? 16 : 22;

  const drawTableHeader = () => {
    page.drawRectangle({ x: margin - 2, y: y - 4, width: PAGE_W - 2 * margin + 4, height: 15, color: PRIMARY });
    for (const c of cols) {
      if (c.align === "right") {
        drawRight(c.label, c.x + c.w, y + 2, 8, bold, rgb(1, 1, 1));
      } else {
        draw(c.label, c.x, y + 2, 8, bold, rgb(1, 1, 1));
      }
    }
    y -= 15;
  };
  drawTableHeader();

  let total = 0;
  const rowH = tipo === "ingresos" ? 11 : 13;
  rows.forEach((r, idx) => {
    if (y < margin + 100) { drawFooter(); page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - margin - 10; drawTableHeader(); }
    if (idx % 2 === 1) {
      page.drawRectangle({ x: margin - 2, y: y - rowH + 2, width: PAGE_W - 2 * margin + 4, height: rowH, color: LIGHT });
    }
    const cells = tipo === "ingresos"
      ? [
          r.fecha,
          toStdNombre(r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : "")),
          toStdNombre(r.filial?.nombre ?? ""),
          toStdNombre(r.categoria?.nombre ?? ""),
          toStdNombre(r.aportante?.nombre ?? ""),
          labelFormaPago(r.forma_pago),
          r.numero_factura ?? "",
          fmtGs(Number(r.monto)),
        ]
      : [
          r.fecha,
          toStdNombre(r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : "")),
          toStdNombre(r.filial?.nombre ?? ""),
          toStdNombre(r.categoria?.nombre ?? ""),
          labelFormaPago(r.forma_pago),
          r.numero_factura ?? "",
          fmtGs(Number(r.monto)),
        ];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]!;
      const txt = String(cells[i] ?? "");
      const clipped = txt.length > truncMax ? txt.slice(0, truncMax - 1) + "..." : txt;
      if (c.align === "right") drawRight(clipped, c.x + c.w, y - rowH + 5, rowFontSize, font);
      else draw(clipped, c.x, y - rowH + 5, rowFontSize, font);
    }
    total += Number(r.monto || 0);
    y -= rowH;
  });

  // Total general
  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: PAGE_W - margin, y }, thickness: 1.2, color: PRIMARY });
  y -= 14;
  draw("TOTAL GENERAL", cols[cols.length - 2]!.x - 40, y, 10, bold, PRIMARY);
  drawRight(fmtGs(total), PAGE_W - margin, y, 11, bold, accentColor);
  y -= 20;

  // ==== SECCION RESUMEN ====
  const drawSummaryTable = (titulo: string, data: { key: string; total: number; count: number }[]) => {
    if (data.length === 0) return;
    newPageIfNeeded(60 + Math.min(data.length, 12) * 12);
    // Titulo de seccion
    page.drawRectangle({ x: margin, y: y - 14, width: PAGE_W - 2 * margin, height: 18, color: ACCENT });
    draw(titulo, margin + 6, y - 10, 10, bold, rgb(1, 1, 1));
    y -= 22;

    const totalSec = data.reduce((s, d) => s + d.total, 0);
    // Layout de columnas (posiciones fijas, sin superponerse):
    //   Label:  margin+4 .. margin+170
    //   Bar:    margin+178 .. margin+178+140 = margin+318
    //   %:      right-alineado en margin+370
    //   Monto:  right-alineado en PAGE_W-margin-4
    const barX = margin + 178;
    const barMax = 140;
    const pctRightX = margin + 370;
    const montoRightX = PAGE_W - margin - 4;
    data.slice(0, 15).forEach((d, idx) => {
      newPageIfNeeded(20);
      if (idx % 2 === 1) {
        page.drawRectangle({ x: margin, y: y - 3, width: PAGE_W - 2 * margin, height: 12, color: LIGHT });
      }
      const label = toStdNombre(d.key);
      const labelClipped = label.length > 26 ? label.slice(0, 25) + "..." : label;
      draw(labelClipped, margin + 4, y, 8, font);

      // Barra proporcional
      const pct = totalSec > 0 ? d.total / totalSec : 0;
      const barW = Math.max(1, pct * barMax);
      page.drawRectangle({ x: barX, y: y - 1, width: barMax, height: 6, color: rgb(0.92, 0.92, 0.92) });
      page.drawRectangle({ x: barX, y: y - 1, width: barW, height: 6, color: ACCENT });

      drawRight(`${(pct * 100).toFixed(1)}%`, pctRightX, y, 8, font, GRAY);
      drawRight(fmtGs(d.total), montoRightX, y, 8, bold, accentColor);
      y -= 12;
    });
    if (data.length > 15) {
      draw(`... y ${data.length - 15} mas`, margin + 4, y, 7, font, GRAY);
      y -= 10;
    }
    y -= 8;
  };

  drawSummaryTable("TOTAL POR CATEGORIA", agrupar(rows, (r) => r.categoria?.nombre ?? null));
  drawSummaryTable("TOTAL POR FILIAL", agrupar(rows, (r) => r.filial?.nombre ?? null));
  drawSummaryTable("TOTAL POR SECTOR", agrupar(rows, (r) => r.filial?.sector?.nombre ?? (r.filial?.es_junta ? "JUNTA" : null)));
  drawSummaryTable("TOTAL POR FORMA DE PAGO", agrupar(rows, (r) => r.forma_pago ? labelFormaPago(r.forma_pago) : "Sin especificar"));

  // ==== FIRMA ====
  newPageIfNeeded(80);
  y -= 30;
  page.drawLine({ start: { x: margin + 60, y }, end: { x: margin + 230, y }, thickness: 0.5, color: PRIMARY });
  page.drawLine({ start: { x: PAGE_W - margin - 230, y }, end: { x: PAGE_W - margin - 60, y }, thickness: 0.5, color: PRIMARY });
  y -= 12;
  draw("Firma responsable", margin + 110, y, 8, font, GRAY);
  draw("Firma tesoreria", PAGE_W - margin - 175, y, 8, font, GRAY);

  drawFooter();
  return await pdf.save();
}
