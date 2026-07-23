'use server';

import { tenantDb } from '@/lib/tenant-db';
import { mapComLimite } from '@/lib/concurrency';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { focoDoCargo } from '@/lib/foco-cargo';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';
import { buildRelatorioIndividualPrompt, normKey } from '@/lib/relatorio-individual-prompt';
import { retrieveContext, formatGroundingBlock } from '@/lib/rag';
import { renderToBuffer } from '@react-pdf/renderer';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { storageSlug } from '@/lib/storage-slug';
import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// ──────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ──────────────────────────────────────────────────────────────────────────────

export interface ServerResult<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
  detalhes?: GestorDetalhe[];
}

interface GestorDetalhe {
  gestor: string;
  equipe?: number;
  ok?: boolean;
  erro?: string;
}

type RelatorioTipo = 'individual' | 'gestor' | 'rh';

// Shape interno de dadosComps (overlay do output da IA usa esses campos)
// DadoComp/NivelFromAssess moveram p/ lib/relatorio-individual-prompt (núcleo headless).

// ──────────────────────────────────────────────────────────────────────────────
// PDF helpers
// ──────────────────────────────────────────────────────────────────────────────

async function gerarPDFBuffer(
  tipo: RelatorioTipo,
  data: unknown,
  empresaNome: string,
): Promise<Buffer | null> {
  let Component: React.ComponentType<any> | undefined;
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
  const logoBase64 = getLogoCoverBase64();
  return renderToBuffer(React.createElement(Component, { data, empresaNome, logoBase64 }));
}

