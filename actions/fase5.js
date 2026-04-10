'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── Constantes ──────────────────────────────────────────────────────────────
const MAX_TURNOS = 8;

// ── 1. Gerar Cenários B em Lote ────────────────────────────────────────────
// Cria cenários B customizados para cada cargo/competência (diferente do A)

export async function gerarCenariosBLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar cenários A existentes (agrupados por cargo+competência)
    const { data: cenariosA } = await sb.from('banco_cenarios')
      .select('id, titulo, descricao, cargo, competencia_id, competencias!inner(nome, descricao, gabarito)')
      .eq('empresa_id', empresaId)
      .is('tipo_cenario', null); // cenários originais (não B)

    if (!cenariosA?.length) return { success: false, error: 'Nenhum cenário A encontrado. Rode IA3 primeiro.' };

    // Verificar quais já têm cenário B
    const { data: cenariosB } = await sb.from('banco_cenarios')
      .select('competencia_id, cargo')
      .eq('empresa_id', empresaId)
      .eq('tipo_cenario', 'cenario_b');
    const jaTemB = new Set((cenariosB || []).map(c => `${c.competencia_id}::${c.cargo}`));

    const system = `Você é um especialista em avaliação de competências comportamentais.
Crie um CENÁRIO B complementar ao cenário A existente.
O cenário B usa a MESMA competência mas com situação-gatilho DIFERENTE.
Foco em dilemas cotidianos realistas, não extremos.
O cenário deve permitir respostas em 4 níveis (N1 a N4).
Responda APENAS com JSON válido.`;

    let gerados = 0;
    for (const cenA of cenariosA) {
      const key = `${cenA.competencia_id}::${cenA.cargo}`;
      if (jaTemB.has(key)) continue;

      const user = `Competência: ${cenA.competencias.nome}
Descrição: ${cenA.competencias.descricao}
Gabarito: ${JSON.stringify(cenA.competencias.gabarito)}
Cargo: ${cenA.cargo}

Cenário A (NÃO repetir): ${cenA.titulo} — ${cenA.descricao}

Gere cenário B:
{
  "titulo": "título do cenário B",
  "descricao": "contexto (80-150 palavras, personagens brasileiros, situação concreta)",
  "p1": "pergunta sobre a SITUAÇÃO (o que você faria?)",
  "p2": "pergunta sobre a AÇÃO (como implementaria?)",
  "p3": "pergunta sobre o RACIOCÍNIO (por que essa abordagem?)",
  "p4": "pergunta sobre AUTOSSENSIBILIDADE (como se sentiu/percebeu?)",
  "referencia_avaliacao": {
    "nivel_1": "resposta típica N1",
    "nivel_2": "resposta típica N2",
    "nivel_3": "resposta típica N3",
    "nivel_4": "resposta típica N4"
  }
}`;

      const resultado = await callAI(system, user, aiConfig, 4000);
      const cenarioData = await extractJSON(resultado);
      if (!cenarioData?.titulo) continue;

      await sb.from('banco_cenarios').insert({
        empresa_id: empresaId,
        competencia_id: cenA.competencia_id,
        cargo: cenA.cargo,
        titulo: cenarioData.titulo,
        descricao: cenarioData.descricao,
        p1: cenarioData.p1,
        p2: cenarioData.p2,
        p3: cenarioData.p3,
        p4: cenarioData.p4,
        alternativas: cenarioData.referencia_avaliacao,
        tipo_cenario: 'cenario_b',
      });
      gerados++;
    }

    return { success: true, message: `${gerados} cenários B gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── 2. Iniciar Reavaliação Conversacional ──────────────────────────────────
// Cria sessões de reavaliação para cada colaborador (conversa guiada de 8 turnos)

export async function iniciarReavaliacaoLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, email')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Buscar cenários B
    const { data: cenariosB } = await sb.from('banco_cenarios')
      .select('id, competencia_id, cargo')
      .eq('empresa_id', empresaId)
      .eq('tipo_cenario', 'cenario_b');

    if (!cenariosB?.length) return { success: false, error: 'Nenhum cenário B. Gere cenários B primeiro.' };

    const cenarioMap = {};
    cenariosB.forEach(c => {
      const key = `${c.competencia_id}::${c.cargo}`;
      cenarioMap[key] = c.id;
    });

    // Buscar respostas iniciais (para incluir baseline na reavaliação)
    const { data: respostas } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    const baselineMap = {};
    (respostas || []).forEach(r => {
      const key = `${r.colaborador_id}::${r.competencia_id}`;
      baselineMap[key] = { nivel: r.nivel_ia4, avaliacao: r.avaliacao_ia };
    });

    // Buscar competências usadas (top5 de cada cargo)
    const { data: cargosEmpresa } = await sb.from('cargos_empresa')
      .select('nome, top5_workshop')
      .eq('empresa_id', empresaId);
    const top5Map = {};
    (cargosEmpresa || []).forEach(c => { if (c.top5_workshop?.length) top5Map[c.nome] = c.top5_workshop; });

    // Buscar competências por nome → id
    const { data: competencias } = await sb.from('competencias')
      .select('id, nome, cargo')
      .eq('empresa_id', empresaId);
    const compPorNomeCargo = {};
    (competencias || []).forEach(c => { compPorNomeCargo[`${c.nome}::${c.cargo}`] = c.id; });

    let criados = 0;
    for (const colab of colaboradores) {
      const top5 = top5Map[colab.cargo];
      if (!top5?.length) continue;

      for (const compNome of top5) {
        const compId = compPorNomeCargo[`${compNome}::${colab.cargo}`];
        if (!compId) continue;

        const cenarioKey = `${compId}::${colab.cargo}`;
        const cenarioBId = cenarioMap[cenarioKey];
        if (!cenarioBId) continue;

        const baselineKey = `${colab.id}::${compId}`;
        const baseline = baselineMap[baselineKey] || null;

        // Criar sessão de reavaliação
        const { error } = await sb.from('reavaliacao_sessoes').insert({
          empresa_id: empresaId,
          colaborador_id: colab.id,
          competencia_id: compId,
          cenario_b_id: cenarioBId,
          baseline_nivel: baseline?.nivel || null,
          baseline_avaliacao: baseline?.avaliacao || null,
          status: 'pendente',
          historico: [],
          turno: 0,
        });

        if (!error) criados++;
      }
    }

    return { success: true, message: `${criados} sessões de reavaliação criadas` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── 3. Processar Reavaliação Conversacional (1 sessão) ─────────────────────
// Chamada pelo colaborador no dashboard — 8 turnos guiados

const REAV_SYSTEM = `Você é um mentor de desenvolvimento profissional da Vertho.
Está conduzindo uma conversa de reavaliação após 14 semanas de capacitação.

ROTEIRO DE CONVERSA (6 etapas):
1. ACOLHIMENTO: Reconheça a jornada, crie conexão
2. MUDANÇA GERAL: Pergunte o que mudou na prática (aberto)
3. EVIDÊNCIA CONCRETA: Peça um exemplo específico de situação real
4. DESCRITOR ESPECÍFICO: Aborde o gap principal da avaliação inicial
5. DIFICULDADE PERSISTENTE: Pergunte o que ainda é desafiador
6. ENCERRAMENTO: Agradeça e avise sobre o cenário B

REGRAS:
- Tom de mentor: curioso, acolhedor, não julgador
- NUNCA revele o nível ou nota da avaliação inicial
- NUNCA cite descritores por código (D1, D2)
- Busque FATOS, não opiniões ("o que você FEZ" > "o que você ACHA")
- Se resposta teórica, redirecione para prática
- Máximo 8 turnos
- Use [META]{"turno":N,"encerrar":false}[/META] ao final de cada resposta`;

export async function processarReavaliacao(sessaoId, mensagem, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: sessao } = await sb.from('reavaliacao_sessoes')
      .select('*, competencias!inner(nome, descricao), colaboradores!inner(nome_completo, cargo)')
      .eq('id', sessaoId)
      .single();

    if (!sessao) return { success: false, error: 'Sessão não encontrada' };
    if (sessao.status === 'concluida') return { success: false, error: 'Sessão já concluída' };

    const historico = sessao.historico || [];
    historico.push({ role: 'user', content: mensagem });

    const contexto = `
Colaborador: ${sessao.colaboradores.nome_completo} | Cargo: ${sessao.colaboradores.cargo}
Competência: ${sessao.competencias.nome}
Turno atual: ${sessao.turno + 1}/${MAX_TURNOS}
Nível baseline: N${sessao.baseline_nivel || '?'}`;

    const systemPrompt = REAV_SYSTEM + '\n\nCONTEXTO:\n' + contexto;
    const resposta = await callAI(systemPrompt, historico, aiConfig, 1024);

    historico.push({ role: 'assistant', content: resposta });
    const novoTurno = sessao.turno + 1;

    // Verificar se deve encerrar
    const metaMatch = resposta.match(/\[META\](.*?)\[\/META\]/s);
    const meta = metaMatch ? JSON.parse(metaMatch[1]) : {};
    const encerrar = meta.encerrar || novoTurno >= MAX_TURNOS;

    const updateData = {
      historico,
      turno: novoTurno,
      ...(encerrar ? { status: 'concluida' } : {}),
    };

    await sb.from('reavaliacao_sessoes').update(updateData).eq('id', sessaoId);

    // Se encerrou, extrair dados qualitativos
    if (encerrar) {
      await extrairDadosReavaliacao(sessaoId, aiConfig);
    }

    return { success: true, reply: resposta.replace(/\[META\].*?\[\/META\]/s, '').trim(), encerrada: encerrar };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── 4. Extração qualitativa da reavaliação ─────────────────────────────────

async function extrairDadosReavaliacao(sessaoId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  const { data: sessao } = await sb.from('reavaliacao_sessoes')
    .select('*, competencias!inner(nome, gabarito)')
    .eq('id', sessaoId).single();

  if (!sessao) return;

  const system = `Analise a conversa de reavaliação e extraia dados qualitativos.
Responda APENAS com JSON válido.`;

  const user = `Competência: ${sessao.competencias.nome}
Gabarito (descritores): ${JSON.stringify(sessao.competencias.gabarito)}
Nível baseline: N${sessao.baseline_nivel || '?'}

Conversa completa:
${sessao.historico.map(h => `${h.role === 'user' ? 'COLABORADOR' : 'MENTOR'}: ${h.content}`).join('\n\n')}

Extraia:
{
  "resumo_qualitativo": "3-4 linhas resumindo as mudanças relatadas",
  "evidencias_por_descritor": [
    {
      "descritor": "nome do descritor",
      "evidencia_relatada": "evidência concreta mencionada",
      "nivel_percebido": 1-4,
      "confianca": "alta|media|baixa",
      "citacao_literal": "frase exata do colaborador"
    }
  ],
  "gaps_persistentes": ["descritores sem evolução"],
  "consciencia_do_gap": "alta|media|baixa",
  "conexao_cis": "como o perfil comportamental apareceu na conversa",
  "recomendacao_ciclo2": "foco para próximo ciclo"
}`;

  const resultado = await callAI(system, user, aiConfig, 4000);
  const extracao = await extractJSON(resultado);

  if (extracao) {
    await sb.from('reavaliacao_sessoes')
      .update({ extracao_qualitativa: extracao })
      .eq('id', sessaoId);
  }
}

// ── 5. Evolução com Fusão de 3 Fontes ──────────────────────────────────────
// Cenário A (respostas iniciais) + Cenário B (respostas reavaliação) + Conversa Sem15

export async function gerarEvolucaoFusao(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Buscar respostas iniciais (Cenário A)
    const { data: respostasA } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia, r1, r2, r3, r4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    // Buscar sessões de reavaliação concluídas (Conversa Sem15)
    const { data: sessoes } = await sb.from('reavaliacao_sessoes')
      .select('colaborador_id, competencia_id, extracao_qualitativa, historico, baseline_nivel')
      .eq('empresa_id', empresaId)
      .eq('status', 'concluida');

    // Buscar respostas do cenário B (se existirem)
    const { data: respostasB } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia, r1, r2, r3, r4')
      .eq('empresa_id', empresaId)
      .eq('tipo_resposta', 'cenario_b')
      .not('avaliacao_ia', 'is', null);

    // Buscar competências
    const { data: competencias } = await sb.from('competencias')
      .select('id, nome, gabarito').eq('empresa_id', empresaId);
    const compMap = {};
    (competencias || []).forEach(c => { compMap[c.id] = c; });

    // Buscar dados de trilha/capacitação
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('colaborador_id, pct_conclusao, semana_atual').eq('empresa_id', empresaId);
    const progMap = {};
    (progressos || []).forEach(p => { progMap[p.colaborador_id] = p; });

    // Mapear dados por colaborador+competência
    const resAMap = {};
    (respostasA || []).forEach(r => { resAMap[`${r.colaborador_id}::${r.competencia_id}`] = r; });
    const resBMap = {};
    (respostasB || []).forEach(r => { resBMap[`${r.colaborador_id}::${r.competencia_id}`] = r; });
    const sessaoMap = {};
    (sessoes || []).forEach(s => { sessaoMap[`${s.colaborador_id}::${s.competencia_id}`] = s; });

    const system = `Você é um especialista em desenvolvimento humano e avaliação comportamental.
Compare a avaliação inicial com a reavaliação usando 3 fontes de dados.
Classifique a evolução por descritor usando estas categorias:
- EVOLUCAO_CONFIRMADA: delta positivo + evidência no cenário B + relato convergente na conversa
- EVOLUCAO_PARCIAL: delta positivo em apenas 1-2 fontes ou evidência fraca
- SEM_EVOLUCAO: sem delta significativo + sem evidência + sem relato
- EVOLUCAO_INVISIVEL: sem delta numérico mas evidência qualitativa forte

Responda APENAS com JSON válido.`;

    let gerados = 0;
    for (const colab of colaboradores) {
      // Para cada competência que tem dados das 3 fontes (ou ao menos 2)
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
        if (!fonteB && !fonteSem15) continue; // precisa de pelo menos 1 fonte de reavaliação

        const trilha = progMap[colab.id];

        const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${colab.nome_completo} | Cargo: ${colab.cargo}
Perfil DISC: ${colab.perfil_dominante || 'N/D'} (D=${colab.d_natural||0} I=${colab.i_natural||0} S=${colab.s_natural||0} C=${colab.c_natural||0})

Competência: ${comp.nome}
Gabarito (descritores): ${JSON.stringify(comp.gabarito)}

FONTE 1 — Cenário A (avaliação inicial):
Nível: N${fonteA.nivel_ia4}
Avaliação: ${JSON.stringify(fonteA.avaliacao_ia)}

FONTE 2 — Cenário B (reavaliação):
${fonteB ? `Nível: N${fonteB.nivel_ia4}\nAvaliação: ${JSON.stringify(fonteB.avaliacao_ia)}` : 'Não disponível'}

FONTE 3 — Conversa Semana 15 (reavaliação qualitativa):
${fonteSem15?.extracao_qualitativa ? JSON.stringify(fonteSem15.extracao_qualitativa) : 'Não disponível'}

Trilha de capacitação:
${trilha ? `Progresso: ${trilha.pct_conclusao}%, Semana: ${trilha.semana_atual}/14` : 'Dados não disponíveis'}

Gere a fusão de evolução:
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
      "descritor": "nome",
      "nivel_a": N,
      "nivel_b": N,
      "delta": N,
      "evidencia_cenario_b": "evidência observada",
      "evidencia_conversa": "evidência relatada",
      "citacao_colaborador": "frase literal",
      "convergencia": "EVOLUCAO_CONFIRMADA|EVOLUCAO_PARCIAL|SEM_EVOLUCAO|EVOLUCAO_INVISIVEL",
      "conexao_cis": "relação com perfil DISC",
      "confianca": "alta|media|baixa"
    }
  ],
  "consciencia_do_gap": "alta|media|baixa",
  "trilha_efetividade": {
    "correlacao": "descrição da relação entre capacitação e evolução"
  },
  "recomendacao_ciclo2": {
    "descritores_foco": ["descritores para próximo ciclo"],
    "formato_sugerido": "1:1|grupo|autodirigido|misto",
    "justificativa": "..."
  },
  "feedback_colaborador": "8-10 linhas, tom mentor, construtivo"
}`;

        const resultado = await callAI(system, user, aiConfig, 64000);
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

// ── 6. Plenária de Evolução Institucional ──────────────────────────────────
// Relatório agregado anônimo: evolução por cargo, competência, gaps persistentes

export async function gerarPlenariaEvolucao(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('conteudo, colaboradores!inner(nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'evolucao');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório de evolução. Gere a evolução primeiro.' };

    // Agregar dados (ANÔNIMO — sem nomes na plenária)
    const porCargo = {};
    const porComp = {};
    let totalDelta = 0, totalDescritoresUp = 0, totalDescritores = 0;
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
      totalDescritoresUp += re.descritores_que_subiram || 0;
      totalDescritores += re.descritores_total || 0;

      porCargo[cargo].deltas.push(delta);
      porCargo[cargo].descUp += re.descritores_que_subiram || 0;
      porCargo[cargo].descTotal += re.descritores_total || 0;
      porCargo[cargo].count++;

      porComp[compNome].deltas.push(delta);
      porComp[compNome].descUp += re.descritores_que_subiram || 0;
      porComp[compNome].descTotal += re.descritores_total || 0;
      porComp[compNome].count++;

      // Convergências
      (c.evolucao_por_descritor || []).forEach(d => {
        if (convergencias[d.convergencia] !== undefined) convergencias[d.convergencia]++;
        if (d.convergencia === 'SEM_EVOLUCAO') {
          gapsPersistentes[d.descritor] = (gapsPersistentes[d.descritor] || 0) + 1;
        }
      });
    }

    const avg = arr => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : '0';

    const system = `Você é um facilitador de plenárias de desenvolvimento organizacional.
Gere um relatório AGREGADO e ANÔNIMO de evolução institucional.
NÃO cite nomes de colaboradores.
Foque em padrões, tendências e recomendações institucionais.
Responda APENAS com JSON válido.`;

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Total de colaboradores analisados: ${relatorios.length}

DADOS AGREGADOS:
Delta médio geral: ${avg(relatorios.map(r => r.conteudo?.resumo_executivo?.delta || 0))}
Descritores que subiram: ${totalDescritoresUp} de ${totalDescritores} (${totalDescritores ? Math.round(totalDescritoresUp/totalDescritores*100) : 0}%)

Convergências:
- EVOLUÇÃO CONFIRMADA: ${convergencias.EVOLUCAO_CONFIRMADA}
- EVOLUÇÃO PARCIAL: ${convergencias.EVOLUCAO_PARCIAL}
- SEM EVOLUÇÃO: ${convergencias.SEM_EVOLUCAO}
- EVOLUÇÃO INVISÍVEL: ${convergencias.EVOLUCAO_INVISIVEL}

Por cargo:
${Object.entries(porCargo).map(([cargo, d]) => `  ${cargo}: delta médio ${avg(d.deltas)}, ${d.descUp}/${d.descTotal} descritores, ${d.count} colaboradores`).join('\n')}

Por competência:
${Object.entries(porComp).map(([comp, d]) => `  ${comp}: delta médio ${avg(d.deltas)}, ${d.descUp}/${d.descTotal} descritores`).join('\n')}

Gaps persistentes (descritores sem evolução, freq):
${Object.entries(gapsPersistentes).sort((a,b) => b[1]-a[1]).slice(0,10).map(([d, n]) => `  ${d}: ${n} ocorrências`).join('\n')}

Gere:
{
  "titulo": "Plenária de Evolução — ${empresa.nome}",
  "resumo_evolucao": "análise geral da evolução",
  "percentual_medio_evolucao": N,
  "analise_por_cargo": [{"cargo": "...", "delta_medio": N, "destaque": "...", "gap_principal": "..."}],
  "analise_por_competencia": [{"competencia": "...", "delta_medio": N, "evolucao": "...", "gap_persistente": "..."}],
  "convergencia_institucional": {
    "confirmada_pct": N,
    "parcial_pct": N,
    "sem_evolucao_pct": N,
    "invisivel_pct": N,
    "interpretacao": "..."
  },
  "gaps_persistentes_institucionais": ["top 5 descritores com mais SEM_EVOLUCAO"],
  "recomendacoes_ciclo2": ["5-7 recomendações concretas"],
  "formato_plenaria_sugerido": "como apresentar esses dados na plenária"
}`;

    const resultado = await callAI(system, user, aiConfig, 64000);
    const plenaria = await extractJSON(resultado);

    if (plenaria) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId,
        colaborador_id: null,
        tipo: 'plenaria_evolucao',
        conteudo: plenaria,
        gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Plenária de evolução institucional gerada' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── 7. Funções auxiliares re-exportadas (mantidas para compatibilidade) ────

export async function gerarRelatoriosEvolucaoLote(empresaId, aiConfig = {}) {
  return gerarEvolucaoFusao(empresaId, aiConfig);
}

export async function gerarRelatorioRHManual(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: relEvolucao } = await sb.from('relatorios')
      .select('*, colaboradores(nome_completo, cargo)')
      .eq('empresa_id', empresaId).eq('tipo', 'evolucao');

    const { data: relRHAnterior } = await sb.from('relatorios')
      .select('conteudo')
      .eq('empresa_id', empresaId).eq('tipo', 'rh').single();

    const system = `Você é um consultor estratégico de RH.
Gere um relatório analítico de RH pós-desenvolvimento, comparando com o diagnóstico inicial.
Responda APENAS com JSON válido.`;

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Relatório RH anterior: ${JSON.stringify(relRHAnterior?.conteudo || {}, null, 2)}
Evolução da equipe: ${JSON.stringify((relEvolucao || []).map(r => ({ nome: r.colaboradores?.nome_completo, ...r.conteudo })), null, 2)}

Gere relatório RH pós-desenvolvimento:
{
  "resumo_executivo": "...",
  "roi_desenvolvimento": "...",
  "evolucao_organizacional": "...",
  "gaps_resolvidos": ["..."],
  "gaps_persistentes": ["..."],
  "recomendacoes_estrategicas": ["..."],
  "proximos_ciclos": ["..."]
}`;

    const resultado = await callAI(system, user, aiConfig, 8000);
    const relatorio = await extractJSON(resultado);

    if (relatorio) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId, colaborador_id: null, tipo: 'rh_manual',
        conteudo: relatorio, gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Relatório RH manual gerado' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarRelatorioPlenaria(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: plenaria } = await sb.from('relatorios')
      .select('conteudo').eq('empresa_id', empresaId).eq('tipo', 'plenaria_evolucao').single();
    if (!plenaria) return { success: false, error: 'Plenária de evolução não encontrada.' };

    const { data: empresa } = await sb.from('empresas').select('nome').eq('id', empresaId).single();

    const system = `Transforme os dados da plenária em relatório formal. Responda APENAS com JSON válido.`;
    const user = `Empresa: ${empresa.nome}\nDados: ${JSON.stringify(plenaria.conteudo, null, 2)}

Gere: { "titulo": "...", "data": "${new Date().toISOString().split('T')[0]}", "pauta": ["..."], "resultados": "...", "deliberacoes": ["..."], "encaminhamentos": [{"acao": "...", "responsavel": "...", "prazo": "..."}] }`;

    const resultado = await callAI(system, user, aiConfig, 4096);
    const relatorio = await extractJSON(resultado);

    if (relatorio) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId, colaborador_id: null, tipo: 'plenaria_relatorio',
        conteudo: relatorio, gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
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
      const link = `https://${empresa.slug}.vertho.com.br/dashboard/evolucao`;
      try {
        await resend.emails.send({
          from: `Vertho Mentor <noreply@${empresa.slug}.vertho.com.br>`,
          to: colab.email,
          subject: `[${empresa.nome}] Seu Perfil de Evolução`,
          html: `<p>Olá ${colab.nome_completo}!</p><p>Seu perfil com relatórios e trilha de desenvolvimento está disponível.</p><p><a href="${link}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Acessar Perfil</a></p>`,
        });
        enviados++;
      } catch { /* silenciar erros individuais */ }
    }

    return { success: true, message: `${enviados} links de perfil enviados` };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarDossieGestor(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: todosRelatorios } = await sb.from('relatorios').select('tipo, conteudo, colaboradores(nome_completo, cargo)').eq('empresa_id', empresaId);

    const system = `Compile todos os dados em um dossiê executivo. Responda APENAS com JSON válido.`;
    const porTipo = {};
    for (const r of todosRelatorios || []) {
      if (!porTipo[r.tipo]) porTipo[r.tipo] = [];
      porTipo[r.tipo].push({ colaborador: r.colaboradores?.nome_completo, resumo: r.conteudo?.resumo_executivo || r.conteudo?.evolucao_geral });
    }

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})\nRelatórios: ${JSON.stringify(porTipo, null, 2)}

