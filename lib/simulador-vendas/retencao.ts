import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tenantDb } from '@/lib/tenant-db';
import { logAdminAction } from '@/lib/audit';
import { BACKUP_DIAS, PREFIXOS_BACKUP_PACE, exigirBucketPrivado, gravarBackupConferido, removerBackupRecusado } from './backup';

// Mesma janela operacional dos backups de segurança de actions/backup.ts.
// Não é histórico consultável do participante; bucket privado, sem URL pública.
type Candidata = {
  id: string;
  hash: string;
  documento: { sessao: { empresa_id: string; id: string }; tentativas: unknown[] };
};

export async function expurgarComBackup(
  tdb: ReturnType<typeof tenantDb>,
  empresaId: string,
  candidata: Candidata,
) {
  if (candidata.documento.sessao.empresa_id !== empresaId || candidata.documento.sessao.id !== candidata.id)
    throw new Error('PACE: snapshot fora do escopo');
  const { caminho } = await gravarBackupConferido(tdb.storage, 'pace-retencao', { politica: '6 meses', ...candidata });
  const removido = await tdb.rpc('sim_vendas_expurgar', {
    p_empresa: empresaId,
    p_id: candidata.id,
    p_hash: candidata.hash,
  });
  if (removido.error) throw new Error('PACE: falha ao expurgar o snapshot conferido');
  if (removido.data === false) {
    await removerBackupRecusado(tdb.storage, caminho);
    return false;
  }
  if (removido.data !== true) throw new Error('PACE: resposta de expurgo desconhecida; backup preservado');
  return true;
}

/** Núcleo headless; somente o cron autenticado o chama. Nunca retorna conversas. */
export async function executarRetencaoPace(registro: SupabaseClient, deadline = Date.now() + 700_000) {
  await exigirBucketPrivado(registro.storage);
  let removidas = 0,
    alteradas = 0,
    empresas = 0;
  const falhas: string[] = [];
  const checkpoint = await registro.from('sim_vendas_manutencao').select('cursor_empresa').eq('chave', 'retencao').maybeSingle();
  if (checkpoint.error) throw new Error('PACE: não foi possível recuperar o cursor da retenção');
  let cursor = checkpoint.data?.cursor_empresa || '';
  // Cursor significa "última empresa concluída". Nunca avançar antes de
  // terminar o tenant atual, senão um corte de orçamento pularia seu restante.
  let proximaEmpresa: string | null = cursor || null;
  let parcial = false;
  const esgotado = () => Date.now() >= deadline || removidas + alteradas >= 1000;
  // Rotacionar primeiro impede que um acervo grande adie indefinidamente os
  // backups vencidos. Prefixos exclusivos, nunca os backups de outros módulos.
  const corte = new Date(Date.now() - BACKUP_DIAS * 86_400_000).toISOString().slice(0, 10);
  for (const prefixo of PREFIXOS_BACKUP_PACE) {
    for (;;) {
      if (Date.now() >= deadline) { parcial = true; break; }
      const lista = await registro.storage.from('backups').list(prefixo, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
      if (lista.error) throw new Error('PACE: não foi possível conferir a retenção dos backups');
      const vencidos = lista.data.filter((f) => /^\d{4}-\d{2}-\d{2}_[0-9a-f-]{36}\.json\.gz$/.test(f.name) && f.name.slice(0, 10) < corte);
      if (!vencidos.length) break;
      const apagados = await registro.storage.from('backups').remove(vencidos.map((f) => `${prefixo}/${f.name}`));
      if (apagados.error) throw new Error('PACE: falha na retenção dos backups de segurança');
    }
  }
  varredura: for (;;) {
    if (esgotado()) { parcial = true; break; }
    // empresas é o registro global de tenants; conteúdo só entra no tenantDb abaixo.
    let query = registro.from('empresas').select('id').order('id').limit(200);
    if (cursor) query = query.gt('id', cursor);
    const pagina = await query;
    if (pagina.error) throw new Error('PACE: não foi possível enumerar empresas para retenção');
    if (!pagina.data?.length && cursor) {
      cursor = '';
      proximaEmpresa = null;
      continue;
    }
    for (const empresa of pagina.data || []) {
      if (esgotado()) { parcial = true; break varredura; }
      const tdb = tenantDb(empresa.id);
      try {
        for (;;) {
          if (esgotado()) { parcial = true; break varredura; }
          const lote = await tdb.rpc('sim_vendas_retencao_lote', { p_empresa: empresa.id, p_limite: Math.min(5, 1000 - removidas - alteradas) });
          if (lote.error || !Array.isArray(lote.data))
            throw new Error('PACE: falha ao consultar candidatos à retenção');
          if (!lote.data.length) break;
          let houveMudanca = false;
          for (const candidata of lote.data as Candidata[]) {
            if (esgotado()) { parcial = true; break varredura; }
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
      proximaEmpresa = empresa.id;
    }
    if ((pagina.data?.length || 0) < 200) { proximaEmpresa = null; break; }
    cursor = pagina.data!.at(-1)!.id;
  }
  const salvo = await registro.from('sim_vendas_manutencao').upsert({ chave: 'retencao', cursor_empresa: proximaEmpresa, updated_at: new Date().toISOString() });
  if (salvo.error) throw new Error('PACE: não foi possível salvar o cursor da retenção');
  await logAdminAction({
    adminEmail: 'system:cron',
    acao: 'sim_vendas.retencao',
    alvo: 'PACE',
    detalhes: { meses: 6, removidas, alteradas, empresas, parcial, proximaEmpresa, falhas: falhas.length },
    resultado: falhas.length ? 'erro' : parcial ? 'parcial' : 'ok',
  });
  if (falhas.length)
    throw new Error(
      `PACE: retenção incompleta em ${falhas.length} escopo(s); ${removidas} sessão(ões) expiradas removidas com backup`,
    );
  return {
    removidas,
    alteradas,
    empresas,
    parcial,
    proximaEmpresa,
    message: `PACE: ${removidas} sessão(ões) expiradas removidas com backup; ${alteradas} alteradas preservadas${parcial ? '; manutenção parcial, com continuação na próxima execução' : ''}`,
  };
}
