/**
 * Storage helpers para relatorios de aportantes (documento físico por filial/mes).
 *
 * Bucket: `relatorios-aportantes` (privado).
 * Path:   `{empresa_id}/{uuid}.{ext}`
 *
 * Aislamiento por tenant: el primer segmento del path es `empresa_id` y los
 * endpoints validan el `empresa_id` del usuario antes de leer/escribir.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const RELATORIOS_BUCKET = "relatorios-aportantes";

export const ALLOWED_RELATORIO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_RELATORIO_BYTES = 15 * 1024 * 1024; // 15 MB (fotos de celular)

let bucketEnsured = false;

/** Crea el bucket privado si no existe. Idempotente. */
export async function ensureRelatoriosBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(RELATORIOS_BUCKET);
    if (existing) { bucketEnsured = true; return; }
  } catch {
    // fallthrough — intentar crear
  }
  const { error: createErr } = await supabase.storage.createBucket(RELATORIOS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_RELATORIO_BYTES,
    allowedMimeTypes: [...ALLOWED_RELATORIO_MIME],
  });
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(`No se pudo crear el bucket: ${createErr.message}`);
  }
  bucketEnsured = true;
}

/** Path nuevo para un relatorio de la empresa. `uuid` de crypto.randomUUID(). */
export function buildRelatorioPath(empresaId: string, uuid: string, mime: string): string {
  const ext = EXT_BY_MIME[mime] ?? "bin";
  return `${empresaId}/${uuid}.${ext}`;
}

/** URL firmada para visualizar/descargar el relatorio. Null si falla. */
export async function signRelatorio(
  supabase: AppSupabaseClient,
  storagePath: string | null | undefined,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(RELATORIOS_BUCKET)
      .createSignedUrl(storagePath, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Valida que el path pertenezca a la empresa (primer segmento). */
export function relatorioPathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  return path.split("/")[0] === empresaId;
}
