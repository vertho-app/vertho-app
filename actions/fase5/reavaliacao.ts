'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI, callAIChat, type AIConfig } from '../ai-client';
import { extractJSON } from '../utils';
import { requireAdminAction, requireUserAction } from '@/lib/auth/action-context';
import { TEMP } from './_shared';

const MAX_TURNOS = 8;

// ══════════════════════════════════════════════════════════════════════════════
// 2. INICIAR REAVALIAÇÃO EM LOTE
// 1 sessão por colaborador. Mesma lógica do PDI (montarTrilhasLote):
//   - Usa competência foco do cargo SE o colab tem gap nela
//   - Senão usa a competência com maior gap (gap = 4 - nivel_ia4)
// ══════════════════════════════════════════════════════════════════════════════

export async function iniciarReavaliacaoLote(empresaId: string, aiConfig: AIConfig = {}) {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: colaboradores } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, email, perfil_dominante, d_natural, i_natural, s_natural, c_natural, perfil_externo_fonte, perfil_externo_dados');
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Cenários B (chave: competencia_id::cargo)
    const { data: cenariosB } = await tdb.from('banco_cenarios')
      .select('id, competencia_id, cargo').eq('tipo_cenario', 'cenario_b');
    if (!cenariosB?.length) return { success: false, error: 'Nenhum cenário B. Gere cenários B primeiro.' };
    const cenarioMap = {};
    cenariosB.forEach(c => { cenarioMap[`${c.competencia_id}::${c.cargo}`] = c.id; });

    // Respostas iniciais (baseline + cálculo de gap)
    const { data: respostas } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia')
      .not('avaliacao_ia', 'is', null);
    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação IA4 encontrada. Rode IA4 primeiro.' };
    const baselineMap = {};
    (respostas || []).forEach(r => {
      baselineMap[`${r.colaborador_id}::${r.competencia_id}`] = {
        nivel: r.nivel_ia4,
        avaliacao: r.avaliacao_ia,
      };
    });

    // Competência foco por cargo (definida pelo RH)
    const { data: cargosEmpresa } = await tdb.from('cargos_empresa')
      .select('nome, competencia_foco');
    const focoMap = {};
    (cargosEmpresa || []).forEach(c => { if (c.competencia_foco) focoMap[c.nome] = c.competencia_foco; });

    // Competências (parent rows, cod_desc IS NULL)
    const { data: competencias, error: compErr } = await tdb.from('competencias')
      .select('id, nome, cargo, cod_comp')
      .is('cod_desc', null);
    if (compErr) return { success: false, error: `competencias: ${compErr.message}` };
    const compByIdMap = {};
    const compByNomeCargoMap = {};
    (competencias || []).forEach(c => {
      compByIdMap[c.id] = c;
      compByNomeCargoMap[`${c.nome}::${c.cargo}`] = c;
    });

    // Descritores por cod_comp (linhas filhas em competencias) — UMA query
    // agrupada em memória (era 1 query por competência, N+1 puro)
    const descritoresCache = {};
    const codComps = [...new Set((competencias || []).map(c => c.cod_comp).filter(Boolean))];
    const { data: todosDescs } = codComps.length
      ? await tdb.from('competencias')
          .select('cod_comp, cod_desc, nome_curto, descritor_completo')
          .in('cod_comp', codComps)
          .not('cod_desc', 'is', null)
      : { data: [] };
    const descsPorCodComp = {};
    for (const d of todosDescs || []) {
      (descsPorCodComp[d.cod_comp] = descsPorCodComp[d.cod_comp] || []).push(d);
    }
    for (const comp of competencias || []) {
      const descs = descsPorCodComp[comp.cod_comp];
      descritoresCache[comp.id] = (descs || []).map((d, i) => ({
        codigo: d.cod_desc || `D${i + 1}`,
        nome: d.nome_curto || d.descritor_completo || `Descritor ${i + 1}`,
      }));
    }

    // Agrupar gaps por colaborador (gap = 4 - nivel)
    const gapsPorColab = {};
    respostas.forEach(r => {
      const comp = compByIdMap[r.competencia_id];
      if (!comp) return;
      if (!gapsPorColab[r.colaborador_id]) gapsPorColab[r.colaborador_id] = [];
      const nivel = r.nivel_ia4 || 0;
      gapsPorColab[r.colaborador_id].push({
        comp,
        nivel,
        gap: 4 - nivel,
      });
    });

    // Trilha progresso (temporada_semana_progresso — schema novo)
    const { data: progressos } = await tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana, conteudo_consumido');
    const progMap: Record<string, { pct_conclusao: number; semana_atual: number }> = {};
    (progressos || []).forEach(p => {
      const prev = progMap[p.colaborador_id];
      const sem = p.semana || 0;
      if (!prev || sem > prev.semana_atual) {
        progMap[p.colaborador_id] = { semana_atual: sem, pct_conclusao: Math.round((sem / 14) * 100) };
      }
    });

    // Sessões já criadas (dedupe por colab+comp)
    const { data: sessoes } = await tdb.from('reavaliacao_sessoes')
      .select('colaborador_id, competencia_id');
    const jaCriado = new Set((sessoes || []).map(s => `${s.colaborador_id}::${s.competencia_id}`));

    let criados = 0, pulados = 0;
    const motivosPulo = [];

    for (const colab of colaboradores) {
      const gaps = gapsPorColab[colab.id];
      if (!gaps?.length) { pulados++; motivosPulo.push(`${colab.nome_completo}: sem avaliações`); continue; }

      // 1) Tentar competência foco do cargo
      let compAlvo = null;
      const foco = focoMap[colab.cargo];
      if (foco) {
        const compFoco = gaps.find(g => {
          const fL = foco.toLowerCase();
          const cL = g.comp.nome.toLowerCase();
          return cL === fL || cL.includes(fL) || fL.includes(cL);
        });
        if (compFoco && compFoco.gap > 0) compAlvo = compFoco.comp;
      }

      // 2) Senão, maior gap
      if (!compAlvo) {
        const comGap = gaps.filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
        if (comGap.length > 0) compAlvo = comGap[0].comp;
      }

      if (!compAlvo) { pulados++; motivosPulo.push(`${colab.nome_completo}: sem gap em nenhuma competência`); continue; }

      // 3) Precisa ter cenário B para essa comp+cargo
      const cenarioBId = cenarioMap[`${compAlvo.id}::${colab.cargo}`];
      if (!cenarioBId) {
        pulados++;
        motivosPulo.push(`${colab.nome_completo}: sem cenário B para "${compAlvo.nome}"`);
        continue;
      }

      // 4) Dedupe
      if (jaCriado.has(`${colab.id}::${compAlvo.id}`)) { pulados++; continue; }

      const baseline = baselineMap[`${colab.id}::${compAlvo.id}`] || null;
      const trilha = progMap[colab.id] || null;

      const avIni = typeof baseline?.avaliacao === 'string' ? JSON.parse(baseline.avaliacao) : baseline?.avaliacao;
      const pontosFortes = avIni?.descritores_destaque?.pontos_fortes || avIni?.pontos_fortes || [];
      const pontosAtencao = avIni?.descritores_destaque?.gaps_prioritarios || avIni?.pontos_desenvolvimento || [];

      const descritores = descritoresCache[compAlvo.id] || [];

      // empresa_id é injetado pelo tdb.insert
      const { error } = await tdb.from('reavaliacao_sessoes').insert({
        colaborador_id: colab.id,
        competencia_id: compAlvo.id,
        cenario_b_id: cenarioBId,
        baseline_nivel: baseline?.nivel || null,
        baseline_avaliacao: baseline?.avaliacao || null,
        status: 'pendente',
        historico: [],
        turno: 0,
        extracao_qualitativa: {
          _contexto_sessao: {
            pontos_fortes: pontosFortes,
            pontos_atencao: pontosAtencao,
            descritores: descritores,
            disc: { perfil: colab.perfil_dominante, D: colab.d_natural, I: colab.i_natural, S: colab.s_natural, C: colab.c_natural },
            trilha: trilha ? { pct: trilha.pct_conclusao, semana: trilha.semana_atual } : null,
          },
        },
      });

      if (error) {
        console.error('[reavaliacao_sessoes insert]', error.message);
        pulados++;
      } else {
        criados++;
      }
    }

    let msg = `${criados} sessões criadas (1 por colaborador)`;
    if (pulados > 0) msg += ` | ${pulados} pulados`;
    if (motivosPulo.length) console.log('[iniciarReavaliacao] motivos:', motivosPulo);
    return { success: true, message: msg };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. PROCESSAR REAVALIAÇÃO CONVERSACIONAL (1 sessão, 8 turnos)
