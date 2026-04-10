'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from './ai-client';
import { extractJSON } from './utils';

// ── Constantes (alinhadas com GAS) ──────────────────────────────────────────
const MAX_TURNOS = 8;
const TEMP = 0.4; // temperatura GAS para consistência

// System prompt compartilhado do check de cenário B
const CHECK_CEN_B_SYSTEM = `Você é um avaliador especialista em Assessment Comportamental.
Avalie o cenário B e as perguntas com base em 5 dimensões (20pts cada, total 100):

1. ADERÊNCIA À COMPETÊNCIA (20pts): O cenário avalia a competência indicada?
2. REALISMO CONTEXTUAL (20pts): Contexto e personagens críveis para o cargo?
3. CONTENÇÃO (20pts): Contexto até ~900 chars? Max 2 tensões? Perguntas até ~200 chars?
4. FORÇA DE DECISÃO (20pts): P1 força ESCOLHA? P2 pede COMO? P3 aborda raciocínio? P4 pede reflexão?
5. PODER DISCRIMINANTE (20pts): Permite discriminar 4 níveis (N1-N4)?

ERROS GRAVES (força nota max 60):
- Pergunta fechada (sim/não)
- Cenário com 4+ tensões
- Pergunta genérica sem escolha
- Competência avaliada não é a indicada

Nota >= 90 = aprovado. Nota < 90 = revisar.
Retorne APENAS JSON válido:
{"nota":85,"dimensoes":{"aderencia":18,"realismo":19,"contencao":16,"decisao":17,"discriminante":15},"justificativa":"...","sugestao":"..."}`;

// Helper: busca descritores (linhas filhas em competencias com mesmo cod_comp)
async function fetchDescritoresTexto(sb, empresaId, codComp) {
  if (!codComp) return '';
  const { data: descs } = await sb.from('competencias')
    .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
    .eq('empresa_id', empresaId)
    .eq('cod_comp', codComp)
    .not('cod_desc', 'is', null);
  if (!descs?.length) return '';
  return descs.map((d, i) => `D${i + 1}: ${d.cod_desc} — ${d.nome_curto || ''}\nN1: ${d.n1_gap || ''}\nN2: ${d.n2_desenvolvimento || ''}\nN3: ${d.n3_meta || ''}\nN4: ${d.n4_referencia || ''}`).join('\n\n');
}

