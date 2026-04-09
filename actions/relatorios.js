'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';

// PDF generators (lazy import to avoid client-side issues)
async function gerarPDFBuffer(tipo, data, empresaNome) {
  let Component;
  if (tipo === 'individual') {
    const mod = await import('@/components/pdf/RelatorioIndividual');
    Component = mod.default;
  } else if (tipo === 'gestor') {
    const mod = await import('@/components/pdf/RelatorioGestor');
    Component = mod.default;
  } else if (tipo === 'rh') {
    const mod = await import('@/components/pdf/RelatorioRH');
    Component = mod.default;
  }
  if (!Component) return null;
  return renderToBuffer(React.createElement(Component, { data, empresaNome }));
}

async function salvarPDFStorage(sb, empresaId, tipo, colaboradorNome, buffer) {
  const slug = (colaboradorNome || tipo).replace(/\s+/g, '-').toLowerCase();
  const path = `${empresaId}/${tipo}-${slug}-${Date.now()}.pdf`;
  const { error } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) { console.error('[PDF Storage]', error.message); return null; }
  return path;
}

// ══════════════════════════════════════════════════════════════════════════════
// PDI INDIVIDUAL (Plano de Desenvolvimento Individual — fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════

const RELATORIO_IND_SYSTEM = `Voce e um especialista em desenvolvimento de profissionais da plataforma Vertho.
Gere um PDI (Plano de Desenvolvimento Individual) completo.
O PDI sera entregue ao COLABORADOR como devolutiva pessoal + plano de acao.

DIRETRIZES DE TOM:
1. SANDWICH: Acolher antes de diagnosticar. Valide o que funciona ANTES de apontar gaps.
2. LINGUAGEM ACESSIVEL: Tom profissional mas humano. Sem jargao excessivo.
3. TOM COACH: Firme mas nunca punitivo. Use "tende a...", "ha sinais de...", "um risco e...".
4. RECONHECER CONTEXTO: Antes de apontar gaps, reconheca POR QUE age assim.
5. SCRIPTS PRONTOS: Cada recomendacao deve ter pelo menos 1 frase/acao concreta aplicavel imediatamente.
6. METAS EM PRIMEIRA PESSOA com horizonte claro.
7. NAO mencione scores DISC numericos. Descreva em linguagem acessivel.
8. Niveis SEMPRE NUMERICOS: 1, 2, 3 ou 4. Nivel 3 = META.
9. Use APENAS competencias que foram avaliadas. NAO invente outras.
10. Para cada competencia com gap (nivel < 3), gere plano de 30 dias detalhado.
11. Se CURSOS RECOMENDADOS forem fornecidos, INCLUA-OS no plano de 30 dias e no estudo recomendado.
    Use o nome e URL exatos dos cursos. Distribua ao longo das 4 semanas conforme o nivel.

FORMATO: APENAS JSON valido. Portugues com acentuacao correta.
{
  "acolhimento": "2-3 frases de abertura reconhecendo esforco e explicando o objetivo do PDI",
  "resumo_geral": "3-5 linhas de visao geral: forcas + diagnostico com tom empatico",
  "perfil_comportamental": {
    "descricao": "Como o perfil influencia o desempenho (2-3 paragrafos). SEM scores numericos.",
    "pontos_forca": ["2-3 forcas do perfil"],
    "pontos_atencao": ["2-3 areas de atencao do perfil"]
  },
  "resumo_desempenho": [
    {"competencia": "nome", "nivel": 0, "nota_decimal": 0.0, "flag": false}
  ],
  "competencias": [
    {
      "nome": "nome EXATO da competencia",
      "nivel": 0,
      "nota_decimal": 0.0,
      "flag": false,
      "descritores_desenvolvimento": ["descritores com nivel < 3 que precisam de atencao"],
      "fez_bem": ["2-3 comportamentos positivos observados"],
      "melhorar": ["2-3 pontos concretos para melhorar"],
      "feedback": "Paragrafo com analise construtiva (tom coach)",
      "plano_30_dias": {
        "semana_1": {"foco": "tema da semana", "acoes": ["acao concreta 1", "acao concreta 2"]},
        "semana_2": {"foco": "tema", "acoes": ["acao 1", "acao 2"]},
        "semana_3": {"foco": "tema", "acoes": ["acao 1", "acao 2"]},
        "semana_4": {"foco": "tema", "acoes": ["acao 1", "acao 2"]}
      },
      "dicas_desenvolvimento": ["Quando [gatilho], [acao]. Ex: Quando sentir resistencia, diga: Me ajuda a entender..."],
      "estudo_recomendado": ["recurso 1 com descricao curta", "recurso 2"],
      "checklist_tatico": ["acao verificavel 1", "acao verificavel 2", "acao verificavel 3"]
    }
  ],
  "mensagem_final": "2-3 linhas motivacionais. Reforcar que e treinavel e que pequenas mudancas geram grande impacto."
}`;

