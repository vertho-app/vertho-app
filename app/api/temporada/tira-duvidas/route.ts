import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat } from '@/actions/ai-client';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { assertDonoDaTrilha } from '@/lib/auth/dono-da-trilha';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { checarGatesSemana, resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { resolverDesafiosDaSemana } from '@/lib/season-engine/kit/entrega-semana';
import { getModelForTask } from '@/lib/ai-tasks';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { promptTiraDuvidas } from '@/lib/season-engine/prompts/tira-duvidas';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { retrieveContext, formatGroundingBlock } from '@/lib/rag';
import { carregarConhecimentoDescritor, formatBlocoConhecimentoDescritor, carregarModuloBaseParaTutor } from '@/lib/competencia-conhecimento';
import { carregarCargoInfo, formatBlocoCargo } from '@/lib/cargo-contexto';
import { carregarBlueprintResumo } from '@/lib/blueprint/resumo';
import { buscarConteudosRelacionados, formatConteudosRelacionadosBloco } from '@/lib/conteudos-relacionados';
import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';
import { comContexto } from '@/lib/execucao-contexto';

// callAIChat por pergunta pode levar dezenas de segundos (com retry, mais).
export const maxDuration = 300;

/** Perguntas por dia e por pessoa. Vai também no corpo do 429, para a tela dizer o número no idioma dela. */
const LIMITE_DIARIO = 10;

/**
 * Falha de LEITURA não é "não encontrado" nem "sem permissão": é a consulta que
 * não respondeu. 503 com código, para a tela oferecer "tentar de novo" em vez de
 * dizer à pessoa que a semana dela não existe.
 */
function leituraIndisponivel(onde: string, error: { message?: string } | null | undefined) {
  console.error(`[tira-duvidas] leitura de ${onde} falhou:`, error?.message);
  return NextResponse.json(
    { error: 'Não foi possível ler os dados agora. Tente de novo em instantes.', codigo: 'indisponivel' },
    { status: 503 },
  );
}

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
  // Declara o orcamento de tempo para o ledger (mig 230): sem isto toda
  // chamada de IA daqui entra como runtime "desconhecido" e a pergunta
  // "estamos perto do timeout?" fica sem denominador.
  return comContexto({ runtime: 'rota', orcamentoMs: 300 * 1000, onde: 'api/temporada/tira-duvidas' }, async () => {
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

    const { data: trilha, error: errTrilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, descritores_selecionados, temporada_plano, data_inicio, programa_modo, programa_config')
      .eq('id', trilhaId).maybeSingle();
    if (errTrilha) return leituraIndisponivel('trilha', errTrilha);
    if (!trilha) return NextResponse.json({ error: 'trilha não encontrada' }, { status: 404 });

    if (colabBody && colabBody !== trilha.colaborador_id) {
      return NextResponse.json({ error: 'colaboradorId não corresponde à trilha' }, { status: 403 });
    }
    const guard = await assertColabAccess(auth, trilha.colaborador_id);
    if (guard) return guard;
    // A pergunta fica gravada no histórico da pessoa e conta no teto diário
    // dela: só a própria pessoa pergunta (R-72).
    const dono = assertDonoDaTrilha(auth, trilha.colaborador_id);
    if (dono) return dono;

    // Gates (temporal com espelho + progressão) — fonte única em trilha-runtime
    const gate = await checarGatesSemana(sb, trilha, semana);
    if (gate) return NextResponse.json({ error: gate.error, codigo: gate.codigo }, { status: gate.status });

    const { data: colab, error: errColab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
    if (errColab) return leituraIndisponivel('colaborador', errColab);
    if (!colab) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });

    const semanaPlan = (trilha.temporada_plano || []).find(s => s.semana === Number(semana));
    if (!semanaPlan) return NextResponse.json({ error: 'semana fora do plano' }, { status: 400 });
    const competenciaSemana = resolveCompetenciaSemana(trilha, semanaPlan);

    // Carrega progresso — exige conteudo_consumido.
    const { data: prog, error: errProg } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
    if (errProg) return leituraIndisponivel('progresso da semana', errProg);
    // Régua ÚNICA (`consumiuConteudo`): isto é catraca de ROTA, não rótulo de
    // tela — com o truthy cru, um array vazio abria o tira-dúvidas para quem o
    // painel de engajamento contava como não-consumido.
    //
    // A mensagem NÃO manda "marcar como realizado": esse botão saiu em 27/08 e a
    // pessoa que a lia procurava o que não existe (R-124). O que abre o consumo é
    // abrir um dos formatos do conteúdo; o `codigo` deixa a tela dizer isso no
    // idioma dela e tentar gravar a abertura de novo.
    if (!consumiuConteudo(prog?.conteudo_consumido)) {
      return NextResponse.json({
        error: 'Abra um dos formatos do conteúdo desta semana antes de tirar dúvidas.',
        codigo: 'conteudo-nao-aberto',
      }, { status: 403 });
    }

    // Rate limit: máx 10 perguntas por dia por colab (feature=tira_duvidas).
    // Evita abuso + custo descontrolado. Janela de 24h.
    const { count: usoHoje, error: errUso } = await sb.from('ia_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', trilha.colaborador_id)
      .eq('feature', 'tira_duvidas')
      .is('source', null) // conta só as linhas do próprio route (1/resposta); a do wrapper é source='wrapper'
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    // Sem checar, a falha da contagem virava "0 perguntas hoje" e o teto diário
    // deixava de valer justamente quando o banco está instável.
    if (errUso) return leituraIndisponivel('perguntas do dia', errUso);
    if ((usoHoje || 0) >= LIMITE_DIARIO) {
      return NextResponse.json({
        error: `Você atingiu o limite diário (${LIMITE_DIARIO} perguntas) do Tira-Dúvidas. Tente de novo amanhã.`,
        codigo: 'limite-diario',
        limite: LIMITE_DIARIO,
      }, { status: 429 });
    }

    const dados = prog?.tira_duvidas || { transcript_completo: [] };
    const historico = Array.isArray(dados.transcript_completo) ? dados.transcript_completo : [];
    historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Conteúdo que o colaborador RECEBEU nesta semana — o tutor precisa conhecer
    // para falar a mesma linguagem. Junta o enquadramento da semana + (best-effort)
    // o corpo real do micro-conteúdo consumido (via core_id).
    const c = semanaPlan.conteudo || {};

    // O DESAFIO REAL da semana (R-124). `conteudo.desafio_texto` gravado no plano é
    // o PLACEHOLDER do build ("Aplique {descritor}..."): o desafio de verdade vem do
    // kit, por (DISC x cargo), e é o que a pessoa lê no card da semana. Esta rota
    // montava o contexto do tutor com o texto gravado, então ele explicava uma tarefa
    // que a tela não mostra. A fonte é a mesma da conversa de Evidências
    // (`resolverDesafiosDaSemana`, com a unificação por competência da Jornada).
    // Falha aqui degrada para o texto do plano, como os outros blocos de contexto.
    let desafios: Array<{ competencia: string; desafio_texto: string; acao_observavel?: string; criterio_de_execucao?: string }> | null = null;
    try {
      const programaConfig = await resolverConfigDaTrilha(sb, trilha);
      desafios = await resolverDesafiosDaSemana(sb, semanaPlan, {
        empresaId: trilha.empresa_id,
        disc: String(colab.perfil_dominante || '').trim().charAt(0).toUpperCase(),
        cargo: colab.cargo,
        competenciaFallback: competenciaSemana,
        desafioUnicoPorCompetencia: programaConfig.desafioUnicoPorCompetencia,
        // Os gates de semana já passaram: uma tarefa de par ausente aqui é
        // experiência de alguém, e vai para o degradacao_log.
        colaboradorId: trilha.colaborador_id,
      });
    } catch (err) {
      console.warn('[tira-duvidas] desafio do kit falhou (usando o do plano):', err?.message);
    }
    const blocoDesafio = desafios?.length
      ? desafios.map((d) => [
          desafios!.length > 1 && d.competencia ? `Desafio (${d.competencia}): ${d.desafio_texto}` : `Desafio: ${d.desafio_texto}`,
          d.acao_observavel && `Ação observável: ${d.acao_observavel}`,
          d.criterio_de_execucao && `Critério de execução: ${d.criterio_de_execucao}`,
        ].filter(Boolean).join('\n')).join('\n')
      : null;

    const enquadramento = Array.isArray(semanaPlan.conteudos_dia) && semanaPlan.conteudos_dia.length > 0
      ? [
          ...semanaPlan.conteudos_dia.map((e: any) => [
            e.label, e.competencia, e.descritor, e.conteudo?.core_titulo,
            // Sem o desafio do kit, o do plano segue como antes.
            blocoDesafio ? null : e.conteudo?.desafio_texto,
          // O separador é o mesmo de sempre (travessão), por escape: o texto que o tutor lê não muda.
          ].filter(Boolean).join(' \u2014 ')),
          blocoDesafio,
        ].filter(Boolean).join('\n')
      : [
          c.core_titulo && `Título: ${c.core_titulo}`,
          blocoDesafio || [
            c.desafio_texto && `Desafio: ${c.desafio_texto}`,
            c.acao_observavel && `Ação observável: ${c.acao_observavel}`,
            c.criterio_de_execucao && `Critério de execução: ${c.criterio_de_execucao}`,
          ].filter(Boolean).join('\n'),
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

    // PII masking: substitui nome real por alias opaco antes de mandar pra IA.
    // Calculado ANTES da busca: a pergunta também sai do servidor ali.
    const { masked: colabMasked, map: piiMap } = maskColaborador(colab);

    // RAG/grounding: busca top-5 trechos relevantes na base do tenant.
    // Query = última pergunta do colab. Sem pesquisa = sem contexto (OK).
    // 🔴 Mascarada: a busca híbrida gera o vetor da pergunta num provedor
    // externo de embeddings, e até 03/10/2026 a pergunta ia crua, com o nome e
    // o que mais a pessoa tivesse digitado (R-05).
    let groundingBlock = '';
    try {
      const chunks = await retrieveContext(trilha.empresa_id, maskTextPII(message, piiMap), 5);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err) {
      console.warn('[tira-duvidas] retrieveContext falhou (seguindo sem grounding):', err?.message);
    }

    // Conhecimento curado do descritor (SÓ a definição — rubrica fica de fora por
    // segurança) + Módulo-Base pedagógico (quando autorado; hoje fallback vazio).
    let conhecimentoDescritor = '';
    try {
      const conhecimento = await carregarConhecimentoDescritor(
        sb, trilha.empresa_id, semanaPlan.descritor, competenciaSemana, colab.cargo,
      );
      const blocoDescritor = formatBlocoConhecimentoDescritor(conhecimento);

      const nivelMin = typeof semanaPlan.nivel_atual === 'number' ? semanaPlan.nivel_atual : 1.5;
      const blocoModulo = await carregarModuloBaseParaTutor(sb, {
        competenciaNome: competenciaSemana,
        nivelMin, // locale default pt-BR; contexto pedagógico resolvido no engine de geração
        empresaId: trilha.empresa_id,
        cargo: colab.cargo,
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

    // O modelo da TAREFA, não uma constante (R-124). O seletor "Tira-Dúvidas da
    // semana" da tela de IA da empresa grava em `sys_config.ai`, e esta rota o
    // ignorava: a config existia sem consumidor. Sem nada configurado o resultado é
    // o de sempre, Sonnet 4.6 (o `FALLBACK_GLOBAL` de `lib/ai-tasks`). O ledger
    // grava o modelo que RODOU, não o que se imagina que roda.
    const modelo = await getModelForTask(trilha.empresa_id, 'tira_duvidas');

    let respostaIA;
    try {
      // Sonnet 4.6 por padrão: mais capaz para ancorar a explicação no conhecimento
      // do descritor + conteúdo recebido + módulo-base, mantendo o escopo.
      // HISTORY CACHING (S3/L1) ligado 20/07 — system (conteúdo da semana) +
      // histórico lidos a 0,1× nos turnos seguintes da MESMA conversa. Kill
      // switch sem deploy: IA_CACHE_HISTORY=0.
      respostaIA = (await callAIChat(system, messages as any, { model: modelo }, 1500, {
        taskKey: 'tira_duvidas', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id,
        cacheHistory: process.env.IA_CACHE_HISTORY !== '0',
      })).trim();
    } catch (err) {
      console.error('[tira-duvidas] callAIChat:', err);
      return NextResponse.json({ error: 'Erro na IA', codigo: 'ia' }, { status: 500 });
    }

    // Despersonaliza: troca aliases de volta por nomes reais antes de exibir
    respostaIA = unmaskPII(respostaIA, piiMap);

    historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString() });

    // O que a gravação perdida significa (R-140): a IA JÁ respondeu e foi paga. Não
    // dá para falhar a rota e mandar a pessoa perguntar de novo (pagaria outra
    // resposta, e a que ela vai ler seria outra), e não dá para dizer 200 como se
    // tudo tivesse ficado guardado. Responde com a resposta e com `salvo: false`; a
    // tela avisa que ela não ficará no histórico. É ENTREGA, então degrada, mas
    // registrando.
    const chaveDeg = `${trilha.colaborador_id}:${trilhaId}:${semana}`;
    const perdeu = async (oQue: 'historico' | 'contagem', motivo: string) => {
      console.error(`[tira-duvidas] gravação de ${oQue} falhou:`, motivo);
      await registrarDegradacao({
        fluxo: 'chat',
        tipo: DEGRADACAO.TIRA_DUVIDAS_NAO_GRAVADO,
        chave: chaveDeg,
        empresaId: trilha.empresa_id,
        colaboradorId: trilha.colaborador_id,
        severidade: 'aviso',
        detalhe: { o_que: oQue, semana: Number(semana), motivo },
      }, sb);
    };

    // Persiste APENAS no campo tira_duvidas. Não mexe em status/reflexao/feedback.
    const novoDados = { ...dados, transcript_completo: historico };
    const { error: errHistorico } = await sb.from('temporada_semana_progresso')
      .update({ tira_duvidas: novoDados })
      .eq('id', prog.id).eq('empresa_id', trilha.empresa_id);
    if (errHistorico) await perdeu('historico', errHistorico.message);

    // Telemetria: log da chamada pra rate limit futuro + custo. É ela que o teto
    // diário conta: sem a linha, a pergunta não pesa no limite.
    const { error: errLog } = await sb.from('ia_usage_log').insert({
      empresa_id: trilha.empresa_id,
      colaborador_id: trilha.colaborador_id,
      feature: 'tira_duvidas',
      trilha_id: trilhaId,
      semana: Number(semana),
      model: modelo,
      // tokens aprox: sistema+histórico médio; valores precisos precisariam parse da response
      input_tokens: Math.round((system.length + JSON.stringify(messages).length) / 4),
      output_tokens: Math.round(respostaIA.length / 4),
    });
    if (errLog) await perdeu('contagem', errLog.message);

    return NextResponse.json({ message: respostaIA, history: historico, salvo: !errHistorico });
  } catch (err) {
    console.error('[tira-duvidas]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
  });
}

function resolveCompetenciaSemana(trilha: any, semanaPlan: any): string {
  if (semanaPlan.competencia) return semanaPlan.competencia;
  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  const match = descritores.find((d: any) => d.descritor === semanaPlan.descritor && d.competencia);
  return match?.competencia || trilha.competencia_foco;
}
