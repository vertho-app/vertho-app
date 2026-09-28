import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  abrirSessao,
  visaoPublica,
  responder,
  encerrar,
  ErroReferenciaAvaliacao,
  sugerirNivel,
} from './core';
import { cenario } from './cenario.mjs';
import { RecepcaoError, contextoRecepcao } from './access';
import { geradorRecepcao, textoParaTreino } from './ai';
import type { z } from 'zod';
import { comandoSchema } from './schema';
import { RECEPCAO_SESSAO } from '@/lib/status';
import { catalogo, cenarioPublicado } from './cenarios';
import { can } from '@/lib/permissions';
import type { Estado } from './model';
import { notaAtendimento } from './matriz-avaliacao';
import { competenciasAtendimento } from './matriz';
import { evolucaoPorCompetencia } from '@/lib/simuladores/evolucao';

type Ctx = Exclude<Awaited<ReturnType<typeof contextoRecepcao>>, Response>;
const owned = (c: Ctx) =>
  c.sb
    .from('recepcao_sessoes')
    .select('*')
    .eq('empresa_id', c.empresaId)
    .eq('owner_key', c.ownerKey);
function banco(error: any) {
  if (error)
    throw new RecepcaoError(
      503,
      'Não foi possível salvar ou recuperar o treino. Tente novamente.',
    );
}
const publico = (row: any) => ({
  ...visaoPublica(row.estado),
  processando: !!row.lock_until && Date.parse(row.lock_until) > Date.now(),
});

/** Página do histórico de quem treina; a sugestão de degrau e a evolução leem a primeira. */
export const PAGINA_HISTORICO = 20;
// Sessão aberta e abandonada sem resposta, marcada ao iniciar outra (27/09/2026): fora da tela.
const semDescartadas = (c: Ctx) => owned(c).neq('estado->>status', RECEPCAO_SESSAO.DESCARTADA);
const itemDoHistorico = (r: any) => ({
  id: r.id,
  data: r.created_at,
  status: r.estado.status,
  titulo: r.estado.cenario.publico.titulo,
  nivel: r.estado.cenario.publico.nivel ?? null,
  nota: notaAtendimento(r.estado.relatorio),
  escalaOriginal: r.estado.relatorio && !r.estado.relatorio.escalaNota ? '0-100' : null,
  situacao: r.estado.relatorio?.situacao ?? null,
});

/** Página `pagina` (a partir de 0) do histórico, mais recente primeiro. */
export async function consultarHistorico(c: Ctx, pagina: number) {
  const de = pagina * PAGINA_HISTORICO;
  // Uma linha a mais só para saber se há outra página.
  const { data, error } = await semDescartadas(c)
    .order('created_at', { ascending: false })
    .order('id')
    .range(de, de + PAGINA_HISTORICO);
  banco(error);
  return {
    historico: (data || []).slice(0, PAGINA_HISTORICO).map(itemDoHistorico),
    temMais: (data || []).length > PAGINA_HISTORICO,
  };
}

/**
 * Ao iniciar outro atendimento, a sessão aberta do mesmo dono que ficou SEM
 * resposta é marcada como descartada (27/09/2026). Marcar, e não apagar: o
 * serviço não tem DELETE em `recepcao_sessoes` (mig 240) e `recepcao_tentativas`
 * aponta para a sessão sem cascata (a voz da fala de abertura gera tentativa com
 * custo). A escrita confere de novo, no banco, que continua sem resposta e sem
 * lease: uma resposta que chegou no meio vence o descarte. Falha aqui não
 * impede o início; a sessão vazia só fica aberta (e já não conta como treino).
 */
async function descartarVazias(c: Ctx, manter: string) {
  const { data, error } = await owned(c)
    .eq('estado->>status', RECEPCAO_SESSAO.EM_ANDAMENTO)
    .eq('estado->>respostas', '0')
    .neq('id', manter)
    .limit(20);
  if (error) {
    console.error('[recepcao] sessões vazias não foram consultadas para descarte');
    return;
  }
  for (const r of data || []) {
    const revisao = r.revisao + 1;
    const { error: falha } = await c.sb
      .from('recepcao_sessoes')
      .update({
        estado: { ...r.estado, status: RECEPCAO_SESSAO.DESCARTADA, motivoFim: 'descartada_sem_resposta', revisao },
        revisao,
        updated_at: new Date().toISOString(),
      })
      .eq('empresa_id', c.empresaId)
      .eq('owner_key', c.ownerKey)
      .eq('id', r.id)
      .eq('revisao', r.revisao)
      .eq('estado->>respostas', '0')
      .is('lock_token', null);
    if (falha) console.error('[recepcao] sessão vazia não foi descartada', { sessaoId: r.id });
  }
}

