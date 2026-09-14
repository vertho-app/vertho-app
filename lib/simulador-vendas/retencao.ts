import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tenantDb } from '@/lib/tenant-db';
import { logAdminAction } from '@/lib/audit';

// Mesma janela operacional dos backups de segurança de actions/backup.ts.
// Não é histórico consultável do participante; bucket privado, sem URL pública.
const BACKUP_DIAS = 7;
const PREFIXO = 'pace-retencao';
type Candidata = {
  id: string;
  hash: string;
  documento: { sessao: { empresa_id: string; id: string }; tentativas: unknown[] };
};
const checksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function expurgarComBackup(
  tdb: ReturnType<typeof tenantDb>,
  empresaId: string,
  candidata: Candidata,
) {
  if (candidata.documento.sessao.empresa_id !== empresaId || candidata.documento.sessao.id !== candidata.id)
    throw new Error('PACE: snapshot fora do escopo');
  const bytes = gzipSync(
    Buffer.from(JSON.stringify({ politica: '6 meses', salvoEm: new Date().toISOString(), ...candidata })),
  );
  const caminho = `${PREFIXO}/${new Date().toISOString().slice(0, 10)}_${randomUUID()}.json.gz`;
  const bucket = tdb.storage.from('backups');
  const upload = await bucket.upload(caminho, bytes, { contentType: 'application/gzip', upsert: false });
  if (upload.error) throw new Error('PACE: backup falhou; nenhum expurgo autorizado');
  const download = await bucket.download(caminho);
  if (
    download.error ||
    !download.data ||
    checksum(new Uint8Array(await download.data.arrayBuffer())) !== checksum(bytes)
  )
    throw new Error('PACE: backup não conferido; nenhum expurgo autorizado');
  const removido = await tdb.rpc('sim_vendas_expurgar', {
    p_empresa: empresaId,
    p_id: candidata.id,
    p_hash: candidata.hash,
  });
  if (removido.error) throw new Error('PACE: falha ao expurgar o snapshot conferido');
  return removido.data === true;
}

/** Núcleo headless; somente o cron autenticado o chama. Nunca retorna conversas. */
export async function executarRetencaoPace(registro: SupabaseClient, deadline = Date.now() + 700_000) {
  const bucket = await registro.storage.getBucket('backups');
  if (bucket.error || !bucket.data || bucket.data.public)
    throw new Error('PACE: bucket de backup privado indisponível');
  let removidas = 0,
    alteradas = 0,
    empresas = 0;
  const falhas: string[] = [];
  let cursor = '';
  for (;;) {
    // empresas é o registro global de tenants; conteúdo só entra no tenantDb abaixo.
    let query = registro.from('empresas').select('id').order('id').limit(200);
    if (cursor) query = query.gt('id', cursor);
    const pagina = await query;
    if (pagina.error) throw new Error('PACE: não foi possível enumerar empresas para retenção');
    for (const empresa of pagina.data || []) {
      const tdb = tenantDb(empresa.id);
      try {
        for (;;) {
          if (Date.now() > deadline || removidas + alteradas >= 1000)
            throw new Error('PACE: manutenção parcial; há trabalho para a próxima execução');
          const lote = await tdb.rpc('sim_vendas_retencao_lote', { p_empresa: empresa.id, p_limite: 5 });
          if (lote.error || !Array.isArray(lote.data))
            throw new Error('PACE: falha ao consultar candidatos à retenção');
          if (!lote.data.length) break;
          let houveMudanca = false;
          for (const candidata of lote.data as Candidata[]) {
            if (await expurgarComBackup(tdb, empresa.id, candidata)) removidas++;
            else {
              alteradas++;
              houveMudanca = true;
            }
          }
          if (houveMudanca) break; // concorrência: adiar, não disputar o treino.
        }
        empresas++;
      } catch (e) {
        falhas.push(empresa.id);
        console.error('[pace-retencao]', {
          empresaId: empresa.id,
          tipo: e instanceof Error ? e.message : 'erro',
        });
      }
    }
    if ((pagina.data?.length || 0) < 200 || Date.now() > deadline) break;
    cursor = pagina.data!.at(-1)!.id;
  }
  // Pasta exclusiva; jamais toca os backups diários ou de outros módulos.
  const corte = new Date(Date.now() - BACKUP_DIAS * 86_400_000).toISOString().slice(0, 10);
  for (;;) {
    const lista = await registro.storage
      .from('backups')
      .list(PREFIXO, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    if (lista.error) throw new Error('PACE: não foi possível conferir a retenção dos backups');
    const vencidos = lista.data.filter(
      (f) => /^\d{4}-\d{2}-\d{2}_[0-9a-f-]{36}\.json\.gz$/.test(f.name) && f.name.slice(0, 10) < corte,
    );
    if (!vencidos.length) break;
    const apagados = await registro.storage
      .from('backups')
      .remove(vencidos.map((f) => `${PREFIXO}/${f.name}`));
    if (apagados.error) throw new Error('PACE: falha na retenção dos backups de segurança');
    if (Date.now() > deadline) {
      falhas.push('backups_pendentes');
      break;
    }
  }
  await logAdminAction({
    adminEmail: 'system:cron',
    acao: 'sim_vendas.retencao',
    alvo: 'PACE',
    detalhes: { meses: 6, removidas, alteradas, empresas, falhas: falhas.length },
    resultado: falhas.length ? 'erro' : 'ok',
  });
  if (falhas.length)
    throw new Error(
      `PACE: retenção incompleta em ${falhas.length} escopo(s); ${removidas} sessão(ões) expiradas removidas com backup`,
    );
  return {
    removidas,
    alteradas,
    empresas,
    message: `PACE: ${removidas} sessão(ões) expiradas removidas com backup; ${alteradas} alteradas preservadas`,
  };
}
