import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat } from '@/actions/ai-client';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { checarGatesSemana } from '@/lib/season-engine/trilha-runtime';
import { promptTiraDuvidas } from '@/lib/season-engine/prompts/tira-duvidas';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { retrieveContext, formatGroundingBlock } from '@/lib/rag';
import { carregarConhecimentoDescritor, formatBlocoConhecimentoDescritor, carregarModuloBaseParaTutor } from '@/lib/competencia-conhecimento';
import { carregarCargoInfo, formatBlocoCargo } from '@/lib/cargo-contexto';
import { carregarBlueprintResumo } from '@/lib/blueprint/resumo';
import { buscarConteudosRelacionados, formatConteudosRelacionadosBloco } from '@/lib/conteudos-relacionados';

// callAIChat por pergunta pode levar dezenas de segundos (com retry, mais).
export const maxDuration = 300;

/**
 * POST /api/temporada/tira-duvidas
 * Body: { trilhaId, semana, message }
 *
 * Chat livre (sem init, sem limite de turnos) focado no descritor da
 * semana. NÃO altera status da semana. Persiste em
 * temporada_semana_progresso.tira_duvidas (campo separado de reflexao).
 *
 * Pré-requisito: conteudo_consumido === true (igual Evidências).
 * Gates temporais idênticos aos demais endpoints.
 */
