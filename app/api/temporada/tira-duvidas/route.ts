import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat } from '@/actions/ai-client';
import { promptTiraDuvidas } from '@/lib/season-engine/prompts/tira-duvidas';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { retrieveContext, formatGroundingBlock } from '@/lib/rag';

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
    const { trilhaId, semana, message } = await request.json();
    if (!trilhaId || !semana || !message) {
      return NextResponse.json({ error: 'trilhaId+semana+message obrigatórios' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();

    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, temporada_plano, data_inicio')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha não encontrada' }, { status: 404 });

    // Gates idênticos a reflection
    const { semanaLiberadaPorData, formatarLiberacao } = await import('@/lib/season-engine/week-gating');
    if (!semanaLiberadaPorData(trilha.data_inicio, semana)) {
      return NextResponse.json({
        error: `Semana ${semana} ainda bloqueada. Libera ${formatarLiberacao(trilha.data_inicio, semana)}.`,
      }, { status: 403 });
    }
    if (Number(semana) > 1) {
      const { data: prev } = await sb.from('temporada_semana_progresso')
        .select('status').eq('trilha_id', trilhaId).eq('semana', Number(semana) - 1).maybeSingle();
      if (prev?.status !== 'concluido') {
        return NextResponse.json({ error: `Conclua a semana ${Number(semana) - 1} antes.` }, { status: 403 });
      }
    }

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
    if (!colab) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });

    const semanaPlan = (trilha.temporada_plano || []).find(s => s.semana === Number(semana));
    if (!semanaPlan) return NextResponse.json({ error: 'semana fora do plano' }, { status: 400 });

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
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if ((usoHoje || 0) >= 10) {
      return NextResponse.json({
        error: 'Você atingiu o limite diário (10 perguntas) do Tira-Dúvidas. Tente de novo amanhã.',
      }, { status: 429 });
    }

    const dados = prog?.tira_duvidas || { transcript_completo: [] };
    const historico = Array.isArray(dados.transcript_completo) ? dados.transcript_completo : [];
    historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Resumo do conteúdo: concatena desafio + descrição se houver
    const conteudoResumo = [
      semanaPlan.conteudo?.desafio_texto,
      semanaPlan.conteudo?.core_titulo,
    ].filter(Boolean).join('\n');

    // RAG/grounding: busca top-5 trechos relevantes na base do tenant.
    // Query = última pergunta do colab. Sem pesquisa = sem contexto (OK).
    let groundingBlock = '';
    try {
      const chunks = await retrieveContext(trilha.empresa_id, message, 5);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err) {
      console.warn('[tira-duvidas] retrieveContext falhou (seguindo sem grounding):', err?.message);
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
      competencia: trilha.competencia_foco,
      descritor: semanaPlan.descritor,
      conteudoResumo,
      perfilDominante: colab.perfil_dominante,
      historico: historicoMasked,
      groundingContext: groundingBlock,
    });

    let respostaIA;
    try {
      // Haiku 4.5: rápido e barato; o prompt é prescritivo o suficiente.
      respostaIA = (await callAIChat(system, messages as any, { model: 'claude-haiku-4-5-20251001' }, 1500)).trim();
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
      model: 'claude-haiku-4-5-20251001',
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
