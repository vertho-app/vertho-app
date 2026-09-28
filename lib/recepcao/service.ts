import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  abrirSessao,
  visaoPublica,
  responder,
  encerrar,
  ErroReferenciaAvaliacao,
  sugerirNivelComMotivo,
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
/**
 * Projeções (27/09/2026, A-8). `select('*')` trazia o `estado` inteiro (46,6 KB em
 * média, máx. 57,8 KB, medido nas sessões desde 18/09) de 20 sessões a cada GET, e a
 * tela faz um GET depois de cada envio: cerca de 1 MB por turno. E `chamadas`, que
 * cresce a cada chamada de IA, nunca é lida aqui.
 *  - SESSAO: a sessão que vai para a tela ou que o serviço altera (uma linha).
 *  - RESUMO: o que a lista usa (histórico, sugestão de degrau e evolução).
 */
export const COLUNAS_SESSAO = 'id,created_at,revisao,lock_until,estado';
export const COLUNAS_RESUMO =
  'id,created_at,status:estado->>status,titulo:estado->cenario->publico->>titulo' +
  ',nivel:estado->cenario->publico->>nivel,rel_versao:estado->relatorio->>versaoCenario' +
  ',nota:estado->relatorio->nota,escala:estado->relatorio->>escalaNota' +
  ',situacao:estado->relatorio->>situacao,competencias:estado->relatorio->competencias';
const owned = (c: Ctx, colunas: string = COLUNAS_SESSAO) =>
  c.sb
    .from('recepcao_sessoes')
    // A projeção é montada em runtime: o parser de tipos do supabase-js só lê literal e
    // devolveria `GenericStringError`; a linha segue sem tipo, como com `*`.
    .select(colunas as '*')
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
const semDescartadas = (c: Ctx) =>
  owned(c, COLUNAS_RESUMO).neq('estado->>status', RECEPCAO_SESSAO.DESCARTADA);
/** Relatório presente no resumo: `versaoCenario` é gravado em todo relatório. */
const temRelatorio = (r: any) => r.rel_versao != null;
const itemDoHistorico = (r: any) => ({
  id: r.id,
  data: r.created_at,
  status: r.status,
  titulo: r.titulo,
  nivel: r.nivel ?? null,
  nota: notaAtendimento(temRelatorio(r) ? { nota: r.nota ?? null, escalaNota: r.escala ?? undefined } : null),
  escalaOriginal: temRelatorio(r) && !r.escala ? '0-100' : null,
  situacao: r.situacao ?? null,
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
  const rows: any[] = (lidas || []).slice(0, PAGINA_HISTORICO);
  // A sessão na tela vem inteira, numa leitura de UMA linha: a do pedido ou a mais recente.
  const alvo = id || rows[0]?.id;
  let row = null;
  if (alvo) {
    const result = await owned(c).eq('id', alvo).maybeSingle();
    banco(result.error);
    if (id && !result.data) throw new RecepcaoError(404, 'Treino não encontrado.');
    row = result.data;
  }
  const cenarios = await catalogo(c);
  // A sugestão lê os 20 treinos mais recentes (mesma janela do histórico exibido).
  // Com o porquê (27/09/2026): a tela explica a sugestão e diz se há caso daquele degrau.
  const sugestao = sugerirNivelComMotivo(
    rows
      .filter((r) => r.status === RECEPCAO_SESSAO.CONCLUIDA)
      .map((r) => ({
        nivel: r.nivel ?? null,
        nota: r.nota ?? null,
        escalaNota: r.escala ?? undefined,
      })),
  );
  const nivelSugerido = sugestao.nivel;
  // Evolução por competência de quem treina (18/09/2026): maior nível alcançado, só avanço
  // (régua comum, lib/simuladores/evolucao.ts), nos treinos recentes com matriz. A partir de 2.
  const competencias = competenciasAtendimento(c.dominio);
  const comMatriz = rows
    .filter(
      (r) =>
        r.status === RECEPCAO_SESSAO.CONCLUIDA &&
        r.escala === '1-4' &&
        r.competencias?.length,
    )
    .map((r) => ({
      competencias: Object.fromEntries(
        r.competencias.map((x: { codigo: string; nota: number | null }) => [x.codigo, x.nota]),
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
    // `false` = a empresa não tem segmento escolhido; `dominio` acima é só o padrão do motor.
    segmentoDefinido: c.segmentoDefinido !== false,
    admin: c.auth.isPlatformAdmin,
    soAcompanha: c.soAcompanha,
    // Sem caso publicado no segmento, não há ficha: a tela avisa em vez de mostrar um caso de outro segmento.
    ficha: cenarios[0]?.ficha || (c.dominio === 'recepcao_medica' ? cenario.publico : null),
    cenarios,
    nivelSugerido,
    sugestao,
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
    // Só o caso e a variante do treino anterior (a repetição imediata alterna a variante).
    const anterior = await owned(c, 'id,caso:estado->cenario->>id,variante:estado->variante')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    banco(anterior.error);
    const nVariantes = 1 + (escolhido.conteudo.variantes?.length || 0);
    const variante =
      anterior.data?.caso === escolhido.conteudo.id
        ? ((Number(anterior.data.variante) || 0) + 1) % nVariantes
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
