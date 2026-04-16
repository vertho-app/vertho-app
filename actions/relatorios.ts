'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';
import { retrieveContext, formatGroundingBlock } from '@/lib/rag';
import { renderToBuffer } from '@react-pdf/renderer';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
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
interface DadoComp {
  competencia: string;
  nivel: number | 'pendente';
  nota_decimal: number | 'pendente';
  pontos_fortes: string[];
  gaps: string[];
  feedback: string;
}

interface NivelFromAssess {
  nivel: number;
  nota_decimal: number;
}

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
9. SEMPRE inclua TODAS as competencias fornecidas no input (mesmo as marcadas como 'pendente').
   - Para competencias avaliadas (nivel 1-4): gere analise completa.
   - Para competencias com nivel='pendente': inclua entrada com flag=true, resumo curto explicando que aguarda avaliacao, plano_30_dias com semanas placeholder ("Aguardando avaliacao - acoes a definir"). NAO invente notas.
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

export async function gerarRelatorioIndividual(
  empresaId: string,
  colaboradorId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: colab } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, email, d_natural, i_natural, s_natural, c_natural, perfil_dominante, lid_executivo, lid_motivador, lid_metodico, lid_sistematico')
      .eq('id', colaboradorId).single();
    if (!colab) return { success: false, error: 'Colaborador não encontrado' };

    // empresas: id é o tenant — sem empresa_id; usar raw
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Buscar TODAS respostas do colab (avaliadas ou não). Aceita match
    // por colaborador_id OU por email_colaborador (alguns rows antigos
    // têm colaborador_id NULL).
    const emailFilter = (colab.email || '').trim().toLowerCase();
    const { data: respostas } = await tdb.from('respostas')
      .select('competencia_id, competencia_nome, avaliacao_ia, nivel_ia4, nota_ia4, pontos_fortes, pontos_atencao, feedback_ia4, colaborador_id, email_colaborador')
      .or(`colaborador_id.eq.${colaboradorId}${emailFilter ? `,email_colaborador.eq.${emailFilter}` : ''}`);

    // Top 5 esperado do cargo (fonte de verdade)
    const { data: cargoEmp } = await tdb.from('cargos_empresa')
      .select('top5_workshop').eq('nome', colab.cargo).maybeSingle();
    const top5Esperado: string[] = cargoEmp?.top5_workshop || [];

    if (!respostas?.length && !top5Esperado.length) {
      return { success: false, error: 'Nenhuma resposta nem top5 configurado para este colaborador' };
    }

    // Mapeia respostas por nome de competência (mais estável que id quando há
    // múltiplos rows por descritor). Normaliza chave (trim+lower) para
    // tolerar divergência de capitalização/espaços entre top5_workshop e
    // competencia_nome em respostas.
    const normKey = (s: unknown): string => (s || '').toString().trim().toLowerCase();
    const respPorNome: Record<string, any> = {};
    const respPorCompId: Record<string, any> = {};
    for (const r of (respostas || [])) {
      if (r.competencia_nome) respPorNome[normKey(r.competencia_nome)] = r;
      if (r.competencia_id) respPorCompId[r.competencia_id] = r;
    }
    // Fallback: resolve nome→id via competencias table pra cobrir respostas
    // que tenham só competencia_id (sem competencia_nome desnormalizado).
    // OR com empresa_id.is.null cobre catálogo nacional → mantém raw.
    const { data: compsByName } = await sbRaw.from('competencias')
      .select('id, nome, empresa_id')
      .or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
    const nomeToId: Record<string, string> = {};
    for (const c of (compsByName || [])) {
      nomeToId[normKey(c.nome)] = c.id;
    }

    // Lista alvo: top5 do cargo se existe, senão usa as competências respondidas
    const competenciasAlvo: string[] = top5Esperado.length > 0
      ? top5Esperado
      : [...new Set((respostas || []).map(r => r.competencia_nome).filter(Boolean))] as string[];

    // Mapa competencia → meta (id, cod_comp)
    const compIds = [...new Set((respostas || []).map(r => r.competencia_id).filter(Boolean))];
    const compMap: Record<string, any> = {};
    if (compIds.length) {
      const { data: comps } = await tdb.from('competencias').select('id, nome, cod_comp').in('id', compIds);
      (comps || []).forEach((c: any) => { compMap[c.nome] = c; });
    }

    // Perfil CIS
    let perfilCIS = 'Perfil comportamental nao disponivel.';
    if (colab.d_natural != null) {
      perfilCIS = `DISC: D=${colab.d_natural} | I=${colab.i_natural} | S=${colab.s_natural} | C=${colab.c_natural}\nDominante: ${colab.perfil_dominante || '—'}\nLideranca: Executor=${colab.lid_executivo || 0}% | Motivador=${colab.lid_motivador || 0}% | Metodico=${colab.lid_metodico || 0}% | Sistematico=${colab.lid_sistematico || 0}%`;
    }

    // Fallback adicional: descriptor_assessments populado pela IA4
    // (auto-hook). Quando respostas não trazem nivel/nota, calcula media.
    const { data: descAssess } = await tdb.from('descriptor_assessments')
      .select('competencia, descritor, nota')
      .eq('colaborador_id', colaboradorId);
    const assessByComp: Record<string, number[]> = {};
    for (const a of (descAssess || [])) {
      const k = normKey(a.competencia);
      if (!assessByComp[k]) assessByComp[k] = [];
      assessByComp[k].push(Number(a.nota));
    }
    const nivelFromAssess = (nomeComp: string): NivelFromAssess | null => {
      const arr = assessByComp[normKey(nomeComp)];
      if (!arr || arr.length === 0) return null;
      const media = arr.reduce((s, v) => s + v, 0) / arr.length;
      return { nivel: Math.max(1, Math.min(4, Math.round(media))), nota_decimal: Number(media.toFixed(2)) };
    };

    // Fuzzy fallback: includes-match para nomes próximos.
    const fuzzyFindResp = (nomeComp: string): any => {
      const k = normKey(nomeComp);
      const all = Object.keys(respPorNome);
      const hit = all.find(rn => rn.includes(k) || k.includes(rn));
      return hit ? respPorNome[hit] : null;
    };

    const dadosComps: DadoComp[] = competenciasAlvo.map((nomeComp): DadoComp => {
      const k = normKey(nomeComp);
      const r = respPorNome[k] || respPorCompId[nomeToId[k]] || fuzzyFindResp(nomeComp);
      const fromAssess = nivelFromAssess(nomeComp);
      if (!r && !fromAssess) {
        // Top5 mas o colab não respondeu (ou IA4 falhou totalmente)
        return {
          competencia: nomeComp,
          nivel: 'pendente',
          nota_decimal: 'pendente',
          pontos_fortes: [],
          gaps: [],
          feedback: 'Sem dados — colaborador não respondeu ou avaliação IA4 não foi processada.',
        };
      }
      const av = r ? (typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia) : null;
      const nivelEff = av?.consolidacao?.nivel_geral || r?.nivel_ia4 || fromAssess?.nivel || 'pendente';
      const notaEff = av?.consolidacao?.media_descritores || r?.nota_ia4 || fromAssess?.nota_decimal || 'pendente';
      return {
        competencia: nomeComp,
        nivel: nivelEff,
        nota_decimal: notaEff,
        pontos_fortes: av?.descritores_destaque?.pontos_fortes || [],
        gaps: av?.descritores_destaque?.gaps_prioritarios || [],
        feedback: av?.feedback || r?.feedback_ia4 || (r?.avaliacao_ia ? '' : 'Resposta sem avaliação IA4 (rode IA4 novamente).'),
      };
    });

    // Buscar trilha montada (conteúdos recomendados do catálogo Vertho)
    let trilhaTexto = '';
    try {
      const { data: trilha } = await tdb.from('trilhas')
        .select('cursos')
        .eq('colaborador_id', colaboradorId)
        .maybeSingle();
      if (trilha?.cursos?.length) {
        trilhaTexto = `\n\nCONTEÚDOS RECOMENDADOS (catálogo Vertho — usar no plano de 30 dias e estudo recomendado):\n${trilha.cursos.map((c: any) => `- ${c.nome} (${c.competencia || ''}, ${c.formato || 'texto'}, N${c.nivel || '?'}) — ${c.url || ''}`).join('\n')}`;
      }
    } catch {}

    const totalComps = dadosComps.length;
    const pendentes = dadosComps.filter(c => c.nivel === 'pendente').length;
    const user = `COLABORADOR: ${colab.nome_completo}\nCARGO: ${colab.cargo}\nEMPRESA: ${empresa.nome} (${empresa.segmento})\n\nPERFIL COMPORTAMENTAL:\n${perfilCIS}\n\n=== ATENCAO ===\nO array DADOS POR COMPETENCIA contem ${totalComps} competencia(s) do TOP 5 do cargo. ${pendentes > 0 ? `${pendentes} esta(o) marcadas como 'pendente' (sem avaliacao IA4) — voce DEVE incluir essas tambem no output, com flag=true e plano placeholder.` : ''} O array 'competencias' do output DEVE ter EXATAMENTE ${totalComps} itens, na MESMA ordem.\n\nDADOS POR COMPETENCIA:\n${JSON.stringify(dadosComps, null, 2)}${trilhaTexto}`;

    const resultado = await callAI(RELATORIO_IND_SYSTEM, user, aiConfig, 64000);
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

