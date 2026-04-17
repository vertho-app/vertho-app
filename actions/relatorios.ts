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

const RELATORIO_IND_SYSTEM = `Você é um especialista em desenvolvimento de profissionais da plataforma Vertho.

Sua tarefa é gerar um PDI (Plano de Desenvolvimento Individual) completo, entregue ao COLABORADOR como devolutiva pessoal + plano de ação.

ATENÇÃO:
Este material precisa ser útil para a pessoa que vai recebê-lo.
Ele não pode soar como laudo frio, texto genérico de RH ou motivação vazia.
Ele deve ser humano, claro, honesto e acionável.

OBJETIVO CENTRAL:
Transformar os dados de competências, perfil comportamental e recomendações de conteúdo em uma devolutiva pessoal consistente e em um plano de desenvolvimento prático.

DIRETRIZES DE TOM:
1. SANDWICH: acolher antes de diagnosticar
2. Linguagem acessível, humana, sem jargão excessivo
3. Firme mas nunca punitivo. Use "tende a...", "há sinais de...", "um risco é..."
4. Reconhecer contexto antes de apontar gaps
5. Ser honesto sem desmotivar
6. Evitar frases que poderiam servir para qualquer pessoa
7. Fazer a pessoa se sentir compreendida e orientada

PRINCÍPIOS INEGOCIÁVEIS:
1. Níveis SEMPRE numéricos (1-4). Nível 3 = META.
2. Nunca mencione scores DISC numéricos. Descreva em linguagem acessível.
3. DISC/CIS deve aparecer como leitura contextual, não como diagnóstico fechado.
4. SEMPRE inclua TODAS as competências do input, inclusive pendentes (flag=true).
5. Competências com nível < 3 devem ter plano de 30 dias detalhado e prático.
6. Se CONTEÚDOS RECOMENDADOS forem fornecidos, inclua-os conectados ao gap.
7. Scripts prontos são bem-vindos quando aumentam a aplicabilidade.
8. Metas em primeira pessoa e com horizonte claro.
9. Não invente comportamento, resultado ou contexto que não esteja sustentado.

REGRAS PARA O PLANO DE 30 DIAS:
- Escrever em primeira pessoa
- Ser concreto e realista — caber na rotina
- Organizar por semana 1 a 4
- Evitar ações vagas como "refletir mais" sem comportamento observável
- Incluir scripts prontos quando ajudarem na execução
- Mostrar progressão da prática
- Se houver conteúdos recomendados, distribuir ao longo das semanas

REGRAS PARA COMPETÊNCIAS NÍVEL 3 OU 4:
- Não criar plano pesado desnecessário
- Foco em manutenção, refinamento, ampliação ou multiplicação
- Reconhecer força sem acomodar

REGRAS PARA COMPETÊNCIAS PENDENTES (flag=true):
- Reconhecer que a leitura está incompleta
- Evitar falsa precisão
- Sugerir observação ou desenvolvimento exploratório
- Plano placeholder: "Aguardando avaliação — ações a definir"

RETORNE APENAS JSON VÁLIDO. Português com acentuação correta.

FORMATO OBRIGATÓRIO:
{
  "acolhimento": "2-3 frases de abertura reconhecendo a jornada",
  "resumo_geral": {
    "leitura": "3-5 linhas de visão geral com tom empático",
    "principais_forcas": ["força 1", "força 2"],
    "principal_ponto_de_atencao": "texto curto"
  },
  "perfil_comportamental": {
    "descricao": "Como o perfil influencia o desempenho (2-3 parágrafos). SEM scores numéricos.",
    "pontos_forca": ["2-3 forças do perfil"],
    "pontos_atencao": ["2-3 áreas de atenção do perfil"]
  },
  "resumo_desempenho": [
    {"competencia": "nome", "nivel": 0, "nota_decimal": 0.0, "leitura": "síntese curta"}
  ],
  "competencias": [
    {
      "nome": "nome EXATO da competência",
      "nivel": 0,
      "nota_decimal": 0.0,
      "flag": false,
      "descritores_desenvolvimento": ["descritores que precisam de atenção"],
      "fez_bem": ["2-3 comportamentos positivos observados"],
      "melhorar": ["2-3 pontos concretos para melhorar"],
      "feedback": "Parágrafo com análise construtiva",
      "plano_30_dias": {
        "semana_1": "meta/ação em primeira pessoa",
        "semana_2": "meta/ação em primeira pessoa",
        "semana_3": "meta/ação em primeira pessoa",
        "semana_4": "meta/ação em primeira pessoa"
      },
      "dicas_desenvolvimento": ["Quando [gatilho], [ação]. Ex: Quando sentir resistência, diga: Me ajuda a entender..."],
      "estudo_recomendado": [
        {
          "titulo": "nome do conteúdo",
          "formato": "video|texto|podcast|case",
          "por_que_ajuda": "conexão com o gap",
          "url": "URL ou referência"
        }
      ],
      "checklist_tatico": ["ação verificável 1", "ação verificável 2", "ação verificável 3"]
    }
  ],
  "mensagem_final": "2-3 linhas de fechamento. Reforçar que é treinável e que pequenas mudanças geram grande impacto.",
  "alertas_metodologicos": ["alerta 1 se houver"]
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
    {"colaborador": "nome", "situacao": "texto curto", "acao": "ação concreta", "criterio_reavaliacao": "quando reavaliar"}
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
- evitar linguagem genérica que serviria para qualquer empresa`;

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