export async function consultar(c: Ctx, id?: string | null) {
  // A página 0 do histórico (+1 para saber se há mais); a sugestão e a evolução leem as 20.
  const { data: lidas, error } = await semDescartadas(c)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(PAGINA_HISTORICO + 1);
  banco(error);
  const rows = (lidas || []).slice(0, PAGINA_HISTORICO);
  let row = rows[0] ?? null;
  if (id) {
    const result = await owned(c).eq('id', id).maybeSingle();
    banco(result.error);
    if (!result.data) throw new RecepcaoError(404, 'Treino não encontrado.');
    row = result.data;
  }
  const cenarios = await catalogo(c);
  // A sugestão lê os 20 treinos mais recentes (mesma janela do histórico exibido).
  const nivelSugerido = sugerirNivel(
    (rows || [])
      .filter((r) => r.estado.status === RECEPCAO_SESSAO.CONCLUIDA)
      .map((r) => ({
        nivel: r.estado.cenario.publico.nivel ?? null,
        nota: r.estado.relatorio?.nota ?? null,
        escalaNota: r.estado.relatorio?.escalaNota,
      })),
  );
  // Evolução por competência de quem treina (18/09/2026): maior nível alcançado, só avanço
  // (régua comum, lib/simuladores/evolucao.ts), nos treinos recentes com matriz. A partir de 2.
  const competencias = competenciasAtendimento(c.dominio);
  const comMatriz = (rows || [])
    .filter(
      (r) =>
        r.estado.status === RECEPCAO_SESSAO.CONCLUIDA &&
        r.estado.relatorio?.escalaNota === '1-4' &&
        r.estado.relatorio.competencias?.length,
    )
    .map((r) => ({
      competencias: Object.fromEntries(
        r.estado.relatorio.competencias.map((x: { codigo: string; nota: number | null }) => [x.codigo, x.nota]),
      ),
    }));
  const evolucao =
    comMatriz.length >= 2
      ? {
          competencias: evolucaoPorCompetencia(comMatriz, competencias.map((x) => x.codigo)),
          nomes: Object.fromEntries(competencias.map((x) => [x.codigo, x.nome])),
        }
      : null;
  // Atendimentos abertos COM resposta ficam sempre localizáveis para retomar, mesmo
  // fora da primeira página (antes sumiam depois de 20 inícios).
  const abertas = await semDescartadas(c)
    .in('estado->>status', [RECEPCAO_SESSAO.EM_ANDAMENTO, RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO])
    .neq('estado->>respostas', '0')
    .order('created_at', { ascending: false })
    .order('id')
    .limit(50);
  banco(abertas.error);
  return {
    empresaId: c.empresaId,
    empresaNome: c.empresaNome,
    evolucao,
    habilitado: c.habilitado,
    dominio: c.dominio,
    admin: c.auth.isPlatformAdmin,
    soAcompanha: c.soAcompanha,
    // Sem caso publicado no segmento, não há ficha: a tela avisa em vez de mostrar um caso de outro segmento.
    ficha: cenarios[0]?.ficha || (c.dominio === 'recepcao_medica' ? cenario.publico : null),
    cenarios,
    nivelSugerido,
    sessao: row ? publico(row) : null,
    podeEquipe:
      (c.auth.isPlatformAdmin ||
        ['rh', 'gestor'].includes(c.auth.role)) &&
      (await can(c.auth, 'journey.team.view')) &&
      (await can(c.auth, 'reports.individual.view')),
    podeCenarios: await can(c.auth, 'content.manage'),
    historico: rows.map(itemDoHistorico),
    historicoTemMais: (lidas || []).length > PAGINA_HISTORICO,
    abertos: (abertas.data || []).map(itemDoHistorico),
  };
}