// Prompt completo com: baseline, descritores D1-D6, trilha, DISC, exemplos
// ══════════════════════════════════════════════════════════════════════════════

function buildReavSystemPrompt(sessao: any, comp: any): string {
  const ctx = sessao.extracao_qualitativa?._contexto_sessao || {};
  const descritores = ctx.descritores || [];
  const pontosFortes = ctx.pontos_fortes || [];
  const pontosAtencao = ctx.pontos_atencao || [];
  const disc = ctx.disc || {};
  const trilha = ctx.trilha || {};
  const nomeColab = sessao.colaboradores?.nome_completo || 'o colaborador';
  const compNome = comp?.nome || sessao.competencias?.nome || '';
  const gapPrincipal = pontosAtencao[0] ? (typeof pontosAtencao[0] === 'string' ? pontosAtencao[0] : pontosAtencao[0].descritor || pontosAtencao[0].nome) : '';

  return `Você é o Mentor IA da Vertho, conduzindo uma conversa de REAVALIAÇÃO após a jornada de desenvolvimento.

═══ PAPEL ═══
Seu papel NÃO é ensinar, aconselhar ou avaliar formalmente.
Seu papel é COLETAR EVIDÊNCIAS DE MUDANÇA NA PRÁTICA.

O que importa NÃO é "o que a pessoa diz que aprendeu".
O que importa é:
- o que passou a FAZER
- como DECIDIU
- o que percebeu de DIFERENTE
- o que ainda continua DIFÍCIL
- qual consciência tem do próprio avanço ou limitação

═══ TOM E ESTILO ═══
- Acolhedor, humano, curioso, respeitoso, não julgador
- Linguagem natural em português do Brasil
- Trate como "você" (2a pessoa)
- Máximo 1 frase de transição/acolhimento + 1 pergunta

Microacolhimento PERMITIDO: "Entendi.", "Faz sentido.", "Que bom que você percebeu isso."
PROIBIDO: elogiar, validar mérito, interpretar, aconselhar, avaliar

═══ REGRAS INEGOCIÁVEIS ═══
1. Você NÃO está avaliando formalmente
2. NUNCA revele nível, nota inicial ou baseline
3. NUNCA cite descritores por código (D1, D2) — use linguagem natural
4. NUNCA transforme a conversa em mentoria, aula ou aconselhamento
5. NUNCA aceite teoria ou opinião como evidência suficiente
6. Sempre puxe para prática, exemplo, ação, consequência ou autopercepção
7. Explore também o que NÃO mudou ou o que continua difícil
8. NUNCA invente fatos não mencionados pelo colaborador

═══ TIPOS DE EVIDÊNCIA A BUSCAR ═══
- situacao_real — contexto concreto de mudança
- acao_concreta — o que passou a fazer diferente
- raciocinio — critério ou lógica por trás da mudança
- consequencia — resultado percebido
- autossensibilidade — consciência do avanço ou limitação
- dificuldade_persistente — o que continua difícil apesar da jornada
- intencao_sem_execucao — quer mudar mas ainda não mudou na prática

Classificação de força:
- FRACA: genérica, abstrata, hipotética, sem exemplo
- MODERADA: concreta mas incompleta ou sem consequência
- FORTE: concreta + contexto + resultado ou consequência clara

═══ PROTOCOLO DE REDIRECIONAMENTO ═══
Se o colaborador pedir avaliação, conselho ou resposta pronta:
- "Antes de entrar nisso, quero entender melhor como isso apareceu na sua prática."
- "Me ajuda com um exemplo concreto."
- "O que você fez de diferente nessa situação?"
- "O que ainda segue difícil mesmo depois da jornada?"

═══ ROTEIRO DA CONVERSA (6 etapas) ═══
1. ACOLHIMENTO — "Que bom que chegou até aqui! Foram ${trilha.semana || 14} semanas..."
2. MUDANÇA GERAL — O que mudou na prática? (aberto, sem direcionar)
3. EVIDÊNCIA CONCRETA — Uma situação específica em que agiu diferente
4. APROFUNDAMENTO EM GAP — ${gapPrincipal ? `Foco em: ${gapPrincipal}` : 'Abordar o gap principal'}
5. DIFICULDADE PERSISTENTE — O que ainda é mais desafiador
6. ENCERRAMENTO — "Muito obrigado! Na próxima etapa você vai responder ao cenário B."

═══ REGRAS DE ENCERRAMENTO ═══
- Máximo ${MAX_TURNOS} turnos
- NÃO encerrar cedo por resposta bonita
- Só encerrar quando houver material minimamente útil sobre:
  - mudança percebida (pelo menos 1 evidência moderada+)
  - evidência concreta (pelo menos 1 fato real)
  - dificuldade persistente OU limite atual (pelo menos 1 menção)

═══ CONTEXTO DO COLABORADOR (INTERNO) ═══
Competência: ${compNome}
Nível baseline: N${sessao.baseline_nivel || '?'}
Cargo: ${sessao.colaboradores?.cargo || 'N/D'}
${disc.perfil ? `DISC: ${disc.perfil} (D=${disc.D||0} I=${disc.I||0} S=${disc.S||0} C=${disc.C||0})` : ''}
Trilha: ${trilha.pct || 0}% concluída
${pontosFortes.length ? `Pontos fortes: ${pontosFortes.map((p: any) => typeof p === 'string' ? p : p.descritor || p.nome).join('; ')}` : ''}
${pontosAtencao.length ? `Gaps prioritários: ${pontosAtencao.map((p: any) => typeof p === 'string' ? p : p.descritor || p.nome).join('; ')}` : ''}
${descritores.length ? `Descritores (NUNCA citar código): ${descritores.map((d: any) => d.nome).join('; ')}` : ''}

═══ BLOCO [META] — OBRIGATÓRIO EM TODA RESPOSTA ═══

[META]
{
  "turno": ${sessao.turno + 1},
  "etapa_atual": "acolhimento|mudanca_geral|evidencia_concreta|aprofundamento_gap|dificuldade_persistente|encerramento",
  "proximo_foco": "o que precisa ser explorado a seguir",
  "evidencias_coletadas": [
    {
      "tipo": "situacao_real|acao_concreta|raciocinio|consequencia|autossensibilidade|dificuldade_persistente|intencao_sem_execucao",
      "trecho": "trecho literal ou paráfrase fiel",
      "forca": "fraca|moderada|forte"
    }
  ],
  "lacunas_abertas": ["dimensões ou aspectos ainda não explorados"],
  "risco_de_encerramento_prematuro": true,
  "encerrar": false
}
[/META]

A mensagem visível ao colaborador deve vir ANTES do [META].`;
}

