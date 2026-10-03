import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

/** GET /api/iglesia/aportantes/plantilla — descarga un Excel modelo para la nómina. */
export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aportantes");

  ws.columns = [
    { header: "Nombre", key: "nombre", width: 38 },
    { header: "Cédula", key: "cedula", width: 18 },
    { header: "Filial", key: "filial", width: 28 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A3D" } };
    cell.alignment = { vertical: "middle" };
  });
  ws.getRow(1).height = 20;

  ws.addRow({ nombre: "Pérez, Juan", cedula: "1.234.567", filial: "Asunción" });
  ws.addRow({ nombre: "González, María", cedula: "7.654.321", filial: "Aregua" });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla_aportantes.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
