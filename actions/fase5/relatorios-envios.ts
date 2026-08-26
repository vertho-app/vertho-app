'use server';

import { tenantDb } from '@/lib/tenant-db';
import { mapComLimite } from '@/lib/concurrency';
import { tenantEmailFrom, tenantUrl } from '@/lib/domain';
import { callAI, type AIConfig } from '../ai-client';
import { extractJSON } from '../utils';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { gateEnvioDemo } from '@/lib/demo/envio-guard';
import { TEMP, upsertRelatorioAgregado } from './_shared';
import { gerarEvolucaoFusao } from './evolucao';

// ══════════════════════════════════════════════════════════════════════════════
// 7. FUNÇÕES AUXILIARES (compatibilidade)
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarRelatoriosEvolucaoLote(empresaId: string, aiConfig: AIConfig = {}) {
  await requireAdminAction('ai.audit.regenerate');
  return gerarEvolucaoFusao(empresaId, aiConfig);
}

export async function gerarRelatorioRHManual(empresaId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: relEvolucao } = await tdb.from('relatorios').select('*, colaboradores(nome_completo, cargo)').eq('tipo', 'evolucao');
    const { data: relRHAnterior } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'rh').maybeSingle();
    const { data: relPlenaria } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'plenaria_evolucao').maybeSingle();

    const system = `Você é um consultor estratégico de RH da plataforma Vertho.

Sua tarefa é gerar um RELATÓRIO DE RH PÓS-CICLO, com base em:
- um relatório anterior de RH
- e os dados agregados de evolução após o ciclo de desenvolvimento

ATENÇÃO:
Este relatório não é um resumo institucional genérico.
Não é um texto de comemoração.
Não é uma peça de marketing.
Ele deve ser um relatório executivo, analítico e útil para decisão de RH.

OBJETIVO CENTRAL:
Comparar o diagnóstico anterior com a evolução observada e produzir leitura estratégica sobre:
- o que mudou
- o que permaneceu
- o que vale sustentar
- o que precisa entrar no próximo ciclo
- que tipo de retorno organizacional o desenvolvimento parece ter gerado

PRINCÍPIOS INEGOCIÁVEIS:
1. Seja estratégico e orientado a decisão.
2. Compare sempre "antes x depois".
3. Não force impacto onde a base for fraca.
4. Celebre avanços reais, sem inflar conclusões.
5. Diferencie claramente gap resolvido, mitigado e persistente.
6. Use linguagem executiva, clara e útil.
7. Toda recomendação relevante deve ter conexão com os dados.
8. Quando houver limitação metodológica, explicite.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const userBlocks: string[] = [];
    userBlocks.push(`═══ EMPRESA ═══\n${empresa.nome} (${empresa.segmento})`);

    if (relRHAnterior?.conteudo) {
      userBlocks.push(`═══ RELATÓRIO RH ANTERIOR (baseline) ═══\n${JSON.stringify(relRHAnterior.conteudo, null, 2).slice(0, 3000)}`);
    }

    if (relPlenaria?.conteudo) {
      userBlocks.push(`═══ PLENÁRIA DE EVOLUÇÃO ═══\n${JSON.stringify(relPlenaria.conteudo, null, 2).slice(0, 3000)}`);
    }

    // Dados de evolução (anônimos — só cargo + conteúdo)
    const evolucaoAnonima = (relEvolucao || []).map((r: any) => ({
      cargo: r.colaboradores?.cargo,
      competencia: r.conteudo?.competencia,
      resumo: r.conteudo?.resumo_executivo?.leitura_geral || r.conteudo?.resumo_executivo?.sintese || '',
      convergencias: (r.conteudo?.evolucao_por_descritor || []).map((d: any) => d.convergencia),
      gaps: r.conteudo?.gaps_persistentes || [],
      ganhos: r.conteudo?.ganhos_qualitativos || [],
    }));
    userBlocks.push(`═══ EVOLUÇÃO AGREGADA (${evolucaoAnonima.length} colaboradores — anônimo) ═══\n${JSON.stringify(evolucaoAnonima, null, 2)}`);

    userBlocks.push(`FORMATO DE SAÍDA (JSON):
{
  "resumo_executivo": {
    "leitura_geral": "síntese executiva do que o ciclo entregou",
    "principal_ganho": "texto curto",
    "principal_lacuna_remanescente": "texto curto"
  },
  "roi_desenvolvimento": {
    "leitura": "interpretação prudente do retorno do ciclo",
    "sinais_de_retorno": ["sinal 1", "sinal 2"],
    "limites_da_inferencia": ["limite 1"]
  },
  "evolucao_organizacional": {
    "sintese": "texto curto",
    "ganhos_mais_consistentes": ["ganho 1"],
    "evidencias_agregadas": ["evidência 1"]
  },
  "gaps_resolvidos": [
    {"gap": "nome", "o_que_mudou": "síntese da evolução", "grau_resolucao": "resolvido|mitigado"}
  ],
  "gaps_persistentes": [
    {"gap": "nome", "por_que_permanece": "síntese curta", "risco_organizacional": "texto curto"}
  ],
  "recomendacoes_estrategicas": [
    {"recomendacao": "ação estratégica", "horizonte": "curto|medio|longo", "justificativa": "por que agora"}
  ],
  "proximos_ciclos": {
    "focos_prioritarios": ["foco 1"],
    "publicos_prioritarios": ["público 1"],
    "formatos_recomendados": ["formato 1"],
    "criterio_de_priorizacao": "lógica usada"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- comparar diagnóstico anterior x evolução atual
- evitar afirmações causais absolutas
- roi_desenvolvimento prudente e útil
- máximo 5 recomendações estratégicas
- máximo 5 focos prioritários
- sem linguagem genérica que serviria para qualquer empresa`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
    const relatorio = await extractJSON(resultado);
    if (relatorio) {
      await upsertRelatorioAgregado(tdb, 'rh_manual', relatorio);
    }
    return { success: true, message: 'Relatório RH manual gerado' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarRelatorioPlenaria(empresaId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: plenaria } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'plenaria_evolucao').maybeSingle();
    if (!plenaria) return { success: false, error: 'Plenária de evolução não encontrada.' };
    const { data: empresa } = await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: relRH } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'rh_manual').maybeSingle();

    const system = `Você é um redator executivo institucional da Vertho.

Sua tarefa é transformar os dados consolidados de uma plenária de evolução em um RELATÓRIO FORMAL DE PLENÁRIA, claro, organizado e útil para registro institucional e tomada de decisão.

ATENÇÃO:
Este relatório não é uma ata literal.
Não é uma transcrição de reunião.
Não é um texto genérico de consultoria.
Ele deve ser um documento formal, executivo e acionável.

PRINCÍPIOS INEGOCIÁVEIS:
1. Mantenha anonimato dos participantes e dados individuais.
2. Diferencie claramente dado apresentado de decisão tomada.
3. Não invente consenso, fala ou encaminhamento.
4. Organize o relatório com clareza institucional.
5. Seja formal, mas sem burocracia excessiva.
6. O relatório deve ser útil para leitura posterior e memória do ciclo.
7. Valorize avanços reais sem esconder gaps importantes.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const userBlocks: string[] = [];
    userBlocks.push(`═══ EMPRESA ═══\n${empresa.nome} (${empresa.segmento})\nData: ${new Date().toISOString().split('T')[0]}`);
    userBlocks.push(`═══ DADOS DA PLENÁRIA DE EVOLUÇÃO ═══\n${JSON.stringify(plenaria.conteudo, null, 2).slice(0, 5000)}`);
    if (relRH?.conteudo) {
      userBlocks.push(`═══ RELATÓRIO RH (contexto estratégico) ═══\n${JSON.stringify(relRH.conteudo, null, 2).slice(0, 2000)}`);
    }

    userBlocks.push(`FORMATO DE SAÍDA (JSON):
{
  "identificacao": {
    "titulo": "Relatório de Plenária de Evolução",
    "empresa": "${empresa.nome}",
    "competencia_ou_escopo": "competência, programa ou escopo da plenária",
    "periodo_referente": "texto curto",
    "data_relatorio": "${new Date().toISOString().split('T')[0]}"
  },
  "pauta": {
    "objetivo_da_plenaria": "texto curto",
    "topicos_principais": ["tópico 1", "tópico 2"]
  },
  "resultados_apresentados": {
    "visao_geral": "síntese executiva dos resultados apresentados",
    "destaques_positivos": ["destaque 1"],
    "pontos_de_atencao": ["ponto 1"]
  },
  "leitura_institucional": {
    "interpretacao_geral": "texto curto",
    "tensoes_relevantes": ["tensão 1"],
    "implicacoes_para_o_negocio_ou_operacao": ["implicação 1"]
  },
  "deliberacoes": [
    {"deliberacao": "decisão ou consenso assumido", "justificativa": "por que fez sentido"}
  ],
  "encaminhamentos": [
    {"encaminhamento": "ação definida", "responsavel_tipo": "RH|lideranca|gestor|empresa", "horizonte": "imediato|curto|medio", "objetivo": "o que busca produzir"}
  ],
  "fechamento_executivo": {
    "sintese_final": "síntese curta e formal",
    "proximo_marco_sugerido": "texto curto"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- manter linguagem formal e clara
- não citar nomes de participantes
- resultados_apresentados deve refletir o que foi mostrado
- deliberacoes só devem aparecer quando defensáveis
- encaminhamentos claros e acionáveis
- máximo 6 deliberações, máximo 8 encaminhamentos
- sem linguagem genérica que serviria para qualquer plenária`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
    const relatorio = await extractJSON(resultado);
    if (relatorio) {
      await upsertRelatorioAgregado(tdb, 'plenaria_relatorio', relatorio);
    }
    return { success: true, message: 'Relatório formal da plenária gerado' };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function enviarLinksPerfil(empresaId: string) {
  // Gate TENANT-SCOPED (auditoria 23/07): dispara e-mail pro roster inteiro —
  // o empresaId vem do client e precisa bater com o tenant da sessão.
  const sbRaw = await requireEmpresaSupabase(empresaId, 'assessments.dispatch', 'enviarLinksPerfil');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  // Tenant de demonstração: bloqueia disparo real antes de tocar colaboradores.
  const gate = await gateEnvioDemo(empresaId);
  if (gate.blocked) return { success: false, error: gate.motivo };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas').select('nome, slug').eq('id', empresaId).single();
    const { data: colaboradores } = await tdb.from('colaboradores').select('id, nome_completo, email');
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    // E-mails em paralelo (limite 5 — rate limit do Resend)
    const envios = await mapComLimite(colaboradores as any[], 5, async (colab: any) => {
      try {
        await resend.emails.send({
          from: tenantEmailFrom(empresa.slug, 'Vertho Mentor'),
          to: colab.email,
          subject: `[${empresa.nome}] Seu Perfil de Evolução`,
          html: `<p>Olá ${colab.nome_completo}!</p><p>Seu perfil está disponível.</p><p><a href="${tenantUrl(empresa.slug, '/dashboard/evolucao')}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Acessar Perfil</a></p>`,
        });
        return true;
      } catch { return false; }
    });
    const enviados = envios.filter(Boolean).length;
    return { success: true, message: `${enviados} links enviados` };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarDossieGestor(empresaId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: todos } = await tdb.from('relatorios').select('tipo, conteudo, colaboradores(nome_completo, cargo)');
    const { data: relPlenaria } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'plenaria_evolucao').maybeSingle();
    const { data: relRH } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'rh_manual').maybeSingle();

    const porTipo: Record<string, any[]> = {};
    for (const r of todos || []) {
      if (!porTipo[r.tipo]) porTipo[r.tipo] = [];
      porTipo[r.tipo].push({ colaborador: r.colaboradores?.nome_completo, cargo: r.colaboradores?.cargo, resumo: r.conteudo?.resumo_executivo || r.conteudo?.evolucao_geral });
    }

    const system = `Você é um consultor executivo de desenvolvimento de equipes da Vertho.

Sua tarefa é gerar um DOSSIÊ DO GESTOR, com base no diagnóstico inicial da equipe, na evolução observada ao longo do ciclo e nas implicações práticas para a gestão.

ATENÇÃO:
Este dossiê não é um resumo bonito do projeto.
Não é uma peça de marketing.
Não é um relatório individual.
Ele deve ser um documento executivo, claro e útil para o gestor entender o time e agir melhor sobre ele.

PRINCÍPIOS INEGOCIÁVEIS:
1. Seja executivo, claro e acionável.
2. Compare diagnóstico inicial e evolução observada.
3. Não force conclusões positivas.
4. Diferencie avanço consistente de ganho parcial.
5. O ROI deve ser prudente e gerencial, não fictício.
6. Toda recomendação relevante deve ter conexão com os dados.
7. O dossiê deve ajudar o gestor a agir, não apenas a entender.
8. Sem linguagem genérica que serviria para qualquer equipe.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const userBlocks: string[] = [];
    userBlocks.push(`EMPRESA: ${empresa.nome} (${empresa.segmento})`);
    if (relPlenaria?.conteudo) userBlocks.push(`PLENÁRIA DE EVOLUÇÃO:\n${JSON.stringify(relPlenaria.conteudo, null, 2).slice(0, 3000)}`);
    if (relRH?.conteudo) userBlocks.push(`RELATÓRIO RH:\n${JSON.stringify(relRH.conteudo, null, 2).slice(0, 2000)}`);
    userBlocks.push(`RELATÓRIOS POR TIPO:\n${JSON.stringify(porTipo, null, 2).slice(0, 4000)}`);

    userBlocks.push(`FORMATO DE SAÍDA (JSON):
{
  "titulo": "Dossiê Executivo do Gestor",
  "sumario_executivo": {
    "leitura_geral": "síntese executiva curta",
    "principal_ganho_do_ciclo": "texto curto",
    "principal_alerta_para_gestao": "texto curto"
  },
  "diagnostico_inicial": {
    "fotografia_da_equipe": "síntese do ponto de partida",
    "forcas_iniciais": ["força 1"],
    "riscos_iniciais": ["risco 1"],
    "implicacao_gerencial_inicial": "o que isso significava para o gestor"
  },
  "evolucao": {
    "sintese": "texto curto",
    "avancos_consistentes": [
      {"tema": "nome do avanço", "evidencia": "síntese curta"}
    ],
    "ganhos_parciais": [
      {"tema": "ganho parcial", "limite": "o que faltou consolidar"}
    ],
    "gaps_que_permanecem": [
      {"gap": "nome", "risco_para_gestao": "por que importa"}
    ]
  },
  "roi": {
    "leitura": "retorno gerencial prudente do ciclo",
    "ganhos_para_a_gestao": ["ganho 1"],
    "limites_do_retorno": ["limite 1"]
  },
  "recomendacoes": [
    {"recomendacao": "ação sugerida", "horizonte": "imediato|curto|medio", "objetivo": "o que pretende", "justificativa": "por que faz sentido"}
  ],
  "conclusao": {
    "fechamento": "síntese final executiva",
    "proximo_passo_recomendado": "texto curto"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- integrar diagnóstico + evolução + implicação gerencial
- roi prudente e útil
- máximo 6 recomendações
- diferenciar avanço consistente, ganho parcial e gap persistente
- sem linguagem vaga ou genérica`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
    const dossie = await extractJSON(resultado);
    if (dossie) {
      await upsertRelatorioAgregado(tdb, 'dossie_gestor', dossie);
    }
    return { success: true, message: 'Dossiê do gestor gerado' };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function checkCenarios(empresaId: string, aiConfig: AIConfig = {}) {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: cenarios } = await tdb.from('banco_cenarios')
      .select('id, titulo, descricao, cargo, alternativas, competencia_id')
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
      .order('cargo');
    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário encontrado' };

    // Buscar nomes de competências
    const compIds = [...new Set(cenarios.map((c: any) => c.competencia_id).filter(Boolean))] as string[];
    const compMap: Record<string, string> = {};
    for (const cid of compIds) {
      const { data: comp } = await tdb.from('competencias').select('nome').eq('id', cid).maybeSingle();
      if (comp) compMap[cid] = comp.nome;
    }

    // Montar resumo por cenário (até 20)
    const lote = cenarios.slice(0, 20).map((c: any) => {
      const alt = typeof c.alternativas === 'object' && !Array.isArray(c.alternativas) ? c.alternativas : {};
      return {
        id: c.id,
        titulo: c.titulo,
        cargo: c.cargo,
        competencia: compMap[c.competencia_id] || '—',
        contexto_resumido: (c.descricao || '').slice(0, 300),
        faceta: alt.faceta_testada_principal || alt.faceta_avaliada || '',
        tradeoff: alt.tradeoff_testado || '',
        armadilha: alt.armadilha_de_resposta_generica || '',
        perguntas: [alt.p1, alt.p2, alt.p3, alt.p4].filter(Boolean).length,
      };
    });

    const system = `Você é um auditor de qualidade de cenários da Vertho.

Sua tarefa é analisar um LOTE de cenários e verificar se têm qualidade metodológica e editorial suficiente para uso na plataforma.

ATENÇÃO:
Você NÃO está apenas revisando texto.
Você NÃO está procurando "cenários bonitos".
Você está auditando se cada cenário realmente funciona como instrumento prático e discriminante de avaliação ou desenvolvimento.

PRINCÍPIOS INEGOCIÁVEIS:
1. Realismo contextual importa.
2. Dilema concreto importa.
3. Poder discriminante importa.
4. Perguntas genéricas enfraquecem o cenário.
5. Texto bonito não compensa fraqueza metodológica.
6. Cenário com baixa utilidade prática não deve ser aprovado.
7. Toda ressalva ou reprovação deve gerar orientação clara de correção.

SINAIS DE PROBLEMA:
- situação abstrata demais
- contexto pouco plausível
- conflito fraco
- pergunta óbvia ou moralizante
- resposta "conversaria com todos" resolve fácil
- baixa diferença entre respostas fortes e fracas
- descritor mal testado
- excesso de didatismo
- cenário muito parecido com outros do lote

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const user = `LOTE DE ${lote.length} CENÁRIOS:

${JSON.stringify(lote, null, 2)}

FORMATO DE SAÍDA (JSON):
{
  "total": ${lote.length},
  "aprovados": 0,
  "com_ressalvas": 0,
  "reprovados": 0,
  "detalhes": [
    {
      "cenario_id": "id",
      "titulo": "titulo",
      "status": "aprovado|com_ressalvas|reprovado",
      "nota_geral": 0,
      "dimensoes": {
        "aderencia_competencia": 0,
        "realismo_contextual": 0,
        "dilema_e_tensao": 0,
        "poder_discriminante": 0,
        "qualidade_perguntas": 0,
        "risco_de_generico": 0,
        "prontidao_para_uso": 0
      },
      "forcas": ["força 1"],
      "problemas": ["problema 1"],
      "ajustes_sugeridos": ["ajuste 1"],
      "justificativa_curta": "síntese objetiva do veredito"
    }
  ],
  "leitura_do_lote": {
    "padroes_positivos": ["padrão 1"],
    "padroes_de_risco": ["risco 1"],
    "recomendacao_editorial": "síntese do que fazer com o lote"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- nota_geral e dimensões em escala 0-10
- aprovado ≥ 7, com_ressalvas 5-6.9, reprovado < 5
- risco_de_generico é invertida: quanto maior, pior
- justificativa_curta clara e específica
- ajustes_sugeridos acionáveis
- não aprovar por benevolência
- leitura_do_lote obrigatória com padrões agregados`;

    // 🔴 Terra desde 26/08/2026. Este check estava FORA da padronização de 22/07
    // que levou todas as dupla-checagens para o `gpt-5.6-terra` — e escapou pelo
    // mesmo motivo que o `blueprint_audit` escapou: não tinha `taskKey`, então
    // nunca passou por `getModelForTask` nem por tabela nenhuma.
    //
    // Em 25/08 eu o movi de `gemini-3.6` para `gemini-3.7` por preço e
    // velocidade, e horas depois medi que o Gemini 3.7 COMO AUDITOR dá nota
    // média 95,5 sobre cenários que o `ia3_check` (Terra) reprova. Ou seja: esta
    // tela diria ao admin que está tudo aprovado enquanto a checagem
    // por-cenário marca 93 de 134 como `revisar`. Duas telas do mesmo produto
    // com vereditos opostos sobre os mesmos cenários é pior que qualquer um dos
    // dois sozinho.
    //
    // Reverter para o 3.6 não resolveria: ele também nunca foi medido como
    // auditor e também está fora do padrão. O conserto é entrar na régua comum.
    const { getModelForTask } = await import('@/lib/ai-tasks');
    const modeloCheck = aiConfig?.model || await getModelForTask(empresaId, 'cenarios_lote_check');
    const resultado = await callAI(system, user, { model: modeloCheck }, 8192, {
      temperature: TEMP, taskKey: 'cenarios_lote_check', empresaId,
    });
    const verificacao = await extractJSON(resultado);
    return {
      success: true,
      message: `Verificação: ${verificacao?.aprovados || 0} aprovados, ${verificacao?.com_ressalvas || 0} com ressalvas, ${verificacao?.reprovados || 0} reprovados`,
      verificacao,
    };
  } catch (err: any) { return { success: false, error: err.message }; }
}