export async function processarReavaliacao(sessaoId: string, mensagem: string, aiConfig: AIConfig = {}) {
  const ctx = await requireUserAction();
  const sbRaw = createSupabaseAdmin();
  try {
    // Descobre tenant via sessão (raw — query inicial)
    const { data: sessao, error: sessaoErr } = await sbRaw.from('reavaliacao_sessoes')
      .select('*, competencias!inner(nome), colaboradores!inner(nome_completo, cargo)')
      .eq('id', sessaoId).single();

    if (sessaoErr) return { success: false, error: sessaoErr.message };
    if (!sessao) return { success: false, error: 'Sessão não encontrada' };
    if (sessao.status === 'concluida') return { success: false, error: 'Sessão já concluída' };

    // SÓ O DONO conversa na própria reavaliação: `sessaoId` vem do CLIENTE e o
    // `tenantDb` abaixo escopa pelo tenant DA SESSÃO PEDIDA — consistência, não
    // autorização. Sem isto, qualquer autenticado lê a sessão de outro tenant,
    // ESCREVE no histórico dela e queima IA. Platform admin passa (operação).
    if (!ctx.isPlatformAdmin && (!ctx.colaborador?.id || sessao.colaborador_id !== ctx.colaborador.id)) {
      return { success: false, error: 'não autorizado' };
    }

    const tdb = tenantDb(sessao.empresa_id);

    const historico = sessao.historico || [];
    historico.push({ role: 'user', content: mensagem });

    const systemPrompt = buildReavSystemPrompt(sessao, sessao.competencias);
    const resposta = await callAIChat(systemPrompt, historico, aiConfig, 4096, { temperature: TEMP });

    historico.push({ role: 'assistant', content: resposta });
    const novoTurno = sessao.turno + 1;

    // Verificar [META] enriquecido
    const metaMatch = resposta.match(/\[META\](.*?)\[\/META\]/s);
    let meta: any = {};
    try { meta = metaMatch ? JSON.parse(metaMatch[1]) : {}; } catch {}

    // Lógica de encerramento enriquecida
    const evidencias = meta.evidencias_coletadas || [];
    const fortes = evidencias.filter((e: any) => e.forca === 'forte').length;
    const moderadas = evidencias.filter((e: any) => e.forca === 'moderada').length;
    const temDificuldade = evidencias.some((e: any) => e.tipo === 'dificuldade_persistente');
    const riscoPrematuro = meta.risco_de_encerramento_prematuro === true;

    const criteriosEncerrar = (fortes + moderadas >= 2) && temDificuldade && !riscoPrematuro;
    const encerrar = meta.encerrar || (criteriosEncerrar && meta.etapa_atual === 'encerramento') || novoTurno >= MAX_TURNOS;

    await tdb.from('reavaliacao_sessoes').update({
      historico,
      turno: novoTurno,
      ...(encerrar ? { status: 'concluida' } : {}),
    }).eq('id', sessaoId);

    // Se encerrou, extrair dados qualitativos
    if (encerrar) {
      await extrairDadosReavaliacao(sessaoId, aiConfig);
    }

    return { success: true, reply: resposta.replace(/\[META\].*?\[\/META\]/s, '').trim(), encerrada: encerrar };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. EXTRAÇÃO QUALITATIVA DA REAVALIAÇÃO
// Transforma conversa em artefato estruturado por descritor, útil pra fusão 5.5
// ══════════════════════════════════════════════════════════════════════════════

async function extrairDadosReavaliacao(sessaoId: any, aiConfig: any = {}) {
  const sbRaw = createSupabaseAdmin();
  const { data: sessao } = await sbRaw.from('reavaliacao_sessoes')
    .select('*, competencias!inner(nome), colaboradores!inner(nome_completo, cargo)')
    .eq('id', sessaoId).single();
  if (!sessao) return;
  const tdb = tenantDb(sessao.empresa_id);

  const ctx = sessao.extracao_qualitativa?._contexto_sessao || {};
  const descritores = (ctx.descritores || []).map((d: any, i: number) =>
    `${d.codigo || `D${i + 1}`}: ${d.nome || ''}`
  );

  // Extrair sinais do [META] acumulado na conversa (se disponíveis)
  const metaSinais: any[] = [];
  for (const h of (sessao.historico || [])) {
    if (h.role === 'assistant') {
      const m = h.content.match(/\[META\](.*?)\[\/META\]/s);
      if (m) {
        try {
          const parsed = JSON.parse(m[1]);
          if (Array.isArray(parsed.evidencias_coletadas)) {
            metaSinais.push(...parsed.evidencias_coletadas);
          }
        } catch {}
      }
    }
  }

  const system = `Você é um extrator de evidências qualitativas da Vertho.

Sua tarefa é analisar a conversa de reavaliação de um colaborador e extrair dados qualitativos por descritor, de forma fiel, prudente e útil para análise posterior.

ATENÇÃO:
Você NÃO está fazendo a avaliação final da competência.
Você NÃO está escrevendo um feedback bonito.
Você NÃO está completando lacunas.
Você está EXTRAINDO o que a conversa realmente sustenta.

PRINCÍPIOS INEGOCIÁVEIS:
1. Extraia apenas o que foi dito ou claramente sustentado.
2. Fala teórica não vale como evidência forte.
3. Exemplo concreto vale mais do que opinião.
4. Se não houver base suficiente, reduza a confiança.
5. Não force um descritor a ter evidência se a conversa não o cobrir.
6. nivel_percebido é leitura qualitativa provisória, não avaliação final.
7. DISC/CIS é contexto, não destino.
8. Toda evidência relevante deve ter citação curta de sustentação.

FORÇA DA EVIDÊNCIA:
- fraca: abstrata, genérica, teórica, sem ação observável
- moderada: concreta mas incompleta ou sem consequência clara
- forte: concreta + coerente + com ação e consequência/critério

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

  const blocks: string[] = [];
  blocks.push(`═══ COMPETÊNCIA ═══\n${sessao.competencias.nome}`);
  blocks.push(`═══ COLABORADOR ═══\n${sessao.colaboradores.nome_completo} (${sessao.colaboradores.cargo})\nNível baseline: N${sessao.baseline_nivel || '?'}`);
  if (ctx.disc?.perfil) blocks.push(`═══ PERFIL DISC ═══\n${ctx.disc.perfil} (D=${ctx.disc.D||0} I=${ctx.disc.I||0} S=${ctx.disc.S||0} C=${ctx.disc.C||0})\nNOTA: NÃO use DISC pra nota, apenas pra leitura contextual.`);
  blocks.push(`═══ DESCRITORES ═══\n${descritores.join('\n')}`);

  if (metaSinais.length > 0) {
    blocks.push(`═══ SINAIS DO [META] (coletados durante a conversa) ═══\n${JSON.stringify(metaSinais.slice(0, 20), null, 2)}`);
  }

  blocks.push(`═══ CONVERSA COMPLETA ═══\n${sessao.historico.map((h: any) =>
    `${h.role === 'user' ? 'COLABORADOR' : 'MENTOR'}: ${h.content.replace(/\[META\].*?\[\/META\]/s, '').trim()}`
  ).join('\n\n')}`);

  blocks.push(`FORMATO DE SAÍDA (JSON):
{
  "resumo_qualitativo": {
    "leitura_geral": "síntese curta e fiel da conversa",
    "sinal_mais_forte": "principal evidência qualitativa observada",
    "limite_mais_relevante": "principal limite qualitativo observado"
  },
  "evidencias_por_descritor": [
    {
      "descritor": "D1",
      "nome_descritor": "nome",
      "evidencia_relatada": "síntese curta e fiel do que o colaborador relatou",
      "nivel_percebido": 2,
      "confianca": 0.75,
      "forca_da_evidencia": "forte|moderada|fraca",
      "citacao_literal": "trecho curto da fala que sustenta",
      "limite_da_evidencia": "o que faltou para sustentar melhor"
    }
  ],
  "gaps_persistentes": [
    {"gap": "nome curto", "sinal": "como aparece na conversa"}
  ],
  "ganhos_qualitativos": ["ganho 1"],
  "consciencia_do_gap": {
    "nivel": "alta|media|baixa",
    "justificativa": "por que essa leitura"
  },
  "conexao_cis": {
    "leitura": "leitura breve e prudente conectando conversa ao perfil",
    "cuidados_de_interpretacao": ["cuidado 1"]
  },
  "recomendacao_ciclo2": {
    "descritores_foco": ["D1", "D3"],
    "justificativa": "por que esses descritores",
    "tipo_de_trabalho_sugerido": ["pratica", "feedback"]
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- confianca: 0.0 a 1.0
- nivel_percebido: escala 1 a 4, pode usar decimal
- citacao_literal: curta e fiel
- gaps_persistentes devem sair da conversa, não de inferência
- se um descritor não tiver base suficiente, confiança baixa e forca fraca
- sem linguagem genérica`);

  const user = blocks.join('\n\n');
  const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
  let extracao = await extractJSON(resultado);

  // Validação leve
  if (extracao) {
    // Confiança entre 0 e 1
    if (Array.isArray(extracao.evidencias_por_descritor)) {
      for (const d of extracao.evidencias_por_descritor) {
        if (typeof d.confianca === 'number') d.confianca = Math.max(0, Math.min(1, d.confianca));
        // Compatibilidade: confiança como string → converter
        if (typeof d.confianca === 'string') {
          d.confianca = d.confianca === 'alta' ? 0.85 : d.confianca === 'media' ? 0.55 : 0.25;
        }
      }
    }
    // Preservar _contexto_sessao
    await tdb.from('reavaliacao_sessoes')
      .update({ extracao_qualitativa: { ...extracao, _contexto_sessao: ctx } })
      .eq('id', sessaoId);
  }
}
