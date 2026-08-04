/**
 * Parser tolerante de fechas para importaciones desde Excel/CSV.
 * Acepta varios formatos y devuelve siempre YYYY-MM-DD (ISO) o null.
 */
export function parseFecha(input: unknown): string | null {
  if (input == null || input === "") return null;

  // Numero serial de Excel (dias desde 1900-01-01)
  if (typeof input === "number" && Number.isFinite(input)) {
    // Excel epoch tiene un bug del 1900 leap year, la libreria xlsx ya lo maneja
    // pero por si acaso: dias desde 1899-12-30
    const ms = Math.round((input - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // Objeto Date serializado tipo "Sat Aug 30 2025..."
  const asDate = new Date(raw);
  if (!isNaN(asDate.getTime()) && raw.length > 10) return asDate.toISOString().slice(0, 10);

  // Solo digitos: yyyymmdd o ddmmyyyy
  if (/^\d{8}$/.test(raw)) {
    const yyyy = Number(raw.slice(0, 4));
    if (yyyy >= 1900 && yyyy <= 2100) {
      // yyyymmdd
      return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
    }
    // ddmmyyyy
    return `${raw.slice(4,8)}-${raw.slice(2,4)}-${raw.slice(0,2)}`;
  }

  // Con separadores: -, /, .
  const parts = raw.split(/[-/.\s]/).filter(Boolean);
  if (parts.length === 3) {
    let d: string, m: string, y: string;
    if (parts[0].length === 4) {
      // yyyy-mm-dd
      [y, m, d] = parts;
    } else if (parts[2].length === 4) {
      // dd-mm-yyyy (default sudamericano)
      [d, m, y] = parts;
    } else {
      return null;
    }
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    const yy = y.padStart(4, "0");
    const iso = `${yy}-${mm}-${dd}`;
    // Validacion basica
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return null;
    return iso;
  }

  return null;
}
