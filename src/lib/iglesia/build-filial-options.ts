import type { FancySelectOption } from "@/components/ui/FancySelect";

export type FilialLite = {
  id: string;
  nombre: string;
  es_junta: boolean;
  sector_id: string | null;
  sectores: { id: string; nombre: string; orden?: number } | null;
};

/**
 * Arma el listado de opciones agrupado por sector con headers deshabilitados,
 * al estilo `<optgroup>`. Los headers tienen value único (__hdr_...) para no
 * colisionar con la selección real.
 */
export function buildFilialOptions(filiales: FilialLite[]): FancySelectOption[] {
  const bySector = new Map<
    string,
    { nombre: string; orden: number; filiales: FilialLite[] }
  >();
  const junta: FilialLite[] = [];

  for (const f of filiales) {
    if (f.es_junta) {
      junta.push(f);
      continue;
    }
    const sid = f.sectores?.id ?? "sin-sector";
    const sname = f.sectores?.nombre ?? "Sin sector";
    const sorden = f.sectores?.orden ?? 999;
    if (!bySector.has(sid)) {
      bySector.set(sid, { nombre: sname, orden: sorden, filiales: [] });
    }
    bySector.get(sid)!.filiales.push(f);
  }

  const sortedSectors = Array.from(bySector.entries()).sort(
    (a, b) => a[1].orden - b[1].orden || a[1].nombre.localeCompare(b[1].nombre)
  );

  const opts: FancySelectOption[] = [];
  for (const [sid, s] of sortedSectors) {
    opts.push({
      value: `__hdr_${sid}`,
      label: s.nombre.toUpperCase(),
      disabled: true,
    });
    for (const f of s.filiales
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre))) {
      opts.push({ value: f.id, label: f.nombre });
    }
  }

  if (junta.length > 0) {
    opts.push({ value: "__hdr_junta", label: "JUNTA", disabled: true });
    for (const f of junta) opts.push({ value: f.id, label: f.nombre });
  }

  return opts;
}
