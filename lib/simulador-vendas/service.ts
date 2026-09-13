import 'server-only';
import { VENDAS_SESSAO } from '@/lib/status';
import { randomUUID } from 'node:crypto';
import { can } from '@/lib/permissions';
import { maskTextPII } from '@/lib/pii-masker';
import { gerador, snapshotPrompts } from './ai';
import { SimuladorError, executarCore, recebido, visaoPublica } from './core';
import type { Contexto } from './access';
import type { Estado, Comando } from './schema';

type Row = { id: string; estado: Estado; revisao: number; lock_until: string | null; created_at: string };
const owned = (c: Contexto) => c.tdb.from('sim_vendas_sessoes').select('*').eq('owner_key', c.ownerKey);
function banco(error: { message?: string } | null) {
  if (!error) return;
  if (error.message?.includes('SIM_ABERTA')) throw new SimuladorError(409, 'Você já tem um treino aberto. Retome ou encerre esse treino antes de começar outro.');
  if (error.message?.includes('SIM_LIMITE')) throw new SimuladorError(403, 'Você atingiu o limite de treinos contratado. Fale com o responsável pelo programa.');
  if (error.message?.includes('SIM_CONFIG')) throw new SimuladorError(403, 'A configuração comercial ainda não está disponível.');
  throw new SimuladorError(503, 'Não foi possível salvar ou recuperar o treino. Tente novamente.');
}
const publico = (row: Row) => ({ ...visaoPublica(row.estado), processando: !!row.lock_until && Date.parse(row.lock_until) > Date.now() });

export async function consultar(c: Contexto, id?: string | null) {
  const list = await owned(c).order('created_at', { ascending: false }).limit(30); banco(list.error);
  const rows = list.data as Row[];
  const aberta = rows.find(r => [VENDAS_SESSAO.PREPARANDO, VENDAS_SESSAO.EM_ANDAMENTO].some(status => status === r.estado.status));
  let row = aberta || rows[0];
  if (id) {
    const result = await owned(c).eq('id', id).maybeSingle(); banco(result.error);
    if (!result.data) throw new SimuladorError(404, 'Treino não encontrado.');
    row = result.data;
  }
  return { empresaId: c.empresaId, empresaNome: c.empresaNome, habilitado: c.config?.habilitado === true,
    configurado: !!c.config, admin: c.auth.isPlatformAdmin, podeTreinar: await can(c.auth, 'assessments.answer'),
    podeConfigurar: c.auth.isPlatformAdmin && await can(c.auth, 'settings.company.manage'),
    ...(c.auth.isPlatformAdmin ? { config: c.config } : {}),
    sessao: row ? publico(row) : null,
    historico: rows.map(r => ({ id: r.id, criadoEm: r.created_at, status: r.estado.status, nivel: r.estado.nivel,
      nome: r.estado.cenario?.personagem.nome || 'Preparando cenário', nota: r.estado.relatorio?.Media ?? null })),
  };
}

export async function executar(c: Contexto, original: Comando) {
  const deadline = Date.now() + 270000;
  const cmd: Comando = original.acao === 'responder' ? { ...original, mensagem: maskTextPII(original.mensagem).trim() } : original;
  let row: Row;
  if (cmd.acao === 'iniciar') {
    const existing = await owned(c).eq('id', cmd.requestId).maybeSingle(); banco(existing.error);
    if (existing.data) row = existing.data;
    else {
      if (!c.config) throw new SimuladorError(400, 'Salve o briefing comercial da empresa antes de iniciar.');
      const estado: Estado = { id: cmd.requestId, revisao: 0, status: VENDAS_SESSAO.PREPARANDO, nivel: cmd.nivel,
        nomeVendedor: c.nomeVendedor || 'Vendedor', briefing: c.config.briefing, prompts: await snapshotPrompts(c.empresaId),
        cenario: null, fase: 'preparar', mensagens: [], moderacoes: [], intencao: null, relatorio: null, feedback: null,
        criadoEm: new Date().toISOString(), encerradoEm: null, recibos: [] };
      const created = await c.tdb.rpc('sim_vendas_criar', { p_id: estado.id, p_empresa: c.empresaId, p_owner: c.ownerKey,
        p_colaborador: c.colaboradorId, p_estado: estado, p_admin: c.auth.isPlatformAdmin }); banco(created.error);
      const loaded = await owned(c).eq('id', estado.id).single(); banco(loaded.error); row = loaded.data;
    }
  } else {
    const loaded = await owned(c).eq('id', cmd.sessaoId).maybeSingle(); banco(loaded.error);
    if (!loaded.data) throw new SimuladorError(404, 'Treino não encontrado.');
    row = loaded.data;
  }
  if (recebido(row.estado, cmd) || (cmd.acao === 'encerrar' && row.estado.status === VENDAS_SESSAO.CONCLUIDA)) return { sessao: publico(row) };
  if (cmd.acao !== 'iniciar' && cmd.revisao !== row.revisao) throw new SimuladorError(409, 'O treino mudou em outra aba. Atualize a conversa.');
  const token = randomUUID();
  const args = { p_id: row.id, p_empresa: c.empresaId, p_owner: c.ownerKey, p_revisao: row.revisao, p_token: token };
  const claim = await c.tdb.rpc('sim_vendas_claim', args); banco(claim.error);
  if (!claim.data) throw new SimuladorError(409, 'Há um envio em processamento. Aguarde e atualize a conversa.');
  try {
    const next = await executarCore(row.estado, cmd, gerador(c, row.estado, cmd.requestId, deadline));
    const committed = await c.tdb.rpc('sim_vendas_commit', { ...args, p_estado: next }); banco(committed.error);
    if (!committed.data) throw new SimuladorError(409, 'O treino mudou durante o envio. Atualize para recuperar a conversa.');
    return { sessao: { ...visaoPublica(next), processando: false } };
  } finally {
    const release = await c.tdb.from('sim_vendas_sessoes').update({ lock_token: null, lock_until: null }).eq('id', row.id).eq('owner_key', c.ownerKey).eq('lock_token', token);
    if (release.error) console.error('[sim-vendas] lease aguardará expiração', { sessao: row.id });
  }
}
