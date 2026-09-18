import { tenantDb, type TenantDb } from '@/lib/tenant-db';
import { pontuarFechamento } from '@/lib/season-engine/fechamento-scorer';
import { agregarEvidenciasAteAcumulada, normalizarAcumuladoPrimaria } from '@/lib/season-engine/evidencias-fechamento';
import { maskColaborador, maskTextPII } from '@/lib/pii-masker';
import { desmascararResultadoFechamento, mascararExtracaoArguicao } from '@/lib/season-engine/fechamento-pii';
import { gerarEvolutionReportCore } from '@/lib/season-engine/evolution-report-core';
import { gravarProgressoSemana } from '@/lib/season-engine/progresso-semana';
import { gateAcumuladaPiloto, resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { enriquecerComRegua, sobreporNotaFresh } from '@/lib/season-engine/regua';
import {
  estadoDoFechamento, resumoDaAvaliacao,
  type EstadoFechamento, type FinalizacaoSlot,
} from '@/lib/season-engine/estado-fechamento';
import { PROGRESSO } from '@/lib/status';
import { DEGRADACAO, registrarDegradacao } from '@/lib/degradacao';
import type { ProgramaConfig } from '@/lib/season-engine/programa-config';

/**
 * Núcleo HEADLESS da pontuação do fechamento (Cenário B): sem auth, sem HTTP.
 *
 * Era a closure `finalizarComScorer` dentro de `/api/temporada/evaluation`, que
 * pontuava NO MESMO REQUEST em que a pessoa mandava a última fala da arguição:
 * turno + extração + scorer + check + relatório, ~3 minutos com o celular
 * esperando. 🔴 `Medido: 16/09/2026`: o scorer levou 119.748 ms contra o teto de
 * 120 s do `callAI`; das 3 tentativas em produção, 2 abortaram e a pessoa ficou
 * sem nota, sem erro visível e sem linha no ledger.
 *
 * Agora são dois passos, para que a nota não dependa de um request aberto:
 *
 *   1. `reservarFinalizacao` grava `feedback.finalizacao = processando` com um
 *      carimbo (o TOKEN). Síncrono e barato: a rota responde logo em seguida.
 *   2. `finalizarFechamentoCore` roda a pontuação (a rota chama dentro de
 *      `after()`, com `prazoMs`; o script de resgate chama direto, sem prazo).
 *      Só roda com o token da reserva vigente: dois cliques não pagam o scorer
 *      duas vezes.
 *
 * Quem chama passa `empresaId` = tenant da TRILHA, já provado pelo chamador
 * (`assertColabAccess` na rota). Todas as leituras vão por `tenantDb`, então um
 * `trilhaId` de outro tenant simplesmente não é encontrado.
 *
 * ⚠️ A reserva é ler-e-gravar, não atômica: duas reservas no mesmo instante
 * podem passar as duas. O token faz a segunda execução desistir se a primeira
 * regravou antes; na corrida exata, o custo é uma pontuação a mais, nunca uma
 * nota perdida.
 */

const TABELA = 'temporada_semana_progresso';

interface ContextoFechamento {
  tdb: TenantDb;
  trilha: any;
  config: ProgramaConfig;
  prog: any;
}

type Carregado = { ok: true; ctx: ContextoFechamento } | { ok: false; erro: string };

async function carregar(trilhaId: string, empresaId: string): Promise<Carregado> {
  if (!empresaId) return { ok: false, erro: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);

  const { data: trilha, error: errTrilha } = await tdb.from('trilhas')
    .select('id, colaborador_id, empresa_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados, programa_modo, programa_config')
    .eq('id', trilhaId).maybeSingle();
  if (errTrilha) return { ok: false, erro: `falha ao ler a trilha: ${errTrilha.message}` };
  if (!trilha) return { ok: false, erro: 'trilha não encontrada neste tenant' };

  const config = await resolverConfigDaTrilha(tdb, trilha);

  const { data: prog, error: errProg } = await tdb.from(TABELA)
    .select('*').eq('trilha_id', trilhaId).eq('semana', config.semanaCenarioB).maybeSingle();
  if (errProg) return { ok: false, erro: `falha ao ler o progresso do fechamento: ${errProg.message}` };

  return { ok: true, ctx: { tdb, trilha, config, prog } };
}

async function gravarFeedback(tdb: TenantDb, progId: string, feedback: any): Promise<string | null> {
  const { error } = await tdb.from(TABELA).update({ feedback }).eq('id', progId);
  return error ? error.message : null;
}

export type ReservaFinalizacao =
  | { ok: true; token: string }
  | { ok: false; estado: EstadoFechamento | 'acumulada-pendente' | 'falha'; erro?: string | null; avaliacao?: any };

export async function reservarFinalizacao(
  trilhaId: string,
  opts: { empresaId: string; agoraMs?: number },
): Promise<ReservaFinalizacao> {
  const agoraMs = opts.agoraMs ?? Date.now();
  const c = await carregar(trilhaId, opts.empresaId);
  if ('erro' in c) return { ok: false, estado: 'falha', erro: c.erro };
  const { tdb, config, prog } = c.ctx;

  const leitura = estadoDoFechamento(prog, { arguicaoAtiva: !!config.arguicao?.ativa }, agoraMs);
  if (leitura.estado === 'avaliado') {
    return { ok: false, estado: 'avaliado', avaliacao: resumoDaAvaliacao(prog?.feedback) };
  }
  if (leitura.estado !== 'pronto-para-pontuar' && leitura.estado !== 'erro') {
    return { ok: false, estado: leitura.estado, erro: leitura.erro };
  }

  // Piloto: a nota triangula com a avaliação acumulada. Sem ela pronta, pontuar
  // sairia sem triangulação (B2). A tela manda tentar de novo depois.
  if (config.modo === 'piloto') {
    const { data: acum, error: errAcum } = await tdb.from(TABELA)
      .select('acumulada_status, acumulada_started_at')
      .eq('trilha_id', trilhaId).eq('semana', config.semanaAcumulada).maybeSingle();
    if (errAcum) return { ok: false, estado: 'falha', erro: `falha ao ler a acumulada: ${errAcum.message}` };
    if (!gateAcumuladaPiloto(acum, agoraMs).pronto) return { ok: false, estado: 'acumulada-pendente' };
  }

  const token = new Date(agoraMs).toISOString();
  const finalizacao: FinalizacaoSlot = { status: 'processando', iniciada_em: token };
  const erroGravacao = await gravarFeedback(tdb, prog.id, { ...prog.feedback, finalizacao });
  if (erroGravacao) return { ok: false, estado: 'falha', erro: `falha ao reservar: ${erroGravacao}` };

  return { ok: true, token };
}

export type ResultadoFinalizacao =
  | { ok: true; avaliacao: any; auditoria: any; evolution_report: any; warnings: string[]; duracaoMs: number }
  | { ok: false; erro: string; warnings: string[]; duracaoMs: number };

export async function finalizarFechamentoCore(
  trilhaId: string,
  opts: { empresaId: string; token: string; prazoMs?: number },
): Promise<ResultadoFinalizacao> {
  const t0 = Date.now();
  const warnings: string[] = [];
  const falhar = (erro: string): ResultadoFinalizacao => ({ ok: false, erro, warnings, duracaoMs: Date.now() - t0 });

  const c = await carregar(trilhaId, opts.empresaId);
  if ('erro' in c) return falhar(c.erro);
  const { tdb, trilha, config, prog } = c.ctx;

  const dados = prog?.feedback || {};
  if (dados.finalizacao?.status !== 'processando' || dados.finalizacao?.iniciada_em !== opts.token) {
    // Outra reserva tomou o lugar (ou a semana já concluiu): esta execução não paga o scorer.
    return falhar('reserva-substituida');
  }

  const marcarErro = async (erro: string, detalhe: Record<string, unknown> = {}) => {
    const { data: atual, error: errLeitura } = await tdb.from(TABELA)
      .select('id, status, feedback').eq('id', prog.id).maybeSingle();
    if (errLeitura) {
      warnings.push(`falha ao reler o slot para marcar o erro: ${errLeitura.message}`);
    } else if (atual && atual.status !== PROGRESSO.CONCLUIDO && atual.feedback?.finalizacao?.iniciada_em === opts.token) {
      const finalizacao: FinalizacaoSlot = {
        status: 'erro', iniciada_em: opts.token, erro: erro.slice(0, 300), falhou_em: new Date().toISOString(),
      };
      const errGravar = await gravarFeedback(tdb, prog.id, { ...atual.feedback, finalizacao });
      if (errGravar) warnings.push(`falha ao marcar o erro no slot: ${errGravar}`);
    }
    await registrarDegradacao({
      fluxo: 'trilha',
      tipo: DEGRADACAO.FECHAMENTO_SCORER_FALHOU,
      chave: trilhaId,
      empresaId: trilha.empresa_id,
      colaboradorId: trilha.colaborador_id,
      severidade: 'critico',
      detalhe: { erro: erro.slice(0, 500), duracao_ms: Date.now() - t0, semana: config.semanaCenarioB, ...detalhe },
    });
    return falhar(erro);
  };

  try {
    const { data: colab, error: errColab } = await tdb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
    if (errColab) return await marcarErro(`falha ao ler o colaborador: ${errColab.message}`);

    const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
    const competenciasLabel = Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length > 1
      ? trilha.competencias_foco.join(' + ')
      : trilha.competencia_foco;
    const cenario: string = dados.cenario;
    const perguntas: any[] = Array.isArray(dados.perguntas) ? dados.perguntas : [];
    const historico: any[] = Array.isArray(dados.transcript_completo) ? dados.transcript_completo : [];

    // "resposta" = as N primeiras falas do colaborador, rotuladas por dimensão.
    // As N PRIMEIRAS de propósito: o reenvio antigo deixou falas duplicadas
    // depois delas (um caso real tem 5), e elas não são resposta a pergunta nenhuma.
    const respostasUser = historico.filter((m: any) => m.role === 'user');
    const respostaAgregada = perguntas.map((p: any, i: number) =>
      `[${p.dimensao}] ${p.texto}\n→ ${respostasUser[i]?.content || '(sem resposta)'}`,
    ).join('\n\n');

    const { masked: colabMasked, map: piiMap } = maskColaborador(colab);

    // Régua (n1-n4) + nota_pre FRESH de descriptor_assessments.
    const enriquecidos = await enriquecerComRegua({
      db: tdb, sbGlobal: tdb.raw, empresaId: null,
      competencia: trilha.competencia_foco, descritores,
      cargo: colab?.cargo ?? null,
      degradacao: { fluxo: 'trilha', chave: trilhaId, empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id },
    });
    const descritoresComRegua = await sobreporNotaFresh(tdb, trilha.colaborador_id, trilha.competencia_foco, enriquecidos);

    const { data: progAcum, error: errAcum } = await tdb.from(TABELA)
      .select('feedback').eq('trilha_id', trilhaId).eq('semana', config.semanaAcumulada).maybeSingle();
    if (errAcum) return await marcarErro(`falha ao ler a avaliação acumulada: ${errAcum.message}`);
    const acumuladoPrimaria = normalizarAcumuladoPrimaria(progAcum?.feedback?.acumulado);

    // A nota_pos NUNCA sai só do cenário: evidências de todas as semanas até a acumulada.
    const evidenciasAcumuladas = await agregarEvidenciasAteAcumulada(
      tdb, trilhaId, descritoresComRegua, config.semanaAcumulada,
      { empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id },
    );

    const resultado = await pontuarFechamento({
      competencia: competenciasLabel,
      descritores: descritoresComRegua,
      cenario,
      resposta: maskTextPII(respostaAgregada, piiMap),
      nomeColab: colabMasked.nome,
      perfilDominante: colab?.perfil_dominante,
      evidenciasAcumuladas: maskTextPII(evidenciasAcumuladas, piiMap),
      acumuladoPrimaria,
      config,
      // Fusão da arguição (Fase B): modula a nota quando a defesa oral concluiu.
      // Mascarada: a redação final e o auditor leem as citações.
      evidenciasArguicao: dados.arguicao?.concluida ? mascararExtracaoArguicao(dados.arguicao.extracao, piiMap) : null,
      prazoMs: opts.prazoMs,
      ledger: { empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id },
    });
    warnings.push(...resultado.meta.warnings);
    if ('erro' in resultado) {
      return await marcarErro(resultado.erro, { tentativas: resultado.meta.tentativas, warnings: resultado.meta.warnings });
    }

    const parsed = resultado.parsed;
    const auditoria = resultado.auditoria;
    /**
     * 🔴 TODO TEXTO AUTORAL DO RESUMO PRECISA DO UNMASK. O prompt recebe o nome
     * MASCARADO (`nomeColab: colabMasked.nome`, um `COLAB_1A2B`), então é isso
     * que a IA escreve. O `mensagem_final` (17/09/2026) é o campo mais exposto
     * de todos: o prompt manda escrever PARA a pessoa, pelo nome, e o texto é a
     * última frase do documento que ela leva para casa — sem esta linha o alias
     * sai impresso, sem erro em lugar nenhum. A lista de campos vive em
     * `fechamento-pii.ts`, a mesma da regeração do admin.
     */
    desmascararResultadoFechamento(parsed, auditoria, piiMap);

    // Relê antes de gravar: a pontuação levou minutos, e o slot é a fonte.
    const { data: atual, error: errAtual } = await tdb.from(TABELA)
      .select('id, iniciado_em, feedback').eq('id', prog.id).maybeSingle();
    if (errAtual) return await marcarErro(`falha ao reler o slot antes de gravar a nota: ${errAtual.message}`);
    const { finalizacao: _descartada, ...slotSemReserva } = atual?.feedback || dados;
    const novoSlot = {
      ...slotSemReserva, ...parsed,
      auditoria,
      cenario, transcript_completo: historico, cenario_resposta: respostaAgregada,
    };

    try {
      await gravarProgressoSemana(tdb, {
        trilha_id: trilhaId, empresa_id: trilha.empresa_id, colaborador_id: trilha.colaborador_id,
        semana: config.semanaCenarioB, tipo: 'avaliacao', status: PROGRESSO.CONCLUIDO,
        feedback: novoSlot, concluido_em: new Date().toISOString(),
      }, prog.id);
    } catch (e: any) {
      return await marcarErro(e?.message || String(e));
    }

    // A nota mudou depois do texto e a redação final não reescreveu: a nota está
    // gravada, mas a devolutiva pode contradizê-la. Não é silencioso.
    const redacao = resultado.meta.redacao;
    if (redacao === 'falhou' || redacao === 'pulada-sem-tempo') {
      await registrarDegradacao({
        fluxo: 'trilha',
        tipo: DEGRADACAO.FECHAMENTO_REDACAO_FALHOU,
        chave: trilhaId,
        empresaId: trilha.empresa_id,
        colaboradorId: trilha.colaborador_id,
        severidade: 'aviso',
        detalhe: {
          motivo: redacao,
          semana: config.semanaCenarioB,
          aviso: resultado.meta.warnings.find((w) => w.startsWith('redação final')) ?? null,
        },
      });
    }

    // Relatório: consolidação programática (sem IA). A semana JÁ está concluída;
    // falha aqui não desfaz a nota, mas não pode ser silenciosa.
    const report = await gerarEvolutionReportCore(trilhaId, { empresaId: trilha.empresa_id });
    const evolutionReport = report && 'evolution_report' in report ? report.evolution_report : null;
    if (!report?.success) {
      const motivo = report && 'error' in report ? report.error : 'motivo desconhecido';
      warnings.push(`evolution report não gerado: ${motivo}`);
      console.warn('[fechamento-core] evolution report não gerado:', trilhaId, motivo);
    }

    return {
      ok: true,
      avaliacao: resumoDaAvaliacao(novoSlot),
      auditoria,
      evolution_report: evolutionReport,
      warnings,
      duracaoMs: Date.now() - t0,
    };
  } catch (e: any) {
    return await marcarErro(e?.message || String(e));
  }
}
