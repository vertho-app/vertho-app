import 'server-only';
import { randomUUID } from 'node:crypto';
import { abrirSessao, visaoPublica, responder, encerrar, ErroReferenciaAvaliacao } from './core';
import { cenario } from './cenario.mjs';
import { RecepcaoError, contextoRecepcao } from './access';
import { geradorRecepcao, textoParaTreino } from './ai';
import type { z } from 'zod';
import { comandoSchema } from './schema';
import { RECEPCAO_SESSAO } from '@/lib/status';
import { catalogo, cenarioPublicado } from './cenarios';
import { can } from '@/lib/permissions';
import type { Estado } from './model';

type Ctx = Exclude<Awaited<ReturnType<typeof contextoRecepcao>>, Response>;
const owned = (c: Ctx) => c.sb.from('recepcao_sessoes').select('*').eq('empresa_id', c.empresaId).eq('owner_key', c.ownerKey);
function banco(error: any) { if (error) throw new RecepcaoError(503, 'Não foi possível salvar ou recuperar o treino. Tente novamente.'); }
const publico = (row: any) => ({ ...visaoPublica(row.estado), processando: !!row.lock_until && Date.parse(row.lock_until) > Date.now() });

export async function consultar(c: Ctx, id?: string | null) {
  const { data: rows, error } = await owned(c).order('created_at', { ascending: false }).limit(20);
  banco(error);
  let row = rows?.[0] ?? null;
  if (id) {
    const result = await owned(c).eq('id', id).maybeSingle(); banco(result.error);
    if (!result.data) throw new RecepcaoError(404, 'Treino não encontrado.');
    row = result.data;
  }
  const cenarios=await catalogo(c);
  return {
    empresaId: c.empresaId, empresaNome: c.empresaNome, habilitado: c.habilitado, admin: c.auth.isPlatformAdmin,
    ficha: cenarios[0]?.ficha || cenario.publico, cenarios, sessao: row ? publico(row) : null,
    podeEquipe: (c.auth.isPlatformAdmin || ['rh','gestor','tutor'].includes(c.auth.role)) && await can(c.auth,'journey.team.view') && await can(c.auth,'reports.individual.view'),
    podeCenarios: await can(c.auth,'content.manage'),
    historico: (rows || []).map(r => ({ id: r.id, data: r.created_at, status: r.estado.status,
      titulo:r.estado.cenario.publico.titulo, nota: r.estado.relatorio?.nota ?? null, situacao: r.estado.relatorio?.situacao ?? null })),
  };
}

