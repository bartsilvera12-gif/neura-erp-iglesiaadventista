/** Devuelve el string en MAYUSCULAS y sin acentos (para nombres estandarizados). */
export function toStdNombre(s: string): string {
  return String(s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos combinantes
    .toUpperCase();
}

/** Version lower-case sin acentos, para matcheo case-insensitive (imports). */
export function toStdKey(s: unknown): string {
  return String(s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