export async function gerarRelatorioIndividual(empresaId, colaboradorId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, email, d_natural, i_natural, s_natural, c_natural, perfil_dominante, lid_executivo, lid_motivador, lid_metodico, lid_sistematico')
      .eq('id', colaboradorId).single();
    if (!colab) return { success: false, error: 'Colaborador não encontrado' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    // Buscar respostas avaliadas
    const { data: respostas } = await sb.from('respostas')
      .select('competencia_id, avaliacao_ia, nivel_ia4, nota_ia4, pontos_fortes, pontos_atencao, feedback_ia4')
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colaboradorId)
      .not('avaliacao_ia', 'is', null);

    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação encontrada para este colaborador' };

    // Buscar competências
    const compIds = [...new Set(respostas.map(r => r.competencia_id).filter(Boolean))];
    const compMap = {};
    if (compIds.length) {
      const { data: comps } = await sb.from('competencias').select('id, nome, cod_comp').in('id', compIds);
      (comps || []).forEach(c => { compMap[c.id] = c; });
    }

    // Perfil CIS
    let perfilCIS = 'Perfil comportamental nao disponivel.';
    if (colab.d_natural != null) {
      perfilCIS = `DISC: D=${colab.d_natural} | I=${colab.i_natural} | S=${colab.s_natural} | C=${colab.c_natural}\nDominante: ${colab.perfil_dominante || '—'}\nLideranca: Executor=${colab.lid_executivo || 0}% | Motivador=${colab.lid_motivador || 0}% | Metodico=${colab.lid_metodico || 0}% | Sistematico=${colab.lid_sistematico || 0}%`;
    }

    const dadosComps = respostas.map(r => {
      const comp = compMap[r.competencia_id] || {};
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return {
        competencia: comp.nome || '—',
        nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || '?',
        nota_decimal: av?.consolidacao?.media_descritores || r.nota_ia4 || '?',
        pontos_fortes: av?.descritores_destaque?.pontos_fortes || [],
        gaps: av?.descritores_destaque?.gaps_prioritarios || [],
        feedback: av?.feedback || r.feedback_ia4 || '',
      };
    });

    // Buscar trilha montada (cursos recomendados do Moodle)
    let trilhaTexto = '';
    try {
      const { data: trilha } = await sb.from('trilhas')
        .select('cursos')
        .eq('empresa_id', empresaId)
        .eq('colaborador_id', colaboradorId)
        .maybeSingle();
      if (trilha?.cursos?.length) {
        trilhaTexto = `\n\nCURSOS RECOMENDADOS (Moodle — usar no plano de 30 dias e estudo recomendado):\n${trilha.cursos.map(c => `- ${c.nome} (${c.competencia || ''}, N${c.nivel || '?'}) — ${c.url || ''}`).join('\n')}`;
      }
    } catch {}

    const user = `COLABORADOR: ${colab.nome_completo}\nCARGO: ${colab.cargo}\nEMPRESA: ${empresa.nome} (${empresa.segmento})\n\nPERFIL COMPORTAMENTAL:\n${perfilCIS}\n\nDADOS POR COMPETENCIA:\n${JSON.stringify(dadosComps, null, 2)}${trilhaTexto}`;

    const resultado = await callAI(RELATORIO_IND_SYSTEM, user, aiConfig, 64000);
    const relatorio = await extractJSON(resultado);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    // Gerar PDF
    let pdfPath = null;
    try {
      const pdfData = { conteudo: relatorio, colaborador_nome: colab.nome_completo, colaborador_cargo: colab.cargo, gerado_em: new Date().toISOString() };
      const buffer = await gerarPDFBuffer('individual', pdfData, empresa.nome);
      if (buffer) pdfPath = await salvarPDFStorage(sb, empresaId, 'individual', colab.nome_completo, buffer);
    } catch (e) { console.error('[PDF Gen]', e.message); }

    // Salvar
    const { error: saveErr } = await sb.from('relatorios').upsert({
      empresa_id: empresaId,
      colaborador_id: colaboradorId,
      tipo: 'individual',
      conteudo: relatorio,
      pdf_path: pdfPath,
      gerado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

    if (saveErr) return { success: false, error: saveErr.message };
    return { success: true, message: `Relatório gerado: ${colab.nome_completo}${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO GESTOR (fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════

const RELATORIO_GESTOR_SYSTEM = `Voce e um especialista em desenvolvimento de equipes da plataforma Vertho.
Gere um RELATORIO DO GESTOR consolidado.
Tom: profissional, estrategico, acionavel.

REGRAS:
- Niveis NUMERICOS (1 a 4). Nunca "Gap", "Em Desenvolvimento".
- DISC como hipotese, nao determinismo. Use "pode indicar", "tende a favorecer".
- Maximo 3 acoes por horizonte (curto/medio/longo). Gestor vive no caos.
- Conecte TODA recomendacao ao impacto nos resultados.
- NUNCA sugira quadros publicos de acompanhamento individual.
- Celebre evolucao com forca.

FORMATO: APENAS JSON valido. Portugues com acentuacao correta.
{
  "resumo_executivo": "3-5 linhas",
  "destaques_evolucao": ["Frases celebrando evolucao"],
  "ranking_atencao": [
    {"nome": "", "competencia": "", "nivel": 0, "urgencia": "URGENTE|IMPORTANTE|ACOMPANHAR", "motivo": "1 frase"}
  ],
  "analise_por_competencia": [
    {"competencia": "", "media_nivel": 0, "distribuicao": {"n1": 0, "n2": 0, "n3": 0, "n4": 0}, "padrao_observado": "2-3 linhas", "acao_gestor": "1-2 acoes praticas"}
  ],
  "perfil_disc_equipe": {
    "descricao": "2-3 linhas como hipotese",
    "forca_coletiva": "",
    "risco_coletivo": ""
  },
  "acoes": {
    "esta_semana": {"titulo": "", "descricao": "", "impacto": ""},
    "proximas_semanas": {"titulo": "", "descricao": "", "impacto": ""},
    "medio_prazo": {"titulo": "", "descricao": "", "impacto": ""}
  },
  "mensagem_final": "2-3 linhas"
}`;

export async function gerarRelatorioGestor(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    // Buscar todos os colaboradores com avaliação
    const { data: respostas } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, avaliacao_ia, nivel_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação encontrada' };

    // Buscar colaboradores
    const colabIds = [...new Set(respostas.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Buscar competências
    const compIds = [...new Set(respostas.map(r => r.competencia_id).filter(Boolean))];
    const compMap = {};
    if (compIds.length) {
      const { data: comps } = await sb.from('competencias').select('id, nome').in('id', compIds);
      (comps || []).forEach(c => { compMap[c.id] = c; });
    }

    // Montar dados da equipe
    const membros = colabIds.map(id => {
      const c = colabMap[id] || {};
      const respsColab = respostas.filter(r => r.colaborador_id === id);
      return {
        nome: c.nome_completo || '—',
        cargo: c.cargo || '—',
        disc_dominante: c.perfil_dominante || '—',
        competencias: respsColab.map(r => {
          const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
          return {
            competencia: compMap[r.competencia_id]?.nome || '—',
            nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0,
          };
        }),
      };
    });

    // DISC distribuição
    const discDist = { D: 0, I: 0, S: 0, C: 0 };
    (colabs || []).forEach(c => { if (c.perfil_dominante) { const d = c.perfil_dominante.replace('Alto ', ''); if (discDist[d] !== undefined) discDist[d]++; } });

    const user = `EMPRESA: ${empresa.nome} (${empresa.segmento})\nTOTAL EQUIPE: ${membros.length}\nDISC: D=${discDist.D} I=${discDist.I} S=${discDist.S} C=${discDist.C}\n\nDADOS DA EQUIPE:\n${JSON.stringify(membros, null, 2)}`;

    const resultado = await callAI(RELATORIO_GESTOR_SYSTEM, user, aiConfig, 64000);
    const relatorio = await extractJSON(resultado);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    let pdfPath = null;
    try {
      const pdfData = { conteudo: relatorio, gerado_em: new Date().toISOString() };
      const buffer = await gerarPDFBuffer('gestor', pdfData, empresa.nome);
      if (buffer) pdfPath = await salvarPDFStorage(sb, empresaId, 'gestor', empresa.nome, buffer);
    } catch (e) { console.error('[PDF Gen Gestor]', e.message); }

    await sb.from('relatorios').upsert({
      empresa_id: empresaId, colaborador_id: null, tipo: 'gestor',
      conteudo: relatorio, pdf_path: pdfPath, gerado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

    return { success: true, message: `Relatório gestor gerado${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO RH (fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════

const RELATORIO_RH_SYSTEM = `Voce e um especialista em desenvolvimento organizacional da plataforma Vertho.
Gere um RELATORIO CONSOLIDADO DE RH.
Tom: analitico, estrategico, orientado a decisoes de investimento em pessoas.

REGRAS:
- Niveis NUMERICOS (1 a 4).
- DISC como hipotese, nao determinismo.
- Conecte TUDO ao impacto nos resultados.
- Sugira treinamentos ESPECIFICOS com carga horaria e custo relativo.
- Maximo 3 acoes por horizonte.
- Para CADA treinamento: prioridade se orcamento for curto.
- Se identificar risco: acao concreta (entrevista retencao, plano B).
- Decisoes-chave num quadro separado.

FORMATO: APENAS JSON valido. Portugues com acentuacao correta.
{
  "resumo_executivo": "4-6 linhas",
  "indicadores": {
    "total_avaliados": 0,
    "total_avaliacoes": 0,
    "media_geral": 0,
    "pct_nivel_1": 0, "pct_nivel_2": 0, "pct_nivel_3": 0, "pct_nivel_4": 0
  },
  "visao_por_cargo": [
    {"cargo": "", "analise": "2-3 linhas", "media": 0, "ponto_forte": "", "ponto_critico": ""}
  ],
  "competencias_criticas": [
    {"competencia": "", "criticidade": "CRITICA|ATENCAO|ESTAVEL", "motivo": "2-3 linhas", "impacto": "1 linha"}
  ],
  "treinamentos_sugeridos": [
    {"titulo": "", "competencias_alvo": [""], "publico": "", "formato": "", "carga_horaria": "", "custo": "baixo|medio|alto", "prioridade": "URGENTE|IMPORTANTE|DESEJAVEL", "justificativa": ""}
  ],
  "perfil_disc_organizacional": {
    "descricao": "2-3 linhas hipotese",
    "implicacao": ""
  },
  "decisoes_chave": [
    {"colaborador": "", "situacao": "", "acao": "", "criterio_reavaliacao": "", "consequencia": ""}
  ],
  "plano_acao": {
    "curto_prazo": {"titulo": "", "descricao": "", "impacto": ""},
    "medio_prazo": {"titulo": "", "descricao": "", "impacto": ""},
    "longo_prazo": {"titulo": "", "descricao": "", "impacto": ""}
  },
  "mensagem_final": "2-3 linhas"
}`;

export async function gerarRelatorioRH(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: respostas } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, avaliacao_ia, nivel_ia4, nota_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação encontrada' };

    // Colaboradores
    const colabIds = [...new Set(respostas.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante')
      .in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Competências
    const compIds = [...new Set(respostas.map(r => r.competencia_id).filter(Boolean))];
    const compMap = {};
    if (compIds.length) {
      const { data: comps } = await sb.from('competencias').select('id, nome').in('id', compIds);
      (comps || []).forEach(c => { compMap[c.id] = c; });
    }

    // Indicadores
    const niveis = respostas.map(r => {
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0;
    }).filter(n => n > 0);

    const media = niveis.length ? Math.round((niveis.reduce((a, b) => a + b, 0) / niveis.length) * 100) / 100 : 0;
    const dist = { n1: 0, n2: 0, n3: 0, n4: 0 };
    niveis.forEach(n => { if (dist[`n${n}`] !== undefined) dist[`n${n}`]++; });

    // Dados por cargo
    const porCargo = {};
    respostas.forEach(r => {
      const c = colabMap[r.colaborador_id];
      if (!c) return;
      const cargo = c.cargo || '—';
      if (!porCargo[cargo]) porCargo[cargo] = [];
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      porCargo[cargo].push({ nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0 });
    });

    const cargosData = Object.entries(porCargo).map(([cargo, items]) => {
      const ns = items.map(i => i.nivel).filter(n => n > 0);
      return { cargo, total: items.length, media: ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 100) / 100 : 0 };
    });

    // Todos os registros
    const registros = respostas.map(r => {
      const c = colabMap[r.colaborador_id] || {};
      const comp = compMap[r.competencia_id] || {};
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return {
        nome: c.nome_completo || '—', cargo: c.cargo || '—',
        competencia: comp.nome || '—', nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0,
      };
    });

    // DISC organizacional
    const discOrg = { D: 0, I: 0, S: 0, C: 0 };
    (colabs || []).forEach(c => { if (c.perfil_dominante) { const d = c.perfil_dominante.replace('Alto ', ''); if (discOrg[d] !== undefined) discOrg[d]++; } });

    const user = `EMPRESA: ${empresa.nome} (${empresa.segmento})
TOTAL AVALIADOS: ${colabIds.length}
TOTAL AVALIACOES: ${respostas.length}
MEDIA GERAL: ${media}
DISTRIBUICAO: N1=${dist.n1} N2=${dist.n2} N3=${dist.n3} N4=${dist.n4}
DISC ORGANIZACIONAL: D=${discOrg.D} I=${discOrg.I} S=${discOrg.S} C=${discOrg.C}

POR CARGO:
${JSON.stringify(cargosData, null, 2)}

REGISTROS INDIVIDUAIS:
${JSON.stringify(registros, null, 2)}`;

    const resultado = await callAI(RELATORIO_RH_SYSTEM, user, aiConfig, 64000);
    const relatorio = await extractJSON(resultado);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    let pdfPath = null;
    try {
      const pdfData = { conteudo: relatorio, gerado_em: new Date().toISOString() };
      const buffer = await gerarPDFBuffer('rh', pdfData, empresa.nome);
      if (buffer) pdfPath = await salvarPDFStorage(sb, empresaId, 'rh', empresa.nome, buffer);
    } catch (e) { console.error('[PDF Gen RH]', e.message); }

    await sb.from('relatorios').upsert({
      empresa_id: empresaId, colaborador_id: null, tipo: 'rh',
      conteudo: relatorio, pdf_path: pdfPath, gerado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

    return { success: true, message: `Relatório RH gerado${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS INDIVIDUAIS EM LOTE
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarRelatoriosIndividuaisLote(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar colaboradores com avaliações
    const { data: respostas } = await sb.from('respostas')
      .select('colaborador_id')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    const colabIds = [...new Set((respostas || []).map(r => r.colaborador_id).filter(Boolean))];
    if (!colabIds.length) return { success: false, error: 'Nenhuma avaliação encontrada' };

    // Verificar quais já têm relatório
    const { data: existentes } = await sb.from('relatorios')
      .select('colaborador_id')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual');
    const jaGerados = new Set((existentes || []).map(r => r.colaborador_id));

    const pendentes = colabIds.filter(id => !jaGerados.has(id));
    if (!pendentes.length) return { success: true, message: 'Todos os relatórios já foram gerados' };

    return {
      success: true,
      data: pendentes,
      message: `${pendentes.length} relatórios pendentes de ${colabIds.length} colaboradores`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
