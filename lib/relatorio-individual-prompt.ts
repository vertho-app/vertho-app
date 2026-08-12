/**
 * Núcleo HEADLESS do prompt do PDI individual — fonte única entre a action
 * gateada (actions/relatorios.ts::gerarRelatorioIndividual) e scripts/lotes
 * (ex.: comparação de modelos). Padrão lib/blueprint/core.ts: sem gate aqui;
 * o caller autoriza. Monta EXATAMENTE o mesmo par system/user que a action
 * sempre montou — extração mecânica, sem mudança de comportamento.
 */
import { tenantDb } from '@/lib/tenant-db';
import { focoDoCargo } from '@/lib/foco-cargo';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { nivelDaNota } from '@/lib/nivel-regua';

export interface DadoComp {
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

// Normalização de chave de competência (trim+lower) — compartilhada com o
// pós-processo da action (overlay de nível/nota).
export const normKey = (s: unknown): string => (s || '').toString().trim().toLowerCase();

export const RELATORIO_IND_SYSTEM = `Você é um especialista em desenvolvimento de profissionais da plataforma Vertho.

Sua tarefa é gerar um PDI (Plano de Desenvolvimento Individual) completo, entregue ao COLABORADOR como devolutiva pessoal + plano de ação.

ATENÇÃO:
Este material precisa ser útil para a pessoa que vai recebê-lo.
Ele não pode soar como laudo frio, texto genérico de RH ou motivação vazia.
Ele deve ser humano, claro, honesto e acionável.

OBJETIVO CENTRAL:
Transformar os dados de competências, perfil comportamental e recomendações de conteúdo em uma devolutiva pessoal consistente e em um plano de desenvolvimento prático.

DIRETRIZES DE TOM:
1. Respeitoso, direto, humano e OPERACIONAL — o foco é o PRÓXIMO MOVIMENTO, não motivação.
2. Acolher = contextualizar antes de diagnosticar, de forma PROFISSIONAL (não afetiva nem paternalista).
3. Linguagem acessível, sem jargão excessivo.
4. Firme mas nunca punitivo. Use "tende a...", "há sinais de...", "um risco é...".
5. Menos "você é capaz", mais "este é o próximo movimento". NÃO repetir frases do tipo "você chegou até aqui porque se importa".
6. Ser honesto sem desmotivar; reconhecer contexto antes de apontar gaps.
7. Evitar frases genéricas que serviriam para qualquer pessoa.
8. Português claro, SEM termos em inglês (use 'devolutiva' não 'feedback', 'estudo de caso' não 'case', 'habilidade' não 'skill'). Prefira "comportamento" a "descritor".
9. "estudo_recomendado" NÃO é dever de casa — são os TEMAS que a própria jornada ENTREGA à pessoa, resumidos toda semana (microaprendizagem). Escreva como algo que ela VAI RECEBER, não que precisa buscar.

PRINCÍPIOS INEGOCIÁVEIS:
1. Níveis SEMPRE numéricos (1-4). Nível 3 = META.
2. Nunca mencione scores DISC numéricos. Descreva em linguagem acessível.
3. DISC/CIS deve aparecer como leitura contextual, não como diagnóstico fechado.
4. SEMPRE inclua TODAS as competências do input, inclusive pendentes (flag=true).
5. Competências com nível < 3 devem ter um sprint de 30 dias enxuto e executável (no máximo 4 ações prioritárias).
6. Se CONTEÚDOS RECOMENDADOS forem fornecidos, inclua-os conectados ao gap.
7. Scripts prontos são bem-vindos quando aumentam a aplicabilidade.
8. Metas em primeira pessoa e com horizonte claro.
9. Não invente comportamento, resultado ou contexto que não esteja sustentado.

REGRAS PARA O SPRINT DE 30 DIAS:
- O sprint é ENXUTO e executável: no máximo 4 ações prioritárias (1 principal + 1 de apoio + 1 evidência + 1 ritual). NUNCA 8 ações, nem 4 semanas de tarefas.
- "foco_30_dias": 1 frase com o movimento central dos 30 dias (ex.: transformar sinais de desgaste em decisão).
- "acao_principal" e "acao_apoio": concretas, realistas, que cabem na rotina. Evitar ações vagas ("refletir mais") sem comportamento observável.
- "evidencia_esperada": 1 evidência observável, com marco temporal quando fizer sentido (ex.: antes do próximo conselho, a pessoa usa pelo menos 1 sinal para renegociar prioridade).
- "ritual": 1 ritual de acompanhamento curto (ex.: revisão semanal de 10 minutos).
- "checklist": exatamente 3 itens curtos e verificáveis.
- Se houver conteúdos recomendados, conectá-los ao gap em "estudo_recomendado" — NÃO inflar o sprint.

LINGUAGEM DE SAÚDE E SOBRECARGA (regra rígida):
- NÃO usar linguagem clínica nem diagnóstico de saúde. Ex.: NÃO escrever "Estresse e burnout — identificação e prevenção".
- Tratar como desenvolvimento profissional. Ex.: "Sinais de sobrecarga no trabalho — como reconhecer limites e buscar apoio".
- Foco em reconhecer limites, renegociar prioridades e buscar apoio — nunca diagnóstico ou tratamento.

REGRAS PARA COMPETÊNCIAS NÍVEL 3 OU 4:
- Não criar plano pesado desnecessário
- Foco em manutenção, refinamento, ampliação ou multiplicação
- Reconhecer força sem acomodar

REGRAS PARA COMPETÊNCIAS PENDENTES (flag=true):
- Reconhecer que a leitura está incompleta
- Evitar falsa precisão
- Sugerir observação ou desenvolvimento exploratório
- Sprint placeholder: "foco_30_dias" = "Aguardando avaliação — ações a definir" (demais campos vazios ou breves)

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
    "descricao": "Fale DIRETO com a pessoa, em 2ª pessoa e tom de conversa — ex.: 'Elizângela, seu perfil combina...'. NUNCA em 3ª pessoa ('O perfil de Elizângela...'). Como o seu perfil influencia o seu desempenho (2-3 parágrafos). SEM scores numéricos.",
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
      "descritores_desenvolvimento": ["comportamentos que precisam de atenção (linguagem de comportamento, não jargão)"],
      "fez_bem": ["2-3 comportamentos positivos observados"],
      "melhorar": ["2-3 pontos concretos para melhorar"],
      "feedback": "Parágrafo com análise construtiva",
      "sprint": {
        "foco_30_dias": "1 frase — o movimento central dos 30 dias",
        "acao_principal": "1 ação concreta e realista",
        "acao_apoio": "1 ação de apoio",
        "evidencia_esperada": "1 evidência observável",
        "ritual": "1 ritual de acompanhamento curto (ex.: revisão semanal de 10 minutos)",
        "checklist": ["item curto 1", "item curto 2", "item curto 3"]
      },
      "dicas_desenvolvimento": ["Quando [gatilho], [ação]. Ex: Quando sentir resistência, diga: Me ajuda a entender..."],
      "estudo_recomendado": [
        {
          "titulo": "TEMA do conteúdo, em português claro, SEM termos em inglês (evite 'feedback', 'case', 'skill'... use 'devolutiva', 'estudo de caso', 'habilidade')",
          "formato": "vídeo|texto|áudio|estudo de caso",
          "por_que_ajuda": "conexão com o comportamento a desenvolver",
          "url": "URL ou referência"
        }
      ]
    }
  ],
  "mensagem_final": "2-3 linhas de fechamento. Reforçar que é treinável e que pequenas mudanças geram grande impacto.",
  "alertas_metodologicos": ["alerta 1 se houver"]
}`;


export interface PdiPromptBuilt {
  system: string;
  user: string;
  dadosComps: DadoComp[];
  blueprint: DevelopmentBlueprint | null;
  colab: any;
  empresa: any;
}

export async function buildRelatorioIndividualPrompt(
  sbRaw: SupabaseClient,
  { empresaId, colaboradorId }: { empresaId: string; colaboradorId: string },
): Promise<PdiPromptBuilt | { error: string }> {
  const tdb = tenantDb(empresaId);
  const { data: colab } = await tdb.from('colaboradores')
    .select('id, nome_completo, cargo, email, d_natural, i_natural, s_natural, c_natural, perfil_dominante, lid_executivo, lid_motivador, lid_metodico, lid_sistematico')
    .eq('id', colaboradorId).single();
  if (!colab) return { error: 'Colaborador não encontrado' };

  // empresas: id é o tenant — sem empresa_id; usar raw
  const { data: empresa } = await sbRaw.from('empresas')
    .select('nome, segmento').eq('id', empresaId).single();
  if (!empresa) return { error: 'Empresa não encontrada' };

  // Buscar TODAS respostas do colab (avaliadas ou não). Aceita match
  // por colaborador_id OU por email_colaborador (alguns rows antigos
  // têm colaborador_id NULL).
  const emailFilter = (colab.email || '').trim().toLowerCase();
  const { data: respostas } = await tdb.from('respostas')
    .select('competencia_id, competencia_nome, avaliacao_ia, nivel_ia4, nota_ia4, pontos_fortes, pontos_atencao, feedback_ia4, colaborador_id, email_colaborador')
    .or(`colaborador_id.eq.${colaboradorId}${emailFilter ? `,email_colaborador.eq.${emailFilter}` : ''}`);

  // Top 5 esperado do cargo (fonte de verdade)
  const { data: cargoEmp } = await tdb.from('cargos_empresa')
    .select('top5_workshop, competencia_foco, competencias_foco').eq('nome', colab.cargo).maybeSingle();
  const top5Esperado: string[] = cargoEmp?.top5_workshop || [];
  // Gate "PDI completo": com top5 configurado, só gera quando TODAS as
  // competências esperadas têm resposta AVALIADA pela IA — avaliação parcial
  // gerava PDI capado (ex.: 1/2 respondida chegava a entrar na fila do lote).
  if (top5Esperado.length > 0) {
    const avaliadas = (respostas || []).filter((r) => r.avaliacao_ia != null).length;
    if (avaliadas < top5Esperado.length) {
      return { error: `Avaliação incompleta: ${avaliadas}/${top5Esperado.length} competências avaliadas — o PDI só é gerado com a avaliação completa` };
    }
  }
  // Competências FOCO do cargo (fonte única PDI↔trilha, item D).
  const focoCargo: string[] = focoDoCargo(cargoEmp);

  // Coerência PDI↔trilha (Fase 0, item 1): o PDI deve focar EXATAMENTE as
  // competências que a trilha do colaborador trabalha. Lê competencias_foco
  // (par DUO, mig 091) ou competencia_foco (single). Sem trilha → cai no
  // top5/respostas. Garante que o que está no PDI é o que a pessoa vai praticar.
  const { data: trilhaColab } = await tdb.from('trilhas')
    .select('competencias_foco, competencia_foco, criado_em')
    .eq('colaborador_id', colaboradorId)
    .order('criado_em', { ascending: false })
    .limit(1).maybeSingle();
  const focoTrilha: string[] = (
    Array.isArray(trilhaColab?.competencias_foco) && trilhaColab!.competencias_foco.length
      ? trilhaColab!.competencias_foco
      : (trilhaColab?.competencia_foco ? [trilhaColab.competencia_foco] : [])
  ).filter(Boolean);

  // Foco é OBRIGATÓRIO pra gerar o PDI (item D): sem foco, o PDI não teria
  // como bater com a trilha. Cargo é a fonte; trilha existente também serve.
  if (focoCargo.length === 0 && focoTrilha.length === 0) {
    return { error: 'Selecione as competências foco do cargo (tela de Cargos) antes de gerar o PDI.' };
  }

  // Development Blueprint (Fase 1, Estágio 2): fonte ÚNICA do plano. Quando existe,
  // o SPRINT do PDI vem DELE (coerência com a trilha) e a página "vira trilha"
  // mostra o binding real. Sem blueprint → comportamento atual (fallback).
  const { data: bpRow } = await tdb.from('development_blueprints')
    .select('blueprint')
    .eq('colaborador_id', colaboradorId)
    .order('gerado_em', { ascending: false })
    .limit(1).maybeSingle();
  const blueprint: DevelopmentBlueprint | null = (bpRow?.blueprint as DevelopmentBlueprint) || null;
  const blueprintComps = (blueprint?.competencias || []).map((c) => c.nome).filter(Boolean);

  if (!respostas?.length && !top5Esperado.length) {
    return { error: 'Nenhuma resposta nem top5 configurado para este colaborador' };
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

  // Lista alvo (ordem de prioridade): BLUEPRINT (fonte única do plano, Estágio 2)
  // → competências FOCO do cargo (fonte única, item D) → foco da trilha (caso de
  // regeneração) → top5 → respondidas. Com blueprint, as competências do PDI são
  // EXATAMENTE as dele (mesmos nomes/ordem).
  const competenciasAlvo: string[] = blueprintComps.length > 0
    ? blueprintComps
    : focoCargo.length > 0
      ? focoCargo
      : focoTrilha.length > 0
        ? focoTrilha
        : top5Esperado.length > 0
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
    // Régua única em lib/nivel-regua — a pessoa é N-x até CONSOLIDAR o x+1
    // (média 1.9 = N1), e N4 abre em 3,5. Mesma régua do blueprint e da IA4.
    return { nivel: nivelDaNota(media), nota_decimal: Number(media.toFixed(2)) };
  };

  // Fuzzy fallback: includes-match para nomes próximos.
  const fuzzyFindResp = (nomeComp: string): any => {
    const k = normKey(nomeComp);
    const all = Object.keys(respPorNome);
    const hit = all.find(rn => rn.includes(k) || k.includes(rn));
    return hit ? respPorNome[hit] : null;
  };

  // Nível AUTORITATIVO do blueprint (fonte única): quando existe, o PDI usa o
  // MESMO nível que o blueprint (N1/N2...), pra não divergir (blueprint N1 vs PDI N2).
  const nivelBlueprint = new Map<string, number>();
  for (const c of (blueprint?.competencias || [])) {
    const n = parseInt(String(c.nivel_atual).replace(/\D/g, ''), 10);
    if (c.nome && n >= 1 && n <= 4) nivelBlueprint.set(normKey(c.nome), n);
  }

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
    // Blueprint tem precedência (fonte única) → PDI e blueprint mostram o mesmo nível.
    const nivelEff = nivelBlueprint.get(k) ?? (av?.consolidacao?.nivel_geral || r?.nivel_ia4 || fromAssess?.nivel || 'pendente');
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

  // BLUEPRINT como FONTE DO PLANO (Estágio 2): quando existe, o sprint de cada
  // competência é DERIVADO dos objetivos_30_dias do blueprint — a IA não inventa
  // ações novas. A IA ainda escreve acolhimento, perfil, análise e tom.
  let blueprintBlock = '';
  if (blueprint) {
    const compBlocos = (blueprint.competencias || []).map((comp) => {
      const descr = (comp.descritores_foco || []).map((d) =>
        `    - ${d.nome}: gap=${d.gap_observado} | esperado=${d.comportamento_esperado} | evidência=${d.evidencia_esperada}`,
      ).join('\n');
      const objs = (comp.objetivos_30_dias || []).map((o) =>
        `    • [${o.id}] objetivo: ${o.objetivo}\n      acao_principal: ${o.acao_principal}\n      acao_apoio: ${o.acao_apoio || '—'}\n      evidencia_de_execucao: ${o.evidencia_de_execucao}\n      ritual: ${o.ritual || '—'}\n      criterio_de_sucesso: ${o.criterio_de_sucesso}`,
      ).join('\n');
      return `COMPETÊNCIA: ${comp.nome} (nível atual ${comp.nivel_atual})\n  Leitura: ${comp.leitura}\n  Descritores foco:\n${descr || '    (nenhum)'}\n  Objetivos de 30 dias:\n${objs || '    (nenhum)'}`;
    }).join('\n\n');
    blueprintBlock = `\n\n=== BLUEPRINT (fonte única do plano — NÃO invente ações novas) ===\n${compBlocos}\n\nINSTRUÇÕES DE USO DO BLUEPRINT (obrigatórias):\n- O array 'competencias' do output DEVE conter EXATAMENTE as competências acima, com os MESMOS nomes e na MESMA ordem. NÃO crie competências fora do blueprint.\n- O 'sprint' de cada competência DEVE ser DERIVADO dos objetivos_30_dias da MESMA competência no blueprint: sprint.foco_30_dias ← objetivo; sprint.acao_principal ← acao_principal (igual); sprint.acao_apoio ← acao_apoio (igual); sprint.ritual ← ritual (igual); sprint.evidencia_esperada ← evidencia_de_execucao; sprint.checklist = EXATAMENTE 3 itens curtos e verificáveis derivados do criterio_de_sucesso/evidência. NÃO invente ações fora do blueprint.\n- Você AINDA escreve, com a sua voz humana: o acolhimento, o resumo_geral, o perfil_comportamental, e por competência a análise (feedback, fez_bem, melhorar), as dicas e o tom. Apenas as AÇÕES (sprint) são fixadas pelo blueprint.`;
  }

  const totalComps = dadosComps.length;
  const pendentes = dadosComps.filter(c => c.nivel === 'pendente').length;
  const user = `COLABORADOR: ${colab.nome_completo}\nCARGO: ${colab.cargo}\nEMPRESA: ${empresa.nome} (${empresa.segmento})\n\nPERFIL COMPORTAMENTAL:\n${perfilCIS}\n\n=== ATENCAO ===\nO array DADOS POR COMPETENCIA contem ${totalComps} competencia(s) do TOP 5 do cargo. ${pendentes > 0 ? `${pendentes} esta(o) marcadas como 'pendente' (sem avaliacao IA4) — voce DEVE incluir essas tambem no output, com flag=true e plano placeholder.` : ''} O array 'competencias' do output DEVE ter EXATAMENTE ${totalComps} itens, na MESMA ordem.\n\nDADOS POR COMPETENCIA:\n${JSON.stringify(dadosComps, null, 2)}${trilhaTexto}${blueprintBlock}`;

  return { system: RELATORIO_IND_SYSTEM, user, dadosComps, blueprint, colab, empresa };
}
