export const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const MESES_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function pad2(n: number): string { return String(n).padStart(2, "0"); }

/** Convierte mes (1-12) y anio a YYYY-MM-01 (primer dia del mes). */
export function mesAnioToFecha(mes: number | string, anio: number | string): string | null {
  const m = Number(mes);
  const y = Number(anio);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return null;
  return `${y}-${pad2(m)}-01`;
}

/** Extrae { mes, anio } de una fecha YYYY-MM-DD. */
export function fechaToMesAnio(fecha: string | null | undefined): { mes: number; anio: number } | null {
  if (!fecha || typeof fecha !== "string") return null;
  const m = fecha.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return { anio: Number(m[1]), mes: Number(m[2]) };
}

/** Label largo desde fecha YYYY-MM-DD → "Noviembre 2025". */
export function labelMesAnio(fecha: string | null | undefined): string {
  const p = fechaToMesAnio(fecha);
  if (!p) return "—";
  return `${MESES_LARGO[p.mes - 1]} ${p.anio}`;
}

/** Label corto → "Nov 2025". */
export function labelMesAnioCorto(fecha: string | null | undefined): string {
  const p = fechaToMesAnio(fecha);
  if (!p) return "—";
  return `${MESES_CORTO[p.mes - 1]} ${p.anio}`;
}

/** Rango de años usable en dropdowns (últimos 6). */
export function aniosDisponibles(): number[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
}