export async function executar(c: Ctx, cmd: z.infer<typeof comandoSchema>) {
  if (cmd.acao === 'iniciar') {
    // O UUID da requisição é a chave da criação: retry de rede não abre outro treino.
    const existente=await owned(c).eq('id',cmd.requestId).maybeSingle(); banco(existente.error);
    if(existente.data) {
      if(cmd.cenarioId && existente.data.estado.cenarioRegistroId!==cmd.cenarioId) throw new RecepcaoError(409,'Este início já foi usado para outro cenário. Prepare um novo atendimento.');
      return {sessao:publico(existente.data)};
    }
    const escolhido=await cenarioPublicado(c,cmd.cenarioId);
    const anterior=await owned(c).order('created_at',{ascending:false}).limit(1).maybeSingle(); banco(anterior.error);
    const nVariantes=1+(escolhido.conteudo.variantes?.length||0);
    const variante=anterior.data?.estado?.cenario?.id===escolhido.conteudo.id ? ((anterior.data.estado.variante||0)+1)%nVariantes : undefined;
    const estado = abrirSessao(escolhido.conteudo,variante); estado.id = cmd.requestId;estado.cenarioRegistroId=escolhido.id;
    const { error } = await c.sb.from('recepcao_sessoes').insert({
      id: estado.id, empresa_id: c.empresaId, owner_email: c.owner,owner_key:c.ownerKey,
      colaborador_id: c.auth.colaborador?.empresa_id === c.empresaId ? c.auth.colaborador.id : null, estado,
    });
    if (error && error.code !== '23505') banco(error);
    const r = await owned(c).eq('id', estado.id).maybeSingle(); banco(r.error);
    if (!r.data) throw new RecepcaoError(409, 'Não foi possível iniciar. Tente novamente com um novo treino.');
    return { sessao: publico(r.data) };
  }
  const { data: row, error } = await owned(c).eq('id', cmd.sessaoId).maybeSingle(); banco(error);
  if (!row) throw new RecepcaoError(404, 'Treino não encontrado.');
  const s = row.estado as Estado;
  const mensagem = cmd.acao === 'responder' ? textoParaTreino(cmd.mensagem) : '';
  if (cmd.acao === 'responder') {
    const recibo = s.recibos.find((r: any) => r.requestId === cmd.requestId);
    if (recibo) {
      if (recibo.mensagem !== mensagem) throw new RecepcaoError(409, 'Este envio já foi usado com outro texto.');
      return { sessao: publico(row) };
    }
    if (s.status !== RECEPCAO_SESSAO.EM_ANDAMENTO) throw new RecepcaoError(409, 'Este treino já foi encerrado.');
  } else {
    if (s.status === RECEPCAO_SESSAO.CONCLUIDA) return { sessao: publico(row) };
    if (!s.respostas) throw new RecepcaoError(400, 'Converse com a paciente antes de gerar o relatório.');
  }
  if (cmd.revisao !== row.revisao) throw new RecepcaoError(409, 'O treino mudou em outra aba. Atualize a conversa e tente novamente.');
  const token = randomUUID();
  const args = { p_id: row.id, p_empresa: c.empresaId, p_owner: c.ownerKey, p_revisao: row.revisao, p_token: token };
  const claim = await c.sb.rpc('recepcao_claim_v2', args); banco(claim.error);
  if (!claim.data) throw new RecepcaoError(409, 'Há um envio em processamento. Aguarde e atualize a conversa.');
  try {
    const ai = geradorRecepcao(c.empresaId, c.auth.colaborador?.empresa_id === c.empresaId ? c.auth.colaborador.id : null, c.auth.isPlatformAdmin,{sb:c.sb,sessaoId:row.id,cenarioVersao:s.cenario.versao});
    let next;
    try {
      next = cmd.acao === 'responder'
        ? (await responder(s, { requestId: cmd.requestId, mensagem }, ai.gerar)).estado
        : await encerrar(s, ai.gerar,ai.validar);
      if(cmd.acao==='responder') await ai.validar();
    } catch (err) {
      await ai.validar(err);
      // Não logar histórico ou resposta bruta do provedor.
      console.error('[recepcao] geração/validação falhou', {
        sessaoId: row.id, acao: cmd.acao, tipo: err instanceof Error ? err.name : 'erro',
        ...(err instanceof ErroReferenciaAvaliacao ? { codigo: err.codigo, campo: err.campo } : {}),
      });
      throw new RecepcaoError(502, cmd.acao === 'encerrar'
        ? 'Não foi possível validar o relatório. A conversa foi preservada; tente gerar o relatório novamente.'
        : 'Não foi possível concluir esta resposta. O treino foi preservado; tente novamente.');
    }
    const commit = await c.sb.rpc('recepcao_commit_v2', { ...args, p_estado: next, p_chamadas: ai.chamadas }); banco(commit.error);
    if (!commit.data) throw new RecepcaoError(409, 'O treino mudou durante o envio. Atualize para recuperar a conversa.');
    return { sessao: { ...visaoPublica(next), processando: false } };
  } finally {
    // O token impede liberar uma lease pertencente a outro processo.
    const release = await c.sb.from('recepcao_sessoes').update({ lock_token: null, lock_until: null })
      .eq('id', row.id).eq('empresa_id', c.empresaId).eq('owner_key', c.ownerKey).eq('lock_token', token);
    if (release.error) console.error('[recepcao] lease aguardará expiração');
  }
}
