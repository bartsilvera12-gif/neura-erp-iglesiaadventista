export function esTesoreroRol(rol: string | null | undefined): boolean {
  return (rol ?? "").trim().toLowerCase() === "tesorero";
}
