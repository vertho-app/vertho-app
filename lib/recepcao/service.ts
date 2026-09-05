import 'server-only';
import { randomUUID } from 'node:crypto';
import { abrirSessao, visaoPublica, responder, encerrar } from './core.mjs';
import { cenario } from './cenario.mjs';
import { RecepcaoError, contextoRecepcao } from './access';
import { geradorRecepcao, textoParaTreino } from './ai';
import type { z } from 'zod';
import { comandoSchema } from './schema';

type Ctx = Exclude<Awaited<ReturnType<typeof contextoRecepcao>>, Response>;
const owned = (c: Ctx) => c.sb.from('recepcao_sessoes').select('*').eq('empresa_id', c.empresaId).eq('owner_email', c.owner);
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
  return {
    empresaId: c.empresaId, empresaNome: c.empresaNome, habilitado: c.habilitado, admin: c.auth.isPlatformAdmin,
    ficha: cenario.publico, sessao: row ? publico(row) : null,
    historico: (rows || []).map(r => ({ id: r.id, data: r.created_at, status: r.estado.status,
      nota: r.estado.relatorio?.nota ?? null, situacao: r.estado.relatorio?.situacao ?? null })),
  };
}

export async function executar(c: Ctx, cmd: z.infer<typeof comandoSchema>) {
  if (cmd.acao === 'iniciar') {
    // O UUID da requisição é a chave da criação: retry de rede não abre outro treino.
    const estado = abrirSessao(cenario); estado.id = cmd.requestId;
    const { error } = await c.sb.from('recepcao_sessoes').insert({
      id: estado.id, empresa_id: c.empresaId, owner_email: c.owner,
      colaborador_id: c.auth.colaborador?.empresa_id === c.empresaId ? c.auth.colaborador.id : null, estado,
    });
    if (error && error.code !== '23505') banco(error);
    const r = await owned(c).eq('id', estado.id).maybeSingle(); banco(r.error);
    if (!r.data) throw new RecepcaoError(409, 'Não foi possível iniciar. Tente novamente com um novo treino.');
    return { sessao: publico(r.data) };
  }
  const { data: row, error } = await owned(c).eq('id', cmd.sessaoId).maybeSingle(); banco(error);
  if (!row) throw new RecepcaoError(404, 'Treino não encontrado.');
  const s = row.estado;
  const mensagem = cmd.acao === 'responder' ? textoParaTreino(cmd.mensagem) : '';
  if (cmd.acao === 'responder') {
    const recibo = s.recibos.find((r: any) => r.requestId === cmd.requestId);
    if (recibo) {
      if (recibo.mensagem !== mensagem) throw new RecepcaoError(409, 'Este envio já foi usado com outro texto.');
      return { sessao: publico(row) };
    }
    if (s.status !== 'em_andamento') throw new RecepcaoError(409, 'Este treino já foi encerrado.');
  } else {
    if (s.status === 'concluida') return { sessao: publico(row) };
    if (!s.respostas) throw new RecepcaoError(400, 'Converse com a paciente antes de gerar o relatório.');
  }
  if (cmd.revisao !== row.revisao) throw new RecepcaoError(409, 'O treino mudou em outra aba. Atualize a conversa e tente novamente.');
  const token = randomUUID();
  const args = { p_id: row.id, p_empresa: c.empresaId, p_owner: c.owner, p_revisao: row.revisao, p_token: token };
  const claim = await c.sb.rpc('recepcao_claim', args); banco(claim.error);
  if (!claim.data) throw new RecepcaoError(409, 'Há um envio em processamento. Aguarde e atualize a conversa.');
  try {
    const ai = geradorRecepcao(c.empresaId, c.auth.colaborador?.empresa_id === c.empresaId ? c.auth.colaborador.id : null, c.auth.isPlatformAdmin);
    let next;
    try {
      next = cmd.acao === 'responder'
        ? (await responder(s, { requestId: cmd.requestId, mensagem }, ai.gerar)).estado
        : await encerrar(s, ai.gerar);
    } catch (err) {
      // Não logar histórico ou resposta bruta do provedor.
      console.error('[recepcao] geração/validação falhou', err instanceof Error ? err.name : 'erro');
      throw new RecepcaoError(502, 'Não foi possível concluir esta resposta. O treino foi preservado; tente novamente.');
    }
    const commit = await c.sb.rpc('recepcao_commit', { ...args, p_estado: next, p_chamadas: ai.chamadas }); banco(commit.error);
    if (!commit.data) throw new RecepcaoError(409, 'O treino mudou durante o envio. Atualize para recuperar a conversa.');
    return { sessao: { ...visaoPublica(next), processando: false } };
  } finally {
    // O token impede liberar uma lease pertencente a outro processo.
    const release = await c.sb.from('recepcao_sessoes').update({ lock_token: null, lock_until: null })
      .eq('id', row.id).eq('empresa_id', c.empresaId).eq('owner_email', c.owner).eq('lock_token', token);
    if (release.error) console.error('[recepcao] lease aguardará expiração');
  }
}