export async function POST(request) {
  try {
    const csrf = csrfCheck(request);
    if (csrf) return csrf;

    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const limited = await aiLimiter.check(request, auth.email);
    if (limited) return limited;

    const body = await request.json();
    const { trilhaId, semana, message, colaboradorId: colabBody } = body;
    if (!trilhaId || !semana || !message) {
      return NextResponse.json({ error: 'trilhaId+semana+message obrigatórios' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();

    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, descritores_selecionados, temporada_plano, data_inicio')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha não encontrada' }, { status: 404 });

    if (colabBody && colabBody !== trilha.colaborador_id) {
      return NextResponse.json({ error: 'colaboradorId não corresponde à trilha' }, { status: 403 });
    }
    const guard = await assertColabAccess(auth, trilha.colaborador_id);
    if (guard) return guard;

    // Gates (temporal com espelho + progressão) — fonte única em trilha-runtime
    const gate = await checarGatesSemana(sb, trilha, semana);
    if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
    if (!colab) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });

    const semanaPlan = (trilha.temporada_plano || []).find(s => s.semana === Number(semana));
    if (!semanaPlan) return NextResponse.json({ error: 'semana fora do plano' }, { status: 400 });
    const competenciaSemana = resolveCompetenciaSemana(trilha, semanaPlan);

    // Carrega progresso — exige conteudo_consumido.
    const { data: prog } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
    if (!prog?.conteudo_consumido) {
      return NextResponse.json({ error: 'Marque o conteúdo como realizado antes de tirar dúvidas.' }, { status: 403 });
    }

    // Rate limit: máx 10 perguntas por dia por colab (feature=tira_duvidas).
    // Evita abuso + custo descontrolado. Janela de 24h.
    const { count: usoHoje } = await sb.from('ia_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', trilha.colaborador_id)
      .eq('feature', 'tira_duvidas')
      .is('source', null) // conta só as linhas do próprio route (1/resposta); a do wrapper é source='wrapper'
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if ((usoHoje || 0) >= 10) {
      return NextResponse.json({
        error: 'Você atingiu o limite diário (10 perguntas) do Tira-Dúvidas. Tente de novo amanhã.',
      }, { status: 429 });
    }

    const dados = prog?.tira_duvidas || { transcript_completo: [] };
    const historico = Array.isArray(dados.transcript_completo) ? dados.transcript_completo : [];
    historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Conteúdo que o colaborador RECEBEU nesta semana — o tutor precisa conhecer
    // para falar a mesma linguagem. Junta o enquadramento da semana + (best-effort)
    // o corpo real do micro-conteúdo consumido (via core_id).
    const c = semanaPlan.conteudo || {};
    const enquadramento = Array.isArray(semanaPlan.conteudos_dia) && semanaPlan.conteudos_dia.length > 0
      ? semanaPlan.conteudos_dia
          .map((e: any) => [e.label, e.competencia, e.descritor, e.conteudo?.core_titulo, e.conteudo?.desafio_texto].filter(Boolean).join(' — '))
          .join('\n')
      : [
          c.core_titulo && `Título: ${c.core_titulo}`,
          c.desafio_texto && `Desafio: ${c.desafio_texto}`,
          c.acao_observavel && `Ação observável: ${c.acao_observavel}`,
          c.criterio_de_execucao && `Critério de execução: ${c.criterio_de_execucao}`,
          c.por_que_cabe_na_semana && `Por que importa: ${c.por_que_cabe_na_semana}`,
        ].filter(Boolean).join('\n');

    // Corpo real do conteúdo consumido (texto inline), se existir e couber.
    let corpoConteudo = '';
    try {
      if (c.core_id) {
        const { data: mc } = await sb.from('micro_conteudos')
          .select('conteudo_inline').eq('id', c.core_id).maybeSingle();
        if (mc?.conteudo_inline) corpoConteudo = String(mc.conteudo_inline).slice(0, 2500);
      }
    } catch (err) {
      console.warn('[tira-duvidas] micro_conteudo inline falhou:', err?.message);
    }
    const conteudoResumo = [enquadramento, corpoConteudo && `\nCONTEÚDO LIDO PELO COLABORADOR:\n${corpoConteudo}`]
      .filter(Boolean).join('\n');

    // RAG/grounding: busca top-5 trechos relevantes na base do tenant.
    // Query = última pergunta do colab. Sem pesquisa = sem contexto (OK).
    let groundingBlock = '';
    try {
      const chunks = await retrieveContext(trilha.empresa_id, message, 5);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err) {
      console.warn('[tira-duvidas] retrieveContext falhou (seguindo sem grounding):', err?.message);
    }

    // Conhecimento curado do descritor (SÓ a definição — rubrica fica de fora por
    // segurança) + Módulo-Base pedagógico (quando autorado; hoje fallback vazio).
    let conhecimentoDescritor = '';
    try {
      const conhecimento = await carregarConhecimentoDescritor(
        sb, trilha.empresa_id, semanaPlan.descritor, competenciaSemana,
      );
      const blocoDescritor = formatBlocoConhecimentoDescritor(conhecimento);

      const nivelMin = typeof semanaPlan.nivel_atual === 'number' ? semanaPlan.nivel_atual : 1.5;
      const blocoModulo = await carregarModuloBaseParaTutor(sb, {
        competenciaNome: competenciaSemana,
        nivelMin, // locale default pt-BR; contexto pedagógico resolvido no engine de geração
        empresaId: trilha.empresa_id,
      });

      conhecimentoDescritor = [blocoDescritor, blocoModulo].filter(Boolean).join('\n\n');
    } catch (err) {
      console.warn('[tira-duvidas] conhecimento de competência falhou (seguindo sem):', err?.message);
    }

    // Contexto da função (cargos_empresa) — ancora as orientações no cargo.
    let cargoContexto = '';
    try {
      const cargoInfo = await carregarCargoInfo(sb, trilha.empresa_id, colab.cargo);
      cargoContexto = formatBlocoCargo(cargoInfo, null);
    } catch (err) {
      console.warn('[tira-duvidas] contexto de cargo falhou (seguindo sem):', err?.message);
    }

    // Plano de desenvolvimento — escopado à competência DA SEMANA (escopo travado).
    let blueprintResumo = '';
    try {
      blueprintResumo = await carregarBlueprintResumo(sb, trilha.colaborador_id, { competenciaFoco: competenciaSemana });
    } catch (err) {
      console.warn('[tira-duvidas] blueprint falhou (seguindo sem):', err?.message);
    }

    // Saiba mais — outros conteúdos do descritor da semana (exclui o já consumido).
    let conteudosRelacionados = '';
    try {
      const nivelC = typeof semanaPlan.nivel_atual === 'number' ? semanaPlan.nivel_atual : 1.5;
      const rel = await buscarConteudosRelacionados(sb, {
        competencia: competenciaSemana, descritor: semanaPlan.descritor,
        nivel: nivelC, cargo: colab.cargo, empresaId: trilha.empresa_id,
        excluirIds: c.core_id ? [c.core_id] : [],
      });
      conteudosRelacionados = formatConteudosRelacionadosBloco(rel);
    } catch (err) {
      console.warn('[tira-duvidas] conteúdos relacionados falhou (seguindo sem):', err?.message);
    }

    // PII masking: substitui nome real por alias opaco antes de mandar pra IA
    const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
    // Sanitiza histórico (substitui PII do texto + nome do colab por alias)
    const historicoMasked = historico.map((m: any) => ({
      ...m,
      content: maskTextPII(m.content, piiMap),
    })) as any;

    const { system, messages } = promptTiraDuvidas({
      nomeColab: colabMasked.nome,
      cargo: colab.cargo,
      competencia: competenciaSemana,
      descritor: semanaPlan.descritor,
      conteudoResumo,
      perfilDominante: colab.perfil_dominante,
      historico: historicoMasked,
      groundingContext: groundingBlock,
      conhecimentoDescritor,
      cargoContexto,
      // Blueprint pode citar o nome do colab (foco_geral) → mascara. Conteúdos
      // são títulos/links do catálogo, sem PII.
      blueprintResumo: blueprintResumo ? maskTextPII(blueprintResumo, piiMap) : '',
      conteudosRelacionados,
    });

    let respostaIA;
    try {
      // Sonnet 5: mais capaz para ancorar a explicação no conhecimento do
      // descritor + conteúdo recebido + módulo-base, mantendo o escopo.
      // HISTORY CACHING (S3/L1) ligado 20/07 — system (conteúdo da semana) +
      // histórico lidos a 0,1× nos turnos seguintes da MESMA conversa. Kill
      // switch sem deploy: IA_CACHE_HISTORY=0.
      respostaIA = (await callAIChat(system, messages as any, { model: 'claude-sonnet-5' }, 1500, {
        taskKey: 'tira_duvidas', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id,
        cacheHistory: process.env.IA_CACHE_HISTORY !== '0',
      })).trim();
    } catch (err) {
      console.error('[tira-duvidas] callAIChat:', err);
      return NextResponse.json({ error: 'Erro na IA' }, { status: 500 });
    }

    // Despersonaliza: troca aliases de volta por nomes reais antes de exibir
    respostaIA = unmaskPII(respostaIA, piiMap);

    historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString() });

    // Persiste APENAS no campo tira_duvidas. Não mexe em status/reflexao/feedback.
    const novoDados = { ...dados, transcript_completo: historico };
    await sb.from('temporada_semana_progresso')
      .update({ tira_duvidas: novoDados })
      .eq('id', prog.id);

    // Telemetria — log da chamada pra rate limit futuro + custo
    await sb.from('ia_usage_log').insert({
      empresa_id: trilha.empresa_id,
      colaborador_id: trilha.colaborador_id,
      feature: 'tira_duvidas',
      trilha_id: trilhaId,
      semana: Number(semana),
      model: 'claude-sonnet-5',
      // tokens aprox: sistema+histórico médio; valores precisos precisariam parse da response
      input_tokens: Math.round((system.length + JSON.stringify(messages).length) / 4),
      output_tokens: Math.round(respostaIA.length / 4),
    });

    return NextResponse.json({ message: respostaIA, history: historico });
  } catch (err) {
    console.error('[tira-duvidas]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}

function resolveCompetenciaSemana(trilha: any, semanaPlan: any): string {
  if (semanaPlan.competencia) return semanaPlan.competencia;
  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  const match = descritores.find((d: any) => d.descritor === semanaPlan.descritor && d.competencia);
  return match?.competencia || trilha.competencia_foco;
}
