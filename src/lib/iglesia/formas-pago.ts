export const FORMAS_PAGO = [
  { value: "efectivo",      label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "deposito",      label: "Depósito" },
  { value: "cheque",        label: "Cheque" },
] as const;

export type FormaPago = typeof FORMAS_PAGO[number]["value"];

export function labelFormaPago(v: string | null | undefined): string {
  if (!v) return "";
  const f = FORMAS_PAGO.find((x) => x.value === v);
  return f?.label ?? v;
}