export async function executar(c: Ctx, cmd: z.infer<typeof comandoSchema>) {
  if (cmd.acao === 'iniciar') {
    // O UUID da requisição é a chave da criação: retry de rede não abre outro treino.
    const existente = await owned(c).eq('id', cmd.requestId).maybeSingle();
    banco(existente.error);
    if (existente.data) {
      if (
        cmd.cenarioId &&
        existente.data.estado.cenarioRegistroId !== cmd.cenarioId
      )
        throw new RecepcaoError(
          409,
          'Este início já foi usado para outro cenário. Prepare um novo atendimento.',
        );
      return { sessao: publico(existente.data) };
    }
    const escolhido = await cenarioPublicado(c, cmd.cenarioId);
    const anterior = await owned(c)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    banco(anterior.error);
    const nVariantes = 1 + (escolhido.conteudo.variantes?.length || 0);
    const variante =
      anterior.data?.estado?.cenario?.id === escolhido.conteudo.id
        ? ((anterior.data.estado.variante || 0) + 1) % nVariantes
        : undefined;
    const estado = abrirSessao(escolhido.conteudo, variante);
    estado.id = cmd.requestId;
    estado.cenarioRegistroId = escolhido.id;
    const { error } = await c.sb.from('recepcao_sessoes').insert({
      id: estado.id,
      empresa_id: c.empresaId,
      owner_email: c.owner,
      owner_key: c.ownerKey,
      colaborador_id:
        c.auth.colaborador?.empresa_id === c.empresaId
          ? c.auth.colaborador.id
          : null,
      estado,
    });
    if (error && error.code !== '23505') banco(error);
    const r = await owned(c).eq('id', estado.id).maybeSingle();
    banco(r.error);
    if (!r.data)
      throw new RecepcaoError(
        409,
        'Não foi possível iniciar. Tente novamente com um novo treino.',
      );
    await descartarVazias(c, estado.id);
    return { sessao: publico(r.data) };
  }
  const { data: row, error } = await owned(c)
    .eq('id', cmd.sessaoId)
    .maybeSingle();
  banco(error);
  if (!row) throw new RecepcaoError(404, 'Treino não encontrado.');
  const s = row.estado as Estado;
  const mensagem =
    cmd.acao === 'responder' ? textoParaTreino(cmd.mensagem) : '';
  if (cmd.acao === 'responder') {
    const recibo = s.recibos.find((r: any) => r.requestId === cmd.requestId);
    if (recibo) {
      if (recibo.mensagem !== mensagem)
        throw new RecepcaoError(
          409,
          'Este envio já foi usado com outro texto.',
        );
      return { sessao: publico(row) };
    }
    if (s.status !== RECEPCAO_SESSAO.EM_ANDAMENTO)
      throw new RecepcaoError(409, 'Este treino já foi encerrado.');
  } else {
    if (s.status === RECEPCAO_SESSAO.CONCLUIDA) return { sessao: publico(row) };
    if (!s.respostas)
      throw new RecepcaoError(
        400,
        `Converse com ${s.cenario.paciente.nome} antes de gerar o relatório.`,
      );
  }
  if (cmd.revisao !== row.revisao)
    throw new RecepcaoError(
      409,
      'O treino mudou em outra aba. Atualize a conversa e tente novamente.',
    );
  const token = randomUUID();
  const args = {
    p_id: row.id,
    p_empresa: c.empresaId,
    p_owner: c.ownerKey,
    p_revisao: row.revisao,
    p_token: token,
  };
  const claim = await c.sb.rpc('recepcao_claim_v2', args);
  banco(claim.error);
  if (!claim.data)
    throw new RecepcaoError(
      409,
      'Há um envio em processamento. Aguarde e atualize a conversa.',
    );
  try {
    const ai = geradorRecepcao(
      c.empresaId,
      c.auth.colaborador?.empresa_id === c.empresaId
        ? c.auth.colaborador.id
        : null,
      c.auth.isPlatformAdmin,
      { sb: c.sb, sessaoId: row.id, cenarioVersao: s.cenario.versao },
    );
    let next;
    try {
      next =
        cmd.acao === 'responder'
          ? (
              await responder(
                s,
                { requestId: cmd.requestId, mensagem },
                ai.gerar,
              )
            ).estado
          : await encerrar(s, ai.gerar, ai.validar);
      if (cmd.acao === 'responder') await ai.validar();
    } catch (err) {
      await ai.validar(err);
      // Não logar histórico ou resposta bruta do provedor.
      console.error('[recepcao] geração/validação falhou', {
        sessaoId: row.id,
        acao: cmd.acao,
        tipo: err instanceof Error ? err.name : 'erro',
        ...(err instanceof ErroReferenciaAvaliacao
          ? { codigo: err.codigo, campo: err.campo }
          : {}),
      });
      throw new RecepcaoError(
        502,
        cmd.acao === 'encerrar'
          ? 'Não foi possível validar o relatório. A conversa foi preservada; tente gerar o relatório novamente.'
          : 'Não foi possível concluir esta resposta. O treino foi preservado; tente novamente.',
      );
    }
    const commit = await c.sb.rpc('recepcao_commit_v2', {
      ...args,
      p_estado: next,
      p_chamadas: ai.chamadas,
    });
    banco(commit.error);
    if (!commit.data)
      throw new RecepcaoError(
        409,
        'O treino mudou durante o envio. Atualize para recuperar a conversa.',
      );
    return { sessao: { ...visaoPublica(next), processando: false } };
  } finally {
    // O token impede liberar uma lease pertencente a outro processo.
    const release = await c.sb
      .from('recepcao_sessoes')
      .update({ lock_token: null, lock_until: null })
      .eq('id', row.id)
      .eq('empresa_id', c.empresaId)
      .eq('owner_key', c.ownerKey)
      .eq('lock_token', token);
    if (release.error) console.error('[recepcao] lease aguardará expiração');
  }
}