export async function gerarRelatorioGestor(
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Busca TODOS os colabs e agrupa por gestor_email
    const { data: todosColabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, email, cargo, gestor_email, gestor_nome, perfil_dominante, d_natural, i_natural, s_natural, c_natural, role');

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

    let gerados = 0, erros = 0;
    const detalhes: GestorDetalhe[] = [];

    for (const [gestorEmail, equipe] of Object.entries(equipesPorGestor)) {
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

        if (!relatorio) { erros++; detalhes.push({ gestor: gestorNome, erro: 'IA não retornou JSON' }); continue; }

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

        gerados++;
        detalhes.push({ gestor: gestorNome, equipe: equipe.length, ok: true });
      } catch (e: any) {
        erros++;
        detalhes.push({ gestor: gestorEmail, erro: e.message });
      }
    }

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
- Para CADA cargo distinto, sugerir UMA competencia foco priorizada (a mais alavancadora) com justificativa quantitativa+qualitativa.

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
  "competencia_foco_por_cargo": [
    {
      "cargo": "",
      "competencia_recomendada": "",
      "justificativa": "3-4 linhas: por que essa competência é a mais alavancadora para esse cargo agora — combine gap médio observado, criticidade da competência pro cargo, alinhamento com desafios estratégicos da empresa",
      "expectativa_impacto": "1-2 linhas: o que muda na prática se o cargo evoluir nessa competência",
      "horizonte_sugerido": "30d|60d|90d"
    }
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

export async function gerarRelatorioRH(
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    const { data: respostas } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, avaliacao_ia, nivel_ia4, nota_ia4')
      .not('avaliacao_ia', 'is', null);

    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação encontrada' };

    // Colaboradores
    const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante')
      .in('id', colabIds);
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

    // empresa_id é injetado pelo tdb.upsert
    await tdb.from('relatorios').upsert({
      colaborador_id: null, tipo: 'rh',
      conteudo: relatorio, pdf_path: pdfPath, gerado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

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

    const pendentes = colabIds.filter(id => !jaGerados.has(id));
    if (!pendentes.length) return { success: true, message: 'Todos os relatórios já foram gerados' };

    return {
      success: true,
      data: pendentes,
      message: `${pendentes.length} relatórios pendentes de ${colabIds.length} colaboradores`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