Gere: { "titulo": "Dossiê Gestão — ${empresa.nome}", "sumario_executivo": "...", "diagnostico_inicial": "...", "evolucao": "...", "roi": "...", "recomendacoes": ["..."], "conclusao": "..." }`;

    const resultado = await callAI(system, user, aiConfig, 8000);
    const dossie = await extractJSON(resultado);

    if (dossie) {
      await sb.from('relatorios').upsert({
        empresa_id: empresaId, colaborador_id: null, tipo: 'dossie_gestor',
        conteudo: dossie, gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id,tipo' });
    }

    return { success: true, message: 'Dossiê do gestor gerado' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function checkCenarios(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cenarios } = await sb.from('banco_cenarios')
      .select('id, titulo, descricao, alternativas, competencias!inner(nome)')
      .eq('empresa_id', empresaId);
    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário encontrado' };

    const system = `Verifique a qualidade dos cenários. Responda APENAS com JSON válido.`;
    const user = `Verifique ${cenarios.length} cenários: ${JSON.stringify(cenarios.slice(0, 20), null, 2)}

Retorne: { "total": ${Math.min(cenarios.length, 20)}, "aprovados": N, "com_ressalvas": N, "reprovados": N, "detalhes": [{"cenario_id": "...", "status": "...", "observacao": "..."}] }`;

    const resultado = await callAI(system, user, aiConfig, 64000);
    const verificacao = await extractJSON(resultado);

    return { success: true, message: `Verificação: ${verificacao?.aprovados || 0} aprovados, ${verificacao?.com_ressalvas || 0} com ressalvas`, verificacao };
  } catch (err) { return { success: false, error: err.message }; }
}
