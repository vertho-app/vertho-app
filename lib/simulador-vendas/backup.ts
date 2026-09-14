import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { TenantDb } from '@/lib/tenant-db';

// Decisão do produto: histórico 6 meses; recuperação operacional 7 dias.
export const BACKUP_DIAS = 7;
export const PREFIXOS_BACKUP_PACE = ['pace-retencao', 'pace-exclusao'] as const;
const checksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function exigirBucketPrivado(storage: TenantDb['storage']) {
  const bucket = await storage.getBucket('backups');
  if (bucket.error || !bucket.data || bucket.data.public)
    throw new Error('PACE: bucket de backup privado indisponível');
}

/** O chamador verifica o bucket privado antes do lote; nenhum upload sob lock SQL. */
export async function gravarBackupConferido(
  storage: TenantDb['storage'],
  prefixo: (typeof PREFIXOS_BACKUP_PACE)[number],
  documento: Record<string, unknown>,
) {
  const bytes = gzipSync(Buffer.from(JSON.stringify({ salvoEm: new Date().toISOString(), ...documento })));
  const caminho = `${prefixo}/${new Date().toISOString().slice(0, 10)}_${randomUUID()}.json.gz`;
  const bucket = storage.from('backups');
  const upload = await bucket.upload(caminho, bytes, { contentType: 'application/gzip', upsert: false });
  if (upload.error) throw new Error('PACE: backup falhou; nenhuma exclusão autorizada');
  const download = await bucket.download(caminho);
  const sha256 = checksum(bytes);
  if (download.error || !download.data || checksum(new Uint8Array(await download.data.arrayBuffer())) !== sha256)
    throw new Error('PACE: backup não conferido; nenhuma exclusão autorizada');
  return { caminho, sha256 };
}

/** Só usar quando o banco confirmou que NÃO excluiu. Timeout é ambíguo: preservar. */
export async function removerBackupRecusado(storage: TenantDb['storage'], caminho: string) {
  const removido = await storage.from('backups').remove([caminho]);
  if (removido.error) throw new Error('PACE: exclusão recusada; limpeza do backup pendente');
}