async function salvarPDFStorage(
  sb: SupabaseClient,
  empresaId: string,
  tipo: RelatorioTipo,
  colaboradorNome: string,
  buffer: Buffer,
): Promise<string | null> {
  const slug = storageSlug(colaboradorNome, tipo);
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

// RELATORIO_IND_SYSTEM + montagem do prompt moveram p/ lib/relatorio-individual-prompt.

export async function gerarRelatorioIndividual(
  empresaId: string,
  colaboradorId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  // Sem escape hatch: `empresaId` vem do caller, então um bypass de gate aqui
  // leria/escreveria QUALQUER tenant. O gate roda sempre.
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Montagem do prompt EXTRAÍDA p/ lib/relatorio-individual-prompt (núcleo
    // headless, fonte única com scripts/lotes). Comportamento idêntico.
    const built = await buildRelatorioIndividualPrompt(sbRaw, { empresaId, colaboradorId });
    if ('error' in built) return { success: false, error: built.error };
    const { system, user, dadosComps, blueprint, colab, empresa } = built;

    const resultado = await callAI(system, user, aiConfig, 64000);
    const relatorio: any = await extractJSON(resultado);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    // Pós-processo: força nivel/nota_decimal dos dados reais (LLM as vezes ignora).
    const dadosByName = Object.fromEntries(dadosComps.map(d => [normKey(d.competencia), d]));
    const overlay = (c: any, key: string = 'nome'): any => {
      const src = dadosByName[normKey(c[key] || c.competencia || c.nome)];
      if (!src) return c;
      return {
        ...c,
        nivel: src.nivel === 'pendente' ? null : src.nivel,
        nota_decimal: src.nota_decimal === 'pendente' ? null : src.nota_decimal,
        flag: src.nivel === 'pendente' || (typeof src.nivel === 'number' && src.nivel < 3),
      };
    };
    if (Array.isArray(relatorio.competencias)) relatorio.competencias = relatorio.competencias.map((c: any) => overlay(c, 'nome'));
    if (Array.isArray(relatorio.resumo_desempenho)) relatorio.resumo_desempenho = relatorio.resumo_desempenho.map((c: any) => overlay(c, 'competencia'));

    // Binding real "vira trilha" (Estágio 2): LIDO DO BLUEPRINT, não da IA. Persiste
    // no `conteudo` pra a página "Como este PDI vira trilha" mostrar o vínculo real
    // (cada semana → ação do PDI). Sem blueprint, ambos ficam ausentes (fallback).
    if (blueprint) {
      // trilha_mapa: as semanas com competencia_foco + conexao_com_pdi (ids dos objetivos).
      relatorio.trilha_mapa = blueprint.trilha;
      // blueprint_objetivos: mapa { [objetivoId]: { competencia, objetivo, acao_principal } }
      // pra a página resolver conexao_com_pdi → ação do PDI que a semana sustenta.
      const blueprintObjetivos: Record<string, { competencia: string; objetivo: string; acao_principal: string }> = {};
      for (const comp of (blueprint.competencias || [])) {
        for (const obj of (comp.objetivos_30_dias || [])) {
          if (!obj?.id) continue;
          blueprintObjetivos[obj.id] = {
            competencia: comp.nome,
            objetivo: obj.objetivo,
            acao_principal: obj.acao_principal,
          };
        }
      }
      relatorio.blueprint_objetivos = blueprintObjetivos;
      // blueprint_conteudos: mapa { [competenciaNome]: [{ tema, formato }] } — a TEORIA
      // (o que a pessoa vai APRENDER por competência). A página "vira trilha" mostra
      // aprende+aplica, não só a prática. Temas do blueprint (sempre presentes); o
      // micro-conteúdo REAL só existe quando a trilha é gerada (refinamento futuro).
      const blueprintConteudos: Record<string, { tema: string; formato?: string }[]> = {};
      for (const comp of (blueprint.competencias || [])) {
        const temas = (comp.conteudos_recomendados || [])
          .map((cr: any) => ({ tema: cr?.tema, formato: cr?.formato_preferencial }))
          .filter((t: any) => t.tema);
        if (temas.length) blueprintConteudos[comp.nome] = temas;
      }
      relatorio.blueprint_conteudos = blueprintConteudos;
    }

    // Gerar PDF
    let pdfPath: string | null = null;
    try {
      const pdfData = { conteudo: relatorio, colaborador_nome: colab.nome_completo, colaborador_cargo: colab.cargo, gerado_em: new Date().toISOString() };
      const buffer = await gerarPDFBuffer('individual', pdfData, empresa.nome);
      if (buffer) pdfPath = await salvarPDFStorage(sbRaw, empresaId, 'individual', colab.nome_completo, buffer);
    } catch (e: any) { console.error('[PDF Gen]', e.message); }

    // Salvar — empresa_id é injetado pelo tdb.upsert
    const { error: saveErr } = await tdb.from('relatorios').upsert({
      colaborador_id: colaboradorId,
      tipo: 'individual',
      conteudo: relatorio,
      pdf_path: pdfPath,
      gerado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

    if (saveErr) return { success: false, error: saveErr.message };
    return { success: true, message: `Relatório gerado: ${colab.nome_completo}${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO GESTOR (fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════

const RELATORIO_GESTOR_SYSTEM = `Você é um especialista em desenvolvimento de equipes da plataforma Vertho.

Sua tarefa é gerar um RELATÓRIO DO GESTOR consolidado, com base nos dados de evolução da equipe.

ATENÇÃO:
Este relatório precisa ser útil para um gestor real.
Ele deve ser estratégico, acionável, direto, conectado ao impacto no resultado e prudente na interpretação.

OBJETIVO CENTRAL:
Traduzir os dados da equipe em uma leitura clara de:
- onde o time avançou
- onde ainda há pontos de atenção
- quais pessoas e competências pedem ação prioritária
- o que o gestor deve fazer agora, depois e no médio prazo
- quais riscos existem se nada mudar

PRINCÍPIOS INEGOCIÁVEIS:
1. Níveis NUMÉRICOS (1-4). Nunca rótulos vagos.
2. DISC é hipótese contextual ("pode indicar", "tende a favorecer"), nunca diagnóstico fechado.
3. Conecte tudo ao impacto nos resultados e na gestão do time.
4. O gestor vive no caos: máximo 3 ações por horizonte.
5. Nunca sugira quadros públicos de acompanhamento individual.
6. Celebre evolução com força antes de apontar atenção.
7. Não invente comportamento, risco ou intenção não sustentados pelos dados.
8. Ações precisam ser realistas para rotina de gestor.
9. Não use linguagem genérica que serviria para qualquer equipe.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.

FORMATO OBRIGATÓRIO:
{
  "resumo_executivo": {
    "leitura_geral": "síntese curta, executiva e fiel",
    "principal_avanco": "texto curto",
    "principal_ponto_de_atencao": "texto curto"
  },
  "destaques_evolucao": [
    {"nome": "nome", "competencia": "comp", "nivel": 3, "motivo_destaque": "texto curto"}
  ],
  "ranking_atencao": [
    {"nome": "nome", "competencia": "comp", "nivel": 1, "urgencia": "alta|media|baixa", "motivo": "texto curto", "risco_se_nao_agir": "texto curto"}
  ],
  "analise_por_competencia": [
    {
      "competencia": "nome",
      "media_nivel": 2.3,
      "distribuicao": {"n1": 0, "n2": 3, "n3": 2, "n4": 0},
      "padrao_observado": "2-3 linhas",
      "acao_gestor": "ação prática recomendada",
      "impacto_se_nao_agir": "risco concreto para o time"
    }
  ],
  "perfil_disc_equipe": {
    "descricao": "leitura coletiva prudente",
    "forca_coletiva": "texto curto",
    "risco_coletivo": "texto curto"
  },
  "acoes": {
    "esta_semana": ["ação 1", "ação 2", "ação 3"],
    "proximas_semanas": ["ação 1", "ação 2", "ação 3"],
    "medio_prazo": ["ação 1", "ação 2", "ação 3"]
  },
  "mensagem_final": "mensagem curta ao gestor",
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- máximo 3 ações por horizonte
- urgência coerente com os dados (alta/media/baixa)
- DISC sempre como hipótese
- ações realistas pra rotina de gestor
- não usar linguagem genérica que serviria para qualquer equipe
- ranking_atencao com risco_se_nao_agir — concreto, não alarmista
- analise_por_competencia com impacto_se_nao_agir — conectado à gestão`;

export async function gerarRelatorioGestor(
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Busca TODOS os colabs e agrupa por gestor_email (exclui internos @vertho.ai)
    const { data: todosColabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, email, cargo, gestor_email, gestor_nome, perfil_dominante, d_natural, i_natural, s_natural, c_natural, role')
      .not('email', 'ilike', '%@vertho.ai');

    const equipesPorGestor: Record<string, any[]> = {};
    for (const c of (todosColabs || [])) {
      const ge = (c.gestor_email || '').toLowerCase().trim();
      if (!ge) continue; // colab sem gestor cadastrado é ignorado
      if (!equipesPorGestor[ge]) equipesPorGestor[ge] = [];
      equipesPorGestor[ge].push(c);
    }

    if (Object.keys(equipesPorGestor).length === 0) {
      return { success: false, error: 'Nenhum colaborador tem gestor_email preenchido. Configure em /admin/empresas/gerenciar.' };
    }

    // RAG/grounding: traz valores + cultura da empresa pra contextualizar recomendações
    let groundingBlock = '';
    try {
      const chunks = await retrieveContext(empresaId, 'valores cultura organizacional políticas desenvolvimento pessoas', 4);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err: any) { console.warn('[gestor grounding]', err?.message); }

    // Avaliações IA4 (uma vez só, indexa por colab)
    const { data: respostas } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, competencia_nome, avaliacao_ia, nivel_ia4')
      .not('avaliacao_ia', 'is', null);
    const respPorColab: Record<string, any[]> = {};
    for (const r of (respostas || [])) {
      if (!respPorColab[r.colaborador_id]) respPorColab[r.colaborador_id] = [];
      respPorColab[r.colaborador_id].push(r);
    }

    // Relatórios por gestor em paralelo (limite 2 — callAI de 64k tokens);
    // detalhes preservam a ORDEM dos gestores (mapComLimite garante).
    const resultadosGestor = await mapComLimite(Object.entries(equipesPorGestor), 2, async ([gestorEmail, equipe]): Promise<GestorDetalhe> => {
      try {
        // Identifica o gestor (pode estar em colaboradores ou só ser um email externo)
        const gestorColab = (todosColabs || []).find((c: any) => (c.email || '').toLowerCase() === gestorEmail);
        const gestorNome = gestorColab?.nome_completo || equipe[0].gestor_nome || gestorEmail;

        // Membros: cada colab da equipe + suas competências avaliadas
        const membros = equipe.map((c: any) => {
          const respsColab = respPorColab[c.id] || [];
          return {
            nome: c.nome_completo || '—',
            cargo: c.cargo || '—',
            disc_dominante: c.perfil_dominante || '—',
            competencias: respsColab.map((r: any) => {
              const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
              return {
                competencia: r.competencia_nome || '—',
                nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0,
              };
            }),
          };
        });

        // DISC dist da equipe
        const discDist: Record<'D' | 'I' | 'S' | 'C', number> = { D: 0, I: 0, S: 0, C: 0 };
        equipe.forEach((c: any) => {
          if (c.perfil_dominante) {
            const d = c.perfil_dominante.replace('Alto ', '') as 'D' | 'I' | 'S' | 'C';
            if (discDist[d] !== undefined) discDist[d]++;
          }
        });

        const user = `EMPRESA: ${empresa.nome} (${empresa.segmento})\nGESTOR: ${gestorNome} (${gestorEmail})\nTOTAL EQUIPE: ${membros.length}\nDISC: D=${discDist.D} I=${discDist.I} S=${discDist.S} C=${discDist.C}\n${groundingBlock ? `\n${groundingBlock}\n` : ''}\nDADOS DA EQUIPE:\n${JSON.stringify(membros, null, 2)}`;

        const resultado = await callAI(RELATORIO_GESTOR_SYSTEM, user, aiConfig, 64000);
        const relatorio: any = await extractJSON(resultado);

        if (!relatorio) { return { gestor: gestorNome, erro: 'IA não retornou JSON' }; }

        // PDF
        let pdfPath: string | null = null;
        try {
          const pdfData = { conteudo: relatorio, gestor_nome: gestorNome, gerado_em: new Date().toISOString() };
          const buffer = await gerarPDFBuffer('gestor', pdfData, empresa.nome);
          if (buffer) pdfPath = await salvarPDFStorage(sbRaw, empresaId, 'gestor', `${empresa.nome}-${gestorNome}`, buffer);
        } catch (e: any) { console.error('[PDF Gestor]', e.message); }

        // empresa_id é injetado pelo tdb.upsert
        await tdb.from('relatorios').upsert({
          colaborador_id: gestorColab?.id || null,
          tipo: 'gestor',
          conteudo: { ...relatorio, gestor_email: gestorEmail, gestor_nome: gestorNome },
          pdf_path: pdfPath,
          gerado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

        return { gestor: gestorNome, equipe: equipe.length, ok: true };
      } catch (e: any) {
        return { gestor: gestorEmail, erro: e.message };
      }
    });
    const detalhes: GestorDetalhe[] = resultadosGestor;
    const gerados = detalhes.filter(d => (d as any).ok).length;
    const erros = detalhes.filter(d => (d as any).erro).length;

    return {
      success: true,
      message: `${gerados} relatório${gerados !== 1 ? 's' : ''} de gestor gerado${gerados !== 1 ? 's' : ''}${erros ? ` · ${erros} erros` : ''}`,
      detalhes,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO RH (fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════

const RELATORIO_RH_SYSTEM = `Você é um especialista em desenvolvimento organizacional da plataforma Vertho.

Sua tarefa é gerar um RELATÓRIO CONSOLIDADO DE RH, com base nos dados agregados da organização.

ATENÇÃO:
Este relatório precisa ser útil para RH e liderança.
Ele deve ser analítico, estratégico, orientado a decisão e conectado ao impacto organizacional.

OBJETIVO CENTRAL:
Traduzir os dados de evolução e desempenho da organização em um relatório que mostre:
- onde estão os principais sinais de maturidade
- onde estão os principais riscos
- quais cargos e competências merecem foco
- que investimentos em desenvolvimento parecem mais justificados
- como priorizar o próximo ciclo

PRINCÍPIOS INEGOCIÁVEIS:
1. Níveis são NUMÉRICOS (1-4).
2. DISC é hipótese contextual, não diagnóstico fechado.
3. Conecte tudo ao impacto organizacional real.
4. Treinamentos precisam ser específicos e priorizados.
5. Cada risco identificado deve vir com ação concreta.
6. Para cada cargo, deve haver UMA competência foco mais alavancadora.
7. Não invente causalidade que os dados não sustentam.
8. Seja estratégico, mas pé no chão.
9. Máximo 3 ações por horizonte.

RETORNE APENAS JSON VÁLIDO. Português com acentuação correta.

FORMATO OBRIGATÓRIO:
{
  "resumo_executivo": {
    "leitura_geral": "síntese executiva curta",
    "principal_forca_organizacional": "texto curto",
    "principal_risco_organizacional": "texto curto"
  },
  "indicadores": {
    "total_avaliados": 0,
    "total_avaliacoes": 0,
    "media_geral": 0.0,
    "pct_nivel_1": 0, "pct_nivel_2": 0, "pct_nivel_3": 0, "pct_nivel_4": 0
  },
  "visao_por_cargo": [
    {
      "cargo": "nome",
      "media_nivel": 0.0,
      "principais_forcas": ["força 1"],
      "principais_riscos": ["risco 1"],
      "leitura": "síntese curta e útil"
    }
  ],
  "competencias_criticas": [
    {
      "competencia": "nome",
      "criticidade": "alta|media|baixa",
      "justificativa": "texto curto",
      "impacto_organizacional": "texto curto"
    }
  ],
  "competencia_foco_por_cargo": [
    {
      "cargo": "nome do cargo",
      "competencia_recomendada": "nome da competência",
      "justificativa": "justificativa quanti + quali",
      "expectativa_impacto": "texto curto",
      "horizonte_sugerido": "curto|medio|longo"
    }
  ],
  "treinamentos_sugeridos": [
    {
      "titulo": "nome do treinamento",
      "competencia": "competência relacionada",
      "publico": "público-alvo",
      "custo": "baixo|medio|alto",
      "prioridade": "alta|media|baixa",
      "carga_horaria": "texto curto",
      "formato": "presencial|online|misto|mentoria|pratica",
      "justificativa": "por que este treinamento ajuda",
      "entra_se_orcamento_curto": true
    }
  ],
  "perfil_disc_organizacional": {
    "descricao": "leitura prudente do perfil coletivo",
    "forca_coletiva": "texto curto",
    "risco_coletivo": "texto curto"
  },
  "decisoes_chave": [
    {"colaborador": "nome", "situacao": "por que se destacou (positivo)", "acao": "como potencializar/alavancar essa pessoa", "criterio_reavaliacao": "quando reavaliar"}
  ],
  "plano_acao": {
    "curto_prazo": ["ação 1", "ação 2", "ação 3"],
    "medio_prazo": ["ação 1", "ação 2", "ação 3"],
    "longo_prazo": ["ação 1", "ação 2", "ação 3"]
  },
  "mensagem_final": "fechamento executivo e realista",
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- máximo 3 ações por horizonte
- níveis sempre numéricos
- DISC sempre como hipótese
- cada treinamento com prioridade e justificativa
- cada risco relevante com ação concreta
- para cada cargo, exatamente 1 competência foco
- decisoes_chave ("Talentos a Potencializar"): liste APENAS pessoas que se DESTACARAM POSITIVAMENTE (referências internas, alto desempenho, potencial claro) e a ação para potencializá-las. NÃO inclua fragilidade/risco individual — isso é do relatório do gestor. Se ninguém se destacar claramente, retorne [].
- cada competência em competencias_criticas deve ter um item correspondente em treinamentos_sugeridos com o MESMO nome de competência (eles são exibidos juntos na seção "Onde Investir": gap → formação que resolve).
- plano_acao é uma LINHA DO TEMPO (curto/médio/longo) que REFERENCIA as formações/iniciativas pelo nome e adiciona ações que NÃO são treinamento (rituais, comunicação, follow-up, decisões). NÃO re-descreva os treinamentos já detalhados em "Onde Investir".
- evitar linguagem genérica que serviria para qualquer empresa`;

export async function gerarRelatorioRH(
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    const { data: respostasRaw } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, avaliacao_ia, nivel_ia4, nota_ia4')
      .not('avaliacao_ia', 'is', null);
    // exclui respostas de colaboradores internos @vertho.ai das estatísticas RH
    const { data: internosRH } = await tdb.from('colaboradores').select('id').ilike('email', '%@vertho.ai');
    const internosRHSet = new Set((internosRH || []).map((c: any) => c.id));
    const respostas = (respostasRaw || []).filter((r: any) => !internosRHSet.has(r.colaborador_id));

    if (!respostas.length) return { success: false, error: 'Nenhuma avaliação encontrada' };

    // Colaboradores
    const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante')
      .in('id', colabIds)
      .not('email', 'ilike', '%@vertho.ai'); // exclui internos da agregação RH
    const colabMap: Record<string, any> = {};
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });

    // Competências
    const compIds = [...new Set(respostas.map((r: any) => r.competencia_id).filter(Boolean))];
    const compMap: Record<string, any> = {};
    if (compIds.length) {
      const { data: comps } = await tdb.from('competencias').select('id, nome').in('id', compIds);
      (comps || []).forEach((c: any) => { compMap[c.id] = c; });
    }

    // Indicadores
    const niveis: number[] = respostas.map((r: any) => {
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0;
    }).filter((n: number) => n > 0);

    const media = niveis.length ? Math.round((niveis.reduce((a, b) => a + b, 0) / niveis.length) * 100) / 100 : 0;
    const dist: Record<string, number> = { n1: 0, n2: 0, n3: 0, n4: 0 };
    niveis.forEach(n => { if (dist[`n${n}`] !== undefined) dist[`n${n}`]++; });

    // Dados por cargo
    const porCargo: Record<string, { nivel: number }[]> = {};
    respostas.forEach((r: any) => {
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
    const registros = respostas.map((r: any) => {
      const c = colabMap[r.colaborador_id] || {};
      const comp = compMap[r.competencia_id] || {};
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return {
        nome: c.nome_completo || '—', cargo: c.cargo || '—',
        competencia: comp.nome || '—', nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0,
      };
    });

    // DISC organizacional
    const discOrg: Record<'D' | 'I' | 'S' | 'C', number> = { D: 0, I: 0, S: 0, C: 0 };
    (colabs || []).forEach((c: any) => { if (c.perfil_dominante) { const d = c.perfil_dominante.replace('Alto ', '') as 'D' | 'I' | 'S' | 'C'; if (discOrg[d] !== undefined) discOrg[d]++; } });

    // RAG/grounding: contexto institucional pra decisões de RH terem identidade
    let groundingBlock = '';
    try {
      const chunks = await retrieveContext(empresaId, 'valores cultura organizacional políticas treinamento desenvolvimento estrategia', 5);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err: any) { console.warn('[rh grounding]', err?.message); }

    const user = `EMPRESA: ${empresa.nome} (${empresa.segmento})
TOTAL AVALIADOS: ${colabIds.length}
TOTAL AVALIACOES: ${respostas.length}
MEDIA GERAL: ${media}
DISTRIBUICAO: N1=${dist.n1} N2=${dist.n2} N3=${dist.n3} N4=${dist.n4}
DISC ORGANIZACIONAL: D=${discOrg.D} I=${discOrg.I} S=${discOrg.S} C=${discOrg.C}
${groundingBlock ? `\n${groundingBlock}\n` : ''}
POR CARGO:
${JSON.stringify(cargosData, null, 2)}

REGISTROS INDIVIDUAIS:
${JSON.stringify(registros, null, 2)}`;

    const resultado = await callAI(RELATORIO_RH_SYSTEM, user, aiConfig, 64000);
    const relatorio: any = await extractJSON(resultado);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    let pdfPath: string | null = null;
    try {
      const pdfData = { conteudo: relatorio, gerado_em: new Date().toISOString() };
      const buffer = await gerarPDFBuffer('rh', pdfData, empresa.nome);
      if (buffer) pdfPath = await salvarPDFStorage(sbRaw, empresaId, 'rh', empresa.nome, buffer);
    } catch (e: any) { console.error('[PDF Gen RH]', e.message); }

    // Relatório RH é agregado (colaborador_id = NULL).
    // PostgreSQL UNIQUE não detecta conflito em NULL — select+update/insert explícito.
    const { data: existingRh } = await tdb.from('relatorios')
      .select('id').eq('tipo', 'rh').is('colaborador_id', null).maybeSingle();
    if (existingRh) {
      await tdb.from('relatorios').update({ conteudo: relatorio, pdf_path: pdfPath, gerado_em: new Date().toISOString() }).eq('id', existingRh.id);
    } else {
      await tdb.from('relatorios').insert({ colaborador_id: null, tipo: 'rh', conteudo: relatorio, pdf_path: pdfPath, gerado_em: new Date().toISOString() });
    }

    return { success: true, message: `Relatório RH gerado${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS INDIVIDUAIS EM LOTE
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarRelatoriosIndividuaisLote(
  empresaId: string,
  _aiConfig: AIConfig = {},
): Promise<ServerResult<string[]>> {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Buscar colaboradores com avaliações
    const { data: respostas } = await tdb.from('respostas')
      .select('colaborador_id')
      .not('avaliacao_ia', 'is', null);

    const colabIds = [...new Set((respostas || []).map((r: any) => r.colaborador_id).filter(Boolean))] as string[];
    if (!colabIds.length) return { success: false, error: 'Nenhuma avaliação encontrada' };

    // Verificar quais já têm relatório
    const { data: existentes } = await tdb.from('relatorios')
      .select('colaborador_id')
      .eq('tipo', 'individual');
    const jaGerados = new Set((existentes || []).map((r: any) => r.colaborador_id));

    // PDI COMPLETO: a fila só inclui quem concluiu TODAS as competências do top5
    // do cargo com avaliação da IA (antes bastava 1 resposta avaliada → PDI
    // parcial). Cargo sem top5 configurado não tem como medir "completo" →
    // mantém a regra antiga. Mesmo critério do gate em gerarRelatorioIndividual.
    const avaliadasPorColab = new Map<string, number>();
    for (const r of respostas || []) {
      if (!r.colaborador_id) continue;
      avaliadasPorColab.set(r.colaborador_id, (avaliadasPorColab.get(r.colaborador_id) || 0) + 1);
    }
    const { data: colabs } = await tdb.from('colaboradores').select('id, cargo').in('id', colabIds);
    const { data: cargosEmp } = await tdb.from('cargos_empresa').select('nome, top5_workshop');
    const top5PorCargo = new Map<string, number>((cargosEmp || []).map((c: any) => [c.nome, (c.top5_workshop || []).length]));
    const completos = new Set(
      (colabs || [])
        .filter((c: any) => {
          const esperado = top5PorCargo.get(c.cargo) || 0;
          return esperado === 0 || (avaliadasPorColab.get(c.id) || 0) >= esperado;
        })
        .map((c: any) => c.id),
    );

    const pendentes = colabIds.filter(id => !jaGerados.has(id) && completos.has(id));
    const incompletos = colabIds.filter(id => !jaGerados.has(id) && !completos.has(id)).length;
    if (!pendentes.length) {
      return {
        success: true,
        message: incompletos
          ? `Nenhum relatório pendente com avaliação completa (${incompletos} com avaliação incompleta)`
          : 'Todos os relatórios já foram gerados',
      };
    }

    return {
      success: true,
      data: pendentes,
      message: `${pendentes.length} relatórios pendentes${incompletos ? ` · ${incompletos} com avaliação incompleta ignorados` : ''}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