// Helper: monta prompts de geração de cenário B
function buildCenBPrompts(empresa, cenA, comp, descritoresTexto, pppContexto, feedbackExtra = '') {
  const system = `<PAPEL>
Você é um especialista em avaliação de competências comportamentais com 20 anos de experiência.
Cria cenários situacionais que funcionam como instrumentos diagnósticos.
Empresa: ${empresa.nome} (${empresa.segmento})
</PAPEL>

<TAREFA>
Crie um CENÁRIO B complementar ao cenário A já existente.
O cenário B usa a MESMA competência mas com situação-gatilho DIFERENTE.
</TAREFA>

<REGRAS_DE_CONSTRUCAO>
1. REALISMO CONTEXTUAL — use elementos reais, nomes brasileiros, contexto específico
2. ESTRUTURA DO DILEMA — situação concreta, tensão real, não extrema
3. PODER DISCRIMINANTE — permite respostas em 4 níveis (N1-N4)
4. DIVERSIDADE EM RELAÇÃO AO CENÁRIO A — situação-gatilho OBRIGATORIAMENTE diferente
5. DILEMA ÉTICO EMBUTIDO — tensão ética sutil que revele valores na resposta
</REGRAS_DE_CONSTRUCAO>

Responda APENAS com JSON válido.`;

  const user = `## Competência avaliada
Nome: ${comp.nome}
Descrição: ${comp.descricao || ''}
Cargo: ${cenA.cargo}

## Descritores (régua por nível)
${descritoresTexto || '(sem descritores cadastrados)'}

${pppContexto ? `## Contexto institucional (PPP/Valores)\n${pppContexto}\n` : ''}
## Cenário A original (NÃO repetir — crie algo DIFERENTE)
Título: ${cenA.titulo}
Descrição: ${cenA.descricao}
${feedbackExtra ? `\n## FEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS):\n${feedbackExtra}\n` : ''}
## Formato de saída (JSON obrigatório):
{
  "titulo": "título do cenário B",
  "descricao": "contexto (80-150 palavras, personagens brasileiros, situação concreta)",
  "p1": "Dimensão SITUAÇÃO — pergunta aberta",
  "p2": "Dimensão AÇÃO — pergunta aberta",
  "p3": "Dimensão RACIOCÍNIO — pergunta aberta",
  "p4": "Dimensão AUTOSSENSIBILIDADE — pergunta aberta",
  "faceta_avaliada": "qual aspecto específico da competência este cenário testa",
  "referencia_avaliacao": {
    "nivel_1": "que tipo de resposta indica N1",
    "nivel_2": "que tipo de resposta indica N2",
    "nivel_3": "que tipo de resposta indica N3",
    "nivel_4": "que tipo de resposta indica N4"
  },
  "dilema_etico_embutido": {
    "valor_testado": "nome do valor ético em jogo",
    "caminho_facil": "o que a pessoa faria se cedesse",
    "caminho_etico": "o que a pessoa faria mantendo o valor"
  }
}`;

  return { system, user };
}

// Helper: roda check em 1 cenário B e persiste resultado
async function runCheckOnCenB(sb, cen, comp, descritoresTexto, modelo) {
  const alt = typeof cen.alternativas === 'string' ? JSON.parse(cen.alternativas) : (cen.alternativas || {});
  const perguntas = [alt.p1, alt.p2, alt.p3, alt.p4].filter(Boolean).map((p, i) => `P${i+1}: ${p}`).join('\n');

  const user = `CARGO: ${cen.cargo}
COMPETÊNCIA: ${comp?.nome || 'N/D'}

CENÁRIO B:
Título: ${cen.titulo}
Contexto: ${cen.descricao}

PERGUNTAS:
${perguntas}

${descritoresTexto ? `DESCRITORES:\n${descritoresTexto.slice(0, 1500)}` : ''}`;

  const resposta = await callAI(CHECK_CEN_B_SYSTEM, user, { model: modelo || 'gemini-3-flash-preview' }, 4096, { temperature: TEMP });
  const resultado = await extractJSON(resposta);
  if (!resultado?.nota) return { success: false, error: 'Check não retornou nota' };

  const statusCheck = resultado.nota >= 90 ? 'aprovado' : 'revisar';
  await sb.from('banco_cenarios').update({
    nota_check: resultado.nota,
    status_check: statusCheck,
    dimensoes_check: resultado.dimensoes || null,
    justificativa_check: resultado.justificativa || null,
    sugestao_check: resultado.sugestao || null,
    checked_at: new Date().toISOString(),
  }).eq('id', cen.id);

  return { success: true, nota: resultado.nota, status: statusCheck };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GERAR CENÁRIOS B EM LOTE
// Cria cenários B customizados por cargo/competência (diferente do A)
// Inclui: dilema ético, faceta avaliada, validação Gemini
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarCenariosBLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    // Cenários A existentes
    // Cenários A (sem join — competencias pode não ter FK)
    const { data: cenariosA } = await sb.from('banco_cenarios')
      .select('id, titulo, descricao, cargo, competencia_id')
      .eq('empresa_id', empresaId)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');

    if (!cenariosA?.length) return { success: false, error: 'Nenhum cenário A encontrado. Rode IA3 primeiro.' };

    const compIdsNeeded = [...new Set(cenariosA.map(c => c.competencia_id).filter(Boolean))];
    const compMap = {};
    const descritoresMap = {};

    for (const cid of compIdsNeeded) {
      const { data: comp } = await sb.from('competencias')
        .select('id, nome, descricao, cod_comp')
        .eq('id', cid)
        .maybeSingle();
      if (comp) {
        compMap[comp.id] = comp;
        descritoresMap[comp.id] = await fetchDescritoresTexto(sb, empresaId, comp.cod_comp);
      }
    }
    const compIds = Object.keys(compMap);

    // Já tem B?
    const { data: cenariosB } = await sb.from('banco_cenarios')
      .select('competencia_id, cargo')
      .eq('empresa_id', empresaId).eq('tipo_cenario', 'cenario_b');
    const jaTemB = new Set((cenariosB || []).map(c => `${c.competencia_id}::${c.cargo}`));

    // PPP da empresa (contexto institucional)
    const { data: ppps } = await sb.from('ppp_escolas')
      .select('valores').eq('empresa_id', empresaId).limit(1);
    const pppContexto = ppps?.[0]?.valores ? JSON.stringify(ppps[0].valores) : '';

    const checkModel = aiConfig?.checkModel;
    let gerados = 0, aprovados = 0, revisar = 0, skipJaTemB = 0, skipSemComp = 0;
    for (const cenA of cenariosA) {
      const key = `${cenA.competencia_id}::${cenA.cargo}`;
      if (jaTemB.has(key)) { skipJaTemB++; continue; }

      const comp = compMap[cenA.competencia_id];
      if (!comp) { skipSemComp++; continue; }

      const descritoresTexto = descritoresMap[cenA.competencia_id] || '';
      const { system, user } = buildCenBPrompts(empresa, cenA, comp, descritoresTexto, pppContexto);
      const resultado = await callAI(system, user, aiConfig, 4096, { temperature: TEMP });
      const cenarioData = await extractJSON(resultado);
      if (!cenarioData?.titulo) continue;

      const { data: inserted, error: insErr } = await sb.from('banco_cenarios').insert({
        empresa_id: empresaId,
        competencia_id: cenA.competencia_id,
        cargo: cenA.cargo,
        titulo: cenarioData.titulo,
        descricao: cenarioData.descricao,
        alternativas: {
          p1: cenarioData.p1,
          p2: cenarioData.p2,
          p3: cenarioData.p3,
          p4: cenarioData.p4,
          referencia_avaliacao: cenarioData.referencia_avaliacao,
          dilema_etico: cenarioData.dilema_etico_embutido,
          faceta_avaliada: cenarioData.faceta_avaliada,
        },
        tipo_cenario: 'cenario_b',
      }).select('id, titulo, descricao, cargo, alternativas').single();
      if (insErr) { console.error('[cenarioB insert]', insErr.message); continue; }
      gerados++;

      // Check inline se modelo foi informado
      if (checkModel && inserted) {
        try {
          const chk = await runCheckOnCenB(sb, inserted, comp, descritoresTexto, checkModel);
          if (chk.success) {
            if (chk.status === 'aprovado') aprovados++; else revisar++;
          }
        } catch (e) { console.error('[cenarioB check]', e.message); }
      }
    }

    let msg = `${gerados} cenários B gerados`;
    if (checkModel) msg += ` | ${aprovados} aprovados, ${revisar} para revisar`;
    msg += ` — ${cenariosA.length} cenários A, ${compIds.length} competências`;
    return { success: true, message: msg };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1b. CHECK DE 1 CENÁRIO B
// ══════════════════════════════════════════════════════════════════════════════

export async function checkCenarioBUm(cenarioId, modelo = null) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cen } = await sb.from('banco_cenarios')
      .select('id, empresa_id, titulo, descricao, cargo, competencia_id, alternativas')
      .eq('id', cenarioId).single();
    if (!cen) return { success: false, error: 'Cenário não encontrado' };

    const { data: comp } = await sb.from('competencias')
      .select('id, nome, cod_comp').eq('id', cen.competencia_id).maybeSingle();

    const descritoresTexto = comp ? await fetchDescritoresTexto(sb, cen.empresa_id, comp.cod_comp) : '';
    const r = await runCheckOnCenB(sb, cen, comp, descritoresTexto, modelo);
    if (!r.success) return r;
    return { success: true, message: `Check: ${r.nota}pts — ${r.status}`, nota: r.nota, status: r.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1c. REGENERAR 1 CENÁRIO B (usa feedback do check anterior)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerarCenarioB(cenarioId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cen } = await sb.from('banco_cenarios')
      .select('id, empresa_id, competencia_id, cargo, titulo, descricao, justificativa_check, sugestao_check')
      .eq('id', cenarioId).single();
    if (!cen) return { success: false, error: 'Cenário não encontrado' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', cen.empresa_id).single();

    const { data: comp } = await sb.from('competencias')
      .select('id, nome, descricao, cod_comp').eq('id', cen.competencia_id).maybeSingle();
    if (!comp) return { success: false, error: 'Competência não encontrada' };

    const descritoresTexto = await fetchDescritoresTexto(sb, cen.empresa_id, comp.cod_comp);

    // Buscar cenário A original para referência (qualquer tipo != cenario_b para mesma comp+cargo)
    const { data: cenA } = await sb.from('banco_cenarios')
      .select('titulo, descricao')
      .eq('empresa_id', cen.empresa_id)
      .eq('competencia_id', cen.competencia_id)
      .eq('cargo', cen.cargo)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
      .limit(1).maybeSingle();

    const { data: ppps } = await sb.from('ppp_escolas')
      .select('valores').eq('empresa_id', cen.empresa_id).limit(1);
    const pppContexto = ppps?.[0]?.valores ? JSON.stringify(ppps[0].valores) : '';

    const feedbackExtra = [cen.justificativa_check, cen.sugestao_check].filter(Boolean).join('\n');
    const refCenA = cenA || { cargo: cen.cargo, titulo: cen.titulo, descricao: cen.descricao };
    refCenA.cargo = cen.cargo;

    const { system, user } = buildCenBPrompts(empresa, refCenA, comp, descritoresTexto, pppContexto, feedbackExtra);
    const resposta = await callAI(system, user, aiConfig, 4096, { temperature: TEMP });
    const cenarioData = await extractJSON(resposta);
    if (!cenarioData?.titulo) return { success: false, error: 'IA não retornou cenário válido' };

    const { error: updErr } = await sb.from('banco_cenarios').update({
      titulo: cenarioData.titulo,
      descricao: cenarioData.descricao,
      alternativas: {
        p1: cenarioData.p1,
        p2: cenarioData.p2,
        p3: cenarioData.p3,
        p4: cenarioData.p4,
        referencia_avaliacao: cenarioData.referencia_avaliacao,
        dilema_etico: cenarioData.dilema_etico_embutido,
        faceta_avaliada: cenarioData.faceta_avaliada,
      },
      nota_check: null,
      status_check: null,
      dimensoes_check: null,
      justificativa_check: null,
      sugestao_check: null,
      checked_at: null,
    }).eq('id', cenarioId);

    if (updErr) return { success: false, error: updErr.message };
    return { success: true, message: `Cenário B regenerado: ${comp.nome}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. INICIAR REAVALIAÇÃO EM LOTE
// Cria sessões conversacionais para cada colaborador (8 turnos, mentoria)
// ══════════════════════════════════════════════════════════════════════════════

export async function iniciarReavaliacaoLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, email, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .eq('empresa_id', empresaId);
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Cenários B
    const { data: cenariosB } = await sb.from('banco_cenarios')
      .select('id, competencia_id, cargo').eq('empresa_id', empresaId).eq('tipo_cenario', 'cenario_b');
    if (!cenariosB?.length) return { success: false, error: 'Nenhum cenário B. Gere cenários B primeiro.' };
    const cenarioMap = {};
    cenariosB.forEach(c => { cenarioMap[`${c.competencia_id}::${c.cargo}`] = c.id; });

    // Respostas iniciais (baseline com pontos fortes/gaps)
    const { data: respostas } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia')
      .eq('empresa_id', empresaId).not('avaliacao_ia', 'is', null);
    const baselineMap = {};
    (respostas || []).forEach(r => {
      baselineMap[`${r.colaborador_id}::${r.competencia_id}`] = {
        nivel: r.nivel_ia4,
        avaliacao: r.avaliacao_ia,
      };
    });

    // Top 5 por cargo
    const { data: cargosEmpresa } = await sb.from('cargos_empresa')
      .select('nome, top5_workshop').eq('empresa_id', empresaId);
    const top5Map = {};
    (cargosEmpresa || []).forEach(c => { if (c.top5_workshop?.length) top5Map[c.nome] = c.top5_workshop; });

    // Competências nome→id
    const { data: competencias } = await sb.from('competencias')
      .select('id, nome, cargo, gabarito').eq('empresa_id', empresaId);
    const compMap = {};
    (competencias || []).forEach(c => { compMap[`${c.nome}::${c.cargo}`] = c; });

    // Trilha progresso
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('colaborador_id, pct_conclusao, semana_atual').eq('empresa_id', empresaId);
    const progMap = {};
    (progressos || []).forEach(p => { progMap[p.colaborador_id] = p; });

    // Sessões já criadas
    const { data: sessoes } = await sb.from('reavaliacao_sessoes')
      .select('colaborador_id, competencia_id').eq('empresa_id', empresaId);
    const jaCriado = new Set((sessoes || []).map(s => `${s.colaborador_id}::${s.competencia_id}`));

    let criados = 0;
    for (const colab of colaboradores) {
      const top5 = top5Map[colab.cargo];
      if (!top5?.length) continue;

      for (const compNome of top5) {
        const comp = compMap[`${compNome}::${colab.cargo}`];
        if (!comp) continue;
        const cenarioBId = cenarioMap[`${comp.id}::${colab.cargo}`];
        if (!cenarioBId) continue;
        if (jaCriado.has(`${colab.id}::${comp.id}`)) continue;

        const baseline = baselineMap[`${colab.id}::${comp.id}`] || null;
        const trilha = progMap[colab.id] || null;

        // Extrair pontos fortes e gaps da avaliação inicial
        const avIni = typeof baseline?.avaliacao === 'string' ? JSON.parse(baseline.avaliacao) : baseline?.avaliacao;
        const pontosFortes = avIni?.descritores_destaque?.pontos_fortes || avIni?.pontos_fortes || [];
        const pontosAtencao = avIni?.descritores_destaque?.gaps_prioritarios || avIni?.pontos_desenvolvimento || [];

        // Descritores com código
        const descritores = Array.isArray(comp.gabarito)
          ? comp.gabarito.map((d, i) => ({ codigo: `D${i+1}`, nome: d.nome || d.descritor || `Descritor ${i+1}` }))
          : [];

        const { error } = await sb.from('reavaliacao_sessoes').insert({
          empresa_id: empresaId,
          colaborador_id: colab.id,
          competencia_id: comp.id,
          cenario_b_id: cenarioBId,
          baseline_nivel: baseline?.nivel || null,
          baseline_avaliacao: baseline?.avaliacao || null,
          status: 'pendente',
          historico: [],
          turno: 0,
          // Contexto enriquecido para a conversa
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

        if (!error) criados++;
      }
    }

    return { success: true, message: `${criados} sessões de reavaliação criadas` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. PROCESSAR REAVALIAÇÃO CONVERSACIONAL (1 sessão, 8 turnos)
// Prompt completo com: baseline, descritores D1-D6, trilha, DISC, exemplos
// ══════════════════════════════════════════════════════════════════════════════

function buildReavSystemPrompt(sessao, comp) {
  const ctx = sessao.extracao_qualitativa?._contexto_sessao || {};
  const descritores = ctx.descritores || [];
  const pontosFortes = ctx.pontos_fortes || [];
  const pontosAtencao = ctx.pontos_atencao || [];
  const disc = ctx.disc || {};
  const trilha = ctx.trilha || {};

  return `Você é o Mentor IA do programa Vertho. Está conduzindo uma conversa de reavaliação com ${sessao.colaboradores?.nome_completo || 'o colaborador'} após ${trilha.semana || 14} semanas de capacitação.

## SEU OBJETIVO
Investigar o que MUDOU NA PRÁTICA — não teoria aprendida.
Buscar evidências concretas de mudança comportamental.

## O QUE VOCÊ SABE SOBRE ESTE COLABORADOR
- Competência: ${comp?.nome || sessao.competencias?.nome}
- Nível baseline: N${sessao.baseline_nivel || '?'}
- Cargo: ${sessao.colaboradores?.cargo || 'N/D'}
- Perfil DISC: ${disc.perfil || 'N/D'} (D=${disc.D||0} I=${disc.I||0} S=${disc.S||0} C=${disc.C||0})
- Trilha: ${trilha.pct || 0}% concluída, semana ${trilha.semana || '?'}/14
${pontosFortes.length ? `- Pontos fortes identificados: ${pontosFortes.map(p => typeof p === 'string' ? p : p.descritor || p.nome).join('; ')}` : ''}
${pontosAtencao.length ? `- Gaps prioritários: ${pontosAtencao.map(p => typeof p === 'string' ? p : p.descritor || p.nome).join('; ')}` : ''}
${descritores.length ? `- Descritores da competência: ${descritores.map(d => `${d.codigo}: ${d.nome}`).join('; ')}` : ''}

## ROTEIRO DA CONVERSA (6 etapas)
1. ACOLHIMENTO: "Que bom que você chegou até aqui! Foram ${trilha.semana || 14} semanas de jornada..."
2. MUDANÇA GERAL: Pergunte o que mudou na prática (aberto, sem direcionar)
3. EVIDÊNCIA CONCRETA: "Pode me contar uma situação específica em que agiu diferente?"
4. DESCRITOR ESPECÍFICO: Aborde o gap principal${pontosAtencao[0] ? ` (${typeof pontosAtencao[0] === 'string' ? pontosAtencao[0] : pontosAtencao[0].descritor || pontosAtencao[0].nome})` : ''}
5. DIFICULDADE PERSISTENTE: "O que ainda é mais desafiador para você nessa competência?"
6. ENCERRAMENTO: "Muito obrigado! Na próxima etapa você vai responder ao cenário B."

## REGRAS INVIOLÁVEIS
1. Tom de MENTOR: curioso, acolhedor, não julgador
2. NUNCA revele o nível ou nota da avaliação inicial
3. NUNCA cite descritores por código (D1, D2...) — use linguagem natural
4. Busque FATOS, não opiniões ("o que você FEZ" > "o que você ACHA")
5. Se resposta for teórica, redirecione: "E na prática, como ficou?"
6. Se resposta for vaga, peça exemplo: "Pode me dar um exemplo concreto?"
7. Máximo ${MAX_TURNOS} turnos
8. Use [META]{"turno":N,"encerrar":false}[/META] ao final de CADA resposta

## IMPORTANTE
Você NÃO está avaliando. Está coletando evidências de mudança.
A análise será feita depois, por outro sistema.`;
}

export async function processarReavaliacao(sessaoId, mensagem, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: sessao } = await sb.from('reavaliacao_sessoes')
      .select('*, competencias!inner(nome, descricao, gabarito), colaboradores!inner(nome_completo, cargo)')
      .eq('id', sessaoId).single();

    if (!sessao) return { success: false, error: 'Sessão não encontrada' };
    if (sessao.status === 'concluida') return { success: false, error: 'Sessão já concluída' };

    const historico = sessao.historico || [];
    historico.push({ role: 'user', content: mensagem });

    const systemPrompt = buildReavSystemPrompt(sessao, sessao.competencias);
    const resposta = await callAIChat(systemPrompt, historico, aiConfig, 4096, { temperature: TEMP });

    historico.push({ role: 'assistant', content: resposta });
    const novoTurno = sessao.turno + 1;

    // Verificar [META]
    const metaMatch = resposta.match(/\[META\](.*?)\[\/META\]/s);
    let meta = {};
    try { meta = metaMatch ? JSON.parse(metaMatch[1]) : {}; } catch {}
    const encerrar = meta.encerrar || novoTurno >= MAX_TURNOS;

    await sb.from('reavaliacao_sessoes').update({
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
// Extrai evidências por descritor D1-D6, citações literais, consciência gap
// ══════════════════════════════════════════════════════════════════════════════

async function extrairDadosReavaliacao(sessaoId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  const { data: sessao } = await sb.from('reavaliacao_sessoes')
    .select('*, competencias!inner(nome, gabarito), colaboradores!inner(nome_completo, cargo)')
    .eq('id', sessaoId).single();
  if (!sessao) return;

  const ctx = sessao.extracao_qualitativa?._contexto_sessao || {};
  const descritores = Array.isArray(sessao.competencias.gabarito)
    ? sessao.competencias.gabarito.map((d, i) => `D${i+1}: ${d.nome || d.descritor || JSON.stringify(d)}`)
    : [];

  const system = `Analise a conversa de reavaliação e extraia dados qualitativos por descritor.
Use os códigos de descritores fornecidos (D1, D2...).
Responda APENAS com JSON válido.`;

  const user = `Competência: ${sessao.competencias.nome}
Colaborador: ${sessao.colaboradores.nome_completo} (${sessao.colaboradores.cargo})
Nível baseline: N${sessao.baseline_nivel || '?'}
Perfil DISC: ${ctx.disc?.perfil || 'N/D'}

Descritores da competência:
${descritores.join('\n')}

Conversa completa:
${sessao.historico.map(h => `${h.role === 'user' ? 'COLABORADOR' : 'MENTOR'}: ${h.content.replace(/\[META\].*?\[\/META\]/s, '')}`).join('\n\n')}

Extraia:
{
  "resumo_qualitativo": "3-4 linhas resumindo as mudanças relatadas",
  "evidencias_por_descritor": [
    {
      "descritor": "D1",
      "nome_descritor": "nome do descritor",
      "evidencia_relatada": "evidência concreta mencionada",
      "nivel_percebido": 1-4,
      "confianca": "alta|media|baixa",
      "citacao_literal": "frase exata do colaborador entre aspas"
    }
  ],
  "gaps_persistentes": ["D4", "D6"],
  "consciencia_do_gap": "alta|media|baixa",
  "conexao_cis": "como o perfil DISC (${ctx.disc?.perfil || 'N/D'}) apareceu na conversa",
  "recomendacao_ciclo2": "foco para próximo ciclo"
}`;

  const resultado = await callAI(system, user, aiConfig, 4096, { temperature: TEMP });
  const extracao = await extractJSON(resultado);

  if (extracao) {
    // Preservar _contexto_sessao e adicionar extração
    await sb.from('reavaliacao_sessoes')
      .update({ extracao_qualitativa: { ...extracao, _contexto_sessao: ctx } })
      .eq('id', sessaoId);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. EVOLUÇÃO COM FUSÃO DE 3 FONTES
// Cenário A + Cenário B + Conversa Sem15
// Convergência: CONFIRMADA, PARCIAL, SEM_EVOLUCAO, INVISIVEL
// Inclui: ganhos_qualitativos, trilha detalhada, conexao_cis em recomendação
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarEvolucaoFusao(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .eq('empresa_id', empresaId);
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Fonte 1: Respostas iniciais (Cenário A)
    const { data: respostasA } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia, r1, r2, r3, r4')
      .eq('empresa_id', empresaId).not('avaliacao_ia', 'is', null).is('tipo_resposta', null);

    // Fonte 2: Respostas reavaliação (Cenário B)
    const { data: respostasB } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia, r1, r2, r3, r4')
      .eq('empresa_id', empresaId).eq('tipo_resposta', 'cenario_b').not('avaliacao_ia', 'is', null);

    // Fonte 3: Conversa Semana 15
    const { data: sessoes } = await sb.from('reavaliacao_sessoes')
      .select('colaborador_id, competencia_id, extracao_qualitativa, baseline_nivel')
      .eq('empresa_id', empresaId).eq('status', 'concluida');

    // Competências
    const { data: competencias } = await sb.from('competencias')
      .select('id, nome, gabarito').eq('empresa_id', empresaId);
    const compMap = {};
    (competencias || []).forEach(c => { compMap[c.id] = c; });

    // Trilha progresso
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('colaborador_id, pct_conclusao, semana_atual, cursos_progresso')
      .eq('empresa_id', empresaId);
    const progMap = {};
    (progressos || []).forEach(p => { progMap[p.colaborador_id] = p; });

    // Mapas
    const resAMap = {};
    (respostasA || []).forEach(r => { resAMap[`${r.colaborador_id}::${r.competencia_id}`] = r; });
    const resBMap = {};
    (respostasB || []).forEach(r => { resBMap[`${r.colaborador_id}::${r.competencia_id}`] = r; });
    const sessaoMap = {};
    (sessoes || []).forEach(s => { sessaoMap[`${s.colaborador_id}::${s.competencia_id}`] = s; });

    const system = `Você é o Mentor IA do programa Vertho. Sua tarefa é analisar a EVOLUÇÃO de um colaborador comparando avaliação inicial com reavaliação, usando até 3 fontes de dados.

## FONTES DE DADOS
1. Cenário A — diagnóstico inicial (nível, nota, descritores, feedback IA)
2. Cenário B — reavaliação situacional (nível, evidências observadas)
3. Conversa Semana 15 — reavaliação qualitativa (o que o colaborador RELATA ter mudado)

## ANÁLISE POR DESCRITOR
Para CADA descritor da competência:
1. Calcule delta numérico (nível B - nível A)
2. Identifique evidência DEMONSTRADA no cenário B
3. Identifique evidência RELATADA na conversa
4. Cruze as 3 fontes e classifique CONVERGÊNCIA

## CLASSIFICAÇÃO DE CONVERGÊNCIA
| Classificação | Critério |
|---|---|
| EVOLUCAO_CONFIRMADA | Delta positivo + evidência no cenário B + relato convergente |
| EVOLUCAO_PARCIAL | Delta positivo em apenas 1-2 fontes OU evidência fraca |
| SEM_EVOLUCAO | Sem delta + sem evidência + sem relato |
| EVOLUCAO_INVISIVEL | Sem delta numérico MAS evidência qualitativa forte |

## CONSCIÊNCIA DO GAP
Avalie se o colaborador PERCEBE seus próprios gaps:
- alta: reconhece explicitamente, cita ações de melhoria
- media: reconhece parcialmente ou de forma genérica
- baixa: não reconhece ou atribui a fatores externos

## CONEXÃO CIS (DISC)
Conecte gaps persistentes ao perfil comportamental DISC.
Ex: "Perfil D alto pode dificultar a escuta ativa (descritor D3)"

## TRILHA — EFETIVIDADE
Analise correlação entre engajamento na trilha e evolução.

Responda APENAS com JSON válido.`;

    let gerados = 0;
    for (const colab of colaboradores) {
      const compIds = [...new Set([
        ...(respostasA || []).filter(r => r.colaborador_id === colab.id).map(r => r.competencia_id),
        ...(sessoes || []).filter(s => s.colaborador_id === colab.id).map(s => s.competencia_id),
      ])];

      for (const compId of compIds) {
        const key = `${colab.id}::${compId}`;
        const fonteA = resAMap[key];
        const fonteB = resBMap[key];
        const fonteSem15 = sessaoMap[key];
        const comp = compMap[compId];
        if (!comp || !fonteA) continue;
        if (!fonteB && !fonteSem15) continue;

        const trilha = progMap[colab.id];
        const cursosInfo = Array.isArray(trilha?.cursos_progresso)
          ? trilha.cursos_progresso
          : [];
        const cursosConcluidos = cursosInfo.filter(c => c.concluido).length;

        // Descritores com código
        const descritores = Array.isArray(comp.gabarito)
          ? comp.gabarito.map((d, i) => `D${i+1}: ${d.nome || d.descritor || JSON.stringify(d)}`)
          : [];

        // Extração da conversa (sem _contexto_sessao)
        const extSem15 = fonteSem15?.extracao_qualitativa || {};
        const extLimpo = { ...extSem15 };
        delete extLimpo._contexto_sessao;

        const user = `## Contexto
Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${colab.nome_completo} | Cargo: ${colab.cargo}
Perfil DISC: ${colab.perfil_dominante || 'N/D'} (D=${colab.d_natural||0} I=${colab.i_natural||0} S=${colab.s_natural||0} C=${colab.c_natural||0})

## Competência: ${comp.nome}
Descritores:
${descritores.join('\n')}

## FONTE 1 — Cenário A (avaliação inicial)
Nível: N${fonteA.nivel_ia4}
Avaliação: ${JSON.stringify(fonteA.avaliacao_ia)}

## FONTE 2 — Cenário B (reavaliação)
${fonteB ? `Nível: N${fonteB.nivel_ia4}\nAvaliação: ${JSON.stringify(fonteB.avaliacao_ia)}` : 'Não disponível'}

## FONTE 3 — Conversa Semana 15 (reavaliação qualitativa)
${Object.keys(extLimpo).length ? JSON.stringify(extLimpo) : 'Não disponível'}

## Trilha de capacitação
Progresso: ${trilha?.pct_conclusao || 0}%
Semana: ${trilha?.semana_atual || '?'}/14
Cursos concluídos: ${cursosConcluidos} de ${cursosInfo.length}

## Formato de saída (JSON):
{
  "resumo_executivo": {
    "nota_cenario_a": N,
    "nota_cenario_b": N ou null,
    "delta": N,
    "nivel_a": "N1-N4",
    "nivel_b": "N1-N4 ou null",
    "descritores_que_subiram": N,
    "descritores_total": N,
    "sintese": "2-3 frases"
  },
  "evolucao_por_descritor": [
    {
      "descritor": "D1",
      "nome": "nome do descritor",
      "nivel_a": N, "nivel_b": N, "delta": N,
      "evidencia_cenario_b": "evidência observada",
      "evidencia_conversa": "evidência relatada",
      "citacao_colaborador": "frase literal se existir",
      "convergencia": "EVOLUCAO_CONFIRMADA|EVOLUCAO_PARCIAL|SEM_EVOLUCAO|EVOLUCAO_INVISIVEL",
      "conexao_cis": "relação com perfil DISC",
      "confianca": "alta|media|baixa"
    }
  ],
  "ganhos_qualitativos": "evolução que NÃO aparece nos números (mudança de postura, consciência, etc)",
  "consciencia_do_gap": "alta|media|baixa",
  "trilha_efetividade": {
    "semanas_concluidas": ${trilha?.semana_atual || 0},
    "cursos_concluidos": ${cursosConcluidos},
    "correlacao": "análise da relação entre engajamento e evolução"
  },
  "recomendacao_ciclo2": {
    "descritores_foco": ["D1", "D4"],
    "justificativa": "por que estes descritores",
    "formato_sugerido": "1:1|grupo|autodirigido|misto",
    "conexao_cis": "como adaptar ao perfil DISC ${colab.perfil_dominante || 'do colaborador'}"
  },
  "feedback_colaborador": "8-10 linhas, tom mentor, construtivo, celebre avanços antes de apontar gaps"
}`;

        const resultado = await callAI(system, user, aiConfig, 64000, { temperature: TEMP });
        const fusao = await extractJSON(resultado);
        if (!fusao) continue;

        await sb.from('relatorios').upsert({
          empresa_id: empresaId,
          colaborador_id: colab.id,
          tipo: 'evolucao',
          conteudo: { competencia: comp.nome, competencia_id: compId, ...fusao },
          gerado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id,tipo' });
        gerados++;
      }
    }

    return { success: true, message: `${gerados} relatórios de evolução (fusão 3 fontes) gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. PLENÁRIA DE EVOLUÇÃO INSTITUCIONAL
// Relatório agregado anônimo: por cargo, competência, convergência, gaps, Ciclo 2
// Tom: celebre avanços ANTES de apontar gaps
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarPlenariaEvolucao(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('conteudo, colaboradores!inner(nome_completo, cargo)')
      .eq('empresa_id', empresaId).eq('tipo', 'evolucao');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório de evolução. Gere a evolução primeiro.' };

    // Agregar (ANÔNIMO)
    const porCargo = {}, porComp = {};
    let totalDelta = 0, totalDescUp = 0, totalDesc = 0;
    const convergencias = { EVOLUCAO_CONFIRMADA: 0, EVOLUCAO_PARCIAL: 0, SEM_EVOLUCAO: 0, EVOLUCAO_INVISIVEL: 0 };
    const gapsPersistentes = {};

    for (const rel of relatorios) {
      const c = rel.conteudo;
      const cargo = rel.colaboradores.cargo;
      const compNome = c.competencia || 'N/D';
      if (!porCargo[cargo]) porCargo[cargo] = { deltas: [], descUp: 0, descTotal: 0, count: 0 };
      if (!porComp[compNome]) porComp[compNome] = { deltas: [], descUp: 0, descTotal: 0, count: 0 };

      const re = c.resumo_executivo || {};
      const delta = re.delta || 0;
      totalDelta += delta;
      totalDescUp += re.descritores_que_subiram || 0;
      totalDesc += re.descritores_total || 0;
      porCargo[cargo].deltas.push(delta); porCargo[cargo].descUp += re.descritores_que_subiram || 0; porCargo[cargo].descTotal += re.descritores_total || 0; porCargo[cargo].count++;
      porComp[compNome].deltas.push(delta); porComp[compNome].descUp += re.descritores_que_subiram || 0; porComp[compNome].descTotal += re.descritores_total || 0; porComp[compNome].count++;

      (c.evolucao_por_descritor || []).forEach(d => {
        if (convergencias[d.convergencia] !== undefined) convergencias[d.convergencia]++;
        if (d.convergencia === 'SEM_EVOLUCAO') gapsPersistentes[d.descritor] = (gapsPersistentes[d.descritor] || 0) + 1;
      });
    }

    const avg = arr => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : '0';
    const totalConv = Object.values(convergencias).reduce((s, v) => s + v, 0) || 1;

    const system = `Você é o Motor de Plenária de Evolução do programa Vertho Mentor IA.
Sua tarefa é analisar dados AGREGADOS de evolução de um grupo de profissionais após 14 semanas de capacitação.

ESTE RELATÓRIO É DIFERENTE DA PLENÁRIA INICIAL.
A plenária inicial mostra o DIAGNÓSTICO. Esta mostra a EVOLUÇÃO.

## ESTRUTURA DO RELATÓRIO (6 seções):
1. VISÃO GERAL DA EVOLUÇÃO — delta médio, % que avançou, descritores com mais evolução
2. ANÁLISE POR CARGO — para cada cargo: delta, gaps comuns, destaques
3. ANÁLISE POR COMPETÊNCIA — para cada competência: evolução média, descritores que evoluíram, gaps persistentes
4. CONVERGÊNCIA DE EVIDÊNCIAS — % confirmada/parcial/sem/invisível + interpretação dos padrões
5. GAPS PERSISTENTES — ALERTA INSTITUCIONAL — descritores com mais gaps, padrões coletivos
6. RECOMENDAÇÕES PARA CICLO 2 — descritores foco, formato sugerido, ações institucionais

## REGRAS:
- Dados são ANÔNIMOS — NUNCA cite nomes de colaboradores
- Use estatísticas e percentuais, não casos individuais
- Tom institucional, construtivo, orientado a ação
- CELEBRE AVANÇOS ANTES de apontar gaps
- Português brasileiro

Responda APENAS com JSON válido.`;

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Total: ${relatorios.length} colaboradores analisados

Delta médio: ${avg(relatorios.map(r => r.conteudo?.resumo_executivo?.delta || 0))}
Descritores que subiram: ${totalDescUp} de ${totalDesc} (${totalDesc ? Math.round(totalDescUp/totalDesc*100) : 0}%)

Convergências:
- CONFIRMADA: ${convergencias.EVOLUCAO_CONFIRMADA} (${Math.round(convergencias.EVOLUCAO_CONFIRMADA/totalConv*100)}%)
- PARCIAL: ${convergencias.EVOLUCAO_PARCIAL} (${Math.round(convergencias.EVOLUCAO_PARCIAL/totalConv*100)}%)
- SEM EVOLUÇÃO: ${convergencias.SEM_EVOLUCAO} (${Math.round(convergencias.SEM_EVOLUCAO/totalConv*100)}%)
- INVISÍVEL: ${convergencias.EVOLUCAO_INVISIVEL} (${Math.round(convergencias.EVOLUCAO_INVISIVEL/totalConv*100)}%)

Por cargo:
${Object.entries(porCargo).map(([cargo, d]) => `  ${cargo}: delta ${avg(d.deltas)}, ${d.descUp}/${d.descTotal} descritores, ${d.count} colaboradores`).join('\n')}

Por competência:
${Object.entries(porComp).map(([comp, d]) => `  ${comp}: delta ${avg(d.deltas)}, ${d.descUp}/${d.descTotal} descritores`).join('\n')}

Gaps persistentes (top 10):
${Object.entries(gapsPersistentes).sort((a,b) => b[1]-a[1]).slice(0,10).map(([d, n]) => `  ${d}: ${n} ocorrências`).join('\n')}

Gere:
{
  "titulo": "Plenária de Evolução — ${empresa.nome}",
  "resumo_evolucao": "análise geral celebrando avanços + indicando desafios",
  "percentual_medio_evolucao": N,
  "analise_por_cargo": [{"cargo": "...", "delta_medio": N, "destaque_positivo": "...", "gap_principal": "...", "recomendacao": "..."}],
  "analise_por_competencia": [{"competencia": "...", "delta_medio": N, "descritores_que_evoluiram": "...", "gap_persistente": "..."}],
  "convergencia_institucional": {
    "confirmada_pct": N, "parcial_pct": N, "sem_evolucao_pct": N, "invisivel_pct": N,
    "interpretacao": "o que esses números dizem sobre a efetividade do programa"
  },
  "gaps_persistentes_institucionais": ["top 5 descritores + padrão coletivo"],
  "recomendacoes_ciclo2": ["5-7 recomendações concretas incluindo formato e ações institucionais"],
  "formato_plenaria_sugerido": "como apresentar na plenária"
}`;

    const resultado = await callAI(system, user, aiConfig, 64000, { temperature: TEMP });
    const plenaria = await extractJSON(resultado);

    if (plenaria) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId, colaborador_id: null, tipo: 'plenaria_evolucao',
        conteudo: plenaria, gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Plenária de evolução institucional gerada' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. FUNÇÕES AUXILIARES (compatibilidade)
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarRelatoriosEvolucaoLote(empresaId, aiConfig = {}) {
  return gerarEvolucaoFusao(empresaId, aiConfig);
}

export async function gerarRelatorioRHManual(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: relEvolucao } = await sb.from('relatorios').select('*, colaboradores(nome_completo, cargo)').eq('empresa_id', empresaId).eq('tipo', 'evolucao');
    const { data: relRHAnterior } = await sb.from('relatorios').select('conteudo').eq('empresa_id', empresaId).eq('tipo', 'rh').single();

    const system = `Você é um consultor estratégico de RH. Gere relatório analítico pós-desenvolvimento. Responda APENAS com JSON válido.`;
    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
RH anterior: ${JSON.stringify(relRHAnterior?.conteudo || {}, null, 2)}
Evolução: ${JSON.stringify((relEvolucao || []).map(r => ({ nome: r.colaboradores?.nome_completo, ...r.conteudo })), null, 2)}

Gere: { "resumo_executivo": "...", "roi_desenvolvimento": "...", "evolucao_organizacional": "...", "gaps_resolvidos": ["..."], "gaps_persistentes": ["..."], "recomendacoes_estrategicas": ["..."], "proximos_ciclos": ["..."] }`;

    const resultado = await callAI(system, user, aiConfig, 8000, { temperature: TEMP });
    const relatorio = await extractJSON(resultado);
    if (relatorio) {
      await sb.from('relatorios').upsert({ empresa_id: empresaId, colaborador_id: null, tipo: 'rh_manual', conteudo: relatorio, gerado_em: new Date().toISOString() }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }
    return { success: true, message: 'Relatório RH manual gerado' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarRelatorioPlenaria(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: plenaria } = await sb.from('relatorios').select('conteudo').eq('empresa_id', empresaId).eq('tipo', 'plenaria_evolucao').single();
    if (!plenaria) return { success: false, error: 'Plenária de evolução não encontrada.' };
    const { data: empresa } = await sb.from('empresas').select('nome').eq('id', empresaId).single();

    const system = `Transforme dados da plenária em relatório formal. Responda APENAS com JSON válido.`;
    const user = `Empresa: ${empresa.nome}\nDados: ${JSON.stringify(plenaria.conteudo, null, 2)}
Gere: { "titulo": "...", "data": "${new Date().toISOString().split('T')[0]}", "pauta": ["..."], "resultados": "...", "deliberacoes": ["..."], "encaminhamentos": [{"acao": "...", "responsavel": "...", "prazo": "..."}] }`;

    const resultado = await callAI(system, user, aiConfig, 4096, { temperature: TEMP });
    const relatorio = await extractJSON(resultado);
    if (relatorio) {
      await sb.from('relatorios').upsert({ empresa_id: empresaId, colaborador_id: null, tipo: 'plenaria_relatorio', conteudo: relatorio, gerado_em: new Date().toISOString() }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }
    return { success: true, message: 'Relatório da plenária gerado' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function enviarLinksPerfil(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas').select('nome, slug').eq('id', empresaId).single();
    const { data: colaboradores } = await sb.from('colaboradores').select('id, nome_completo, email').eq('empresa_id', empresaId);
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    let enviados = 0;
    for (const colab of colaboradores) {
      try {
        await resend.emails.send({
          from: `Vertho Mentor <noreply@${empresa.slug}.vertho.com.br>`,
          to: colab.email,
          subject: `[${empresa.nome}] Seu Perfil de Evolução`,
          html: `<p>Olá ${colab.nome_completo}!</p><p>Seu perfil está disponível.</p><p><a href="https://${empresa.slug}.vertho.com.br/dashboard/evolucao" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Acessar Perfil</a></p>`,
        });
        enviados++;
      } catch {}
    }
    return { success: true, message: `${enviados} links enviados` };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarDossieGestor(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: todos } = await sb.from('relatorios').select('tipo, conteudo, colaboradores(nome_completo, cargo)').eq('empresa_id', empresaId);
    const porTipo = {};
    for (const r of todos || []) { if (!porTipo[r.tipo]) porTipo[r.tipo] = []; porTipo[r.tipo].push({ colaborador: r.colaboradores?.nome_completo, resumo: r.conteudo?.resumo_executivo || r.conteudo?.evolucao_geral }); }

    const resultado = await callAI('Compile em dossiê executivo. JSON válido.', `Empresa: ${empresa.nome} (${empresa.segmento})\nRelatórios: ${JSON.stringify(porTipo, null, 2)}\nGere: { "titulo": "...", "sumario_executivo": "...", "diagnostico_inicial": "...", "evolucao": "...", "roi": "...", "recomendacoes": ["..."], "conclusao": "..." }`, aiConfig, 8000, { temperature: TEMP });
    const dossie = await extractJSON(resultado);
    if (dossie) { await sb.from('relatorios').upsert({ empresa_id: empresaId, colaborador_id: null, tipo: 'dossie_gestor', conteudo: dossie, gerado_em: new Date().toISOString() }, { onConflict: 'empresa_id,colaborador_id,tipo' }); }
    return { success: true, message: 'Dossiê do gestor gerado' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function checkCenarios(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cenarios } = await sb.from('banco_cenarios').select('id, titulo, descricao, alternativas, competencias!inner(nome)').eq('empresa_id', empresaId);
    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário encontrado' };

    const resultado = await callAI('Verifique qualidade dos cenários. JSON válido.', `Verifique ${cenarios.length} cenários: ${JSON.stringify(cenarios.slice(0, 20), null, 2)}\nRetorne: { "total": ${Math.min(cenarios.length, 20)}, "aprovados": N, "com_ressalvas": N, "reprovados": N, "detalhes": [{"cenario_id": "...", "status": "...", "observacao": "..."}] }`, aiConfig, 64000, { temperature: TEMP });
    const verificacao = await extractJSON(resultado);
    return { success: true, message: `Verificação: ${verificacao?.aprovados || 0} aprovados, ${verificacao?.com_ressalvas || 0} com ressalvas`, verificacao };
  } catch (err) { return { success: false, error: err.message }; }
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. CARREGAR CENÁRIOS B (para tela de visualização)
// ══════════════════════════════════════════════════════════════════════════════

export async function loadCenariosB(empresaId) {
  const sb = createSupabaseAdmin();

  // Buscar cenários B
  const { data } = await sb.from('banco_cenarios')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('tipo_cenario', 'cenario_b')
    .order('cargo', { ascending: true });

  if (!data?.length) return [];

  // Buscar cenários A correspondentes para pegar o nome da competência via título
  // (workaround: a query de competencias falha no Vercel)
  const { data: cenariosA } = await sb.from('banco_cenarios')
    .select('competencia_id, titulo')
    .eq('empresa_id', empresaId)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');

  // Tentar buscar competências (pode falhar no Vercel)
  const compIds = [...new Set(data.map(c => c.competencia_id).filter(Boolean))];
  const compMap = {};
  for (const cid of compIds) {
    const { data: comp } = await sb.from('competencias').select('nome').eq('id', cid).maybeSingle();
    if (comp) compMap[cid] = comp.nome;
  }

  // Fallback: extrair faceta_avaliada do alternativas
  return data.map(c => ({
    ...c,
    competencia_nome: compMap[c.competencia_id] || c.alternativas?.faceta_avaliada || '',
    alternativas: typeof c.alternativas === 'string' ? JSON.parse(c.alternativas) : (c.alternativas || {}),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. CHECK CENÁRIOS B EM LOTE (mesma lógica do check cenário A)
// ══════════════════════════════════════════════════════════════════════════════

export async function checkCenariosBLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cenarios } = await sb.from('banco_cenarios')
      .select('id, empresa_id, titulo, descricao, cargo, competencia_id, alternativas, nota_check')
      .eq('empresa_id', empresaId)
      .eq('tipo_cenario', 'cenario_b');

    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário B encontrado. Gere cenários B primeiro.' };

    const pendentes = cenarios.filter(c => c.nota_check == null);
    if (!pendentes.length) return { success: true, message: `Todos os ${cenarios.length} cenários B já foram checados` };

    const modelo = aiConfig?.checkModel || aiConfig?.model || 'gemini-3-flash-preview';
    const compCache = {}, descCache = {};
    let ok = 0, erros = 0;

    for (const cen of pendentes) {
      try {
        let comp = compCache[cen.competencia_id];
        if (!comp) {
          const { data } = await sb.from('competencias')
            .select('id, nome, cod_comp').eq('id', cen.competencia_id).maybeSingle();
          comp = compCache[cen.competencia_id] = data || null;
        }
        let descritoresTexto = descCache[cen.competencia_id];
        if (descritoresTexto === undefined) {
          descritoresTexto = descCache[cen.competencia_id] = comp ? await fetchDescritoresTexto(sb, empresaId, comp.cod_comp) : '';
        }
        const r = await runCheckOnCenB(sb, cen, comp, descritoresTexto, modelo);
        if (r.success) ok++; else erros++;
      } catch { erros++; }
    }

    return { success: true, message: `Check cenários B: ${ok} checados${erros ? `, ${erros} erros` : ''} (${cenarios.length - pendentes.length} já checados antes)` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. REGENERAR + RECHECAR EM LOTE (todos os cenários B com nota < 90)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerarERecheckarCenariosBLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cenarios } = await sb.from('banco_cenarios')
      .select('id, nota_check, titulo')
      .eq('empresa_id', empresaId)
      .eq('tipo_cenario', 'cenario_b')
      .lt('nota_check', 90);

    if (!cenarios?.length) return { success: true, message: 'Nenhum cenário B abaixo de 90 para regenerar' };

    const checkModel = aiConfig?.checkModel || 'gemini-3-flash-preview';
    let regenerados = 0, aprovados = 0, revisar = 0, erros = 0;

    for (const c of cenarios) {
      try {
        const r1 = await regenerarCenarioB(c.id, { model: aiConfig?.model });
        if (!r1.success) { erros++; continue; }
        regenerados++;
        const r2 = await checkCenarioBUm(c.id, checkModel);
        if (r2.success) {
          if (r2.status === 'aprovado') aprovados++; else revisar++;
        }
      } catch { erros++; }
    }

    return { success: true, message: `${regenerados} regenerados | ${aprovados} aprovados, ${revisar} ainda para revisar${erros ? `, ${erros} erros` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
