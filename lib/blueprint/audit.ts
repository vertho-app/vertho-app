/**
 * Auditoria de coerência do Development Blueprint (Fase 1, Estágio 4).
 *
 * Duas camadas:
 *  1) ESTRUTURAL (código, determinístico, barato) — verifica por PRESENÇA nominal
 *     (a LIÇÃO MÁXIMA do scoring: "verificar por presença, não ausência"): toda
 *     ação do PDI é sustentada por ≥1 semana? toda semana referencia objetivo
 *     EXISTENTE? nenhuma semana fora das competências foco? carga compatível com N1?
 *  2) SEMÂNTICA (2ª IA, adversarial) — julgamento que o código não faz: a missão
 *     coleta evidência do descritor certo? a exigência cabe em quem está em N1? o
 *     cenário final (avaliação) mede o que o PDI prometeu? há objetivo genérico?
 *
 * PURO (sem I/O). A action `auditarBlueprint` orquestra: roda o estrutural, chama
 * a IA com o prompt daqui, funde num relatório e persiste o drift no blueprint.
 *
 * NÃO é `'use server'` de propósito (tipos + funções sync).
 */

import type { DevelopmentBlueprint } from './types';

export type AuditStatus = 'pass' | 'warn' | 'fail';
export type AuditCategoria = 'estrutura' | 'semantica';

export interface BlueprintAuditCheck {
  id: string;
  categoria: AuditCategoria;
  titulo: string;
  status: AuditStatus;
  detalhe: string;
  /** Lista nominal do que motivou o status (presença/ausência concreta). */
  itens?: string[];
}

export interface BlueprintAuditReport {
  /** Sem nenhum `fail`. */
  ok: boolean;
  /** Há ≥1 `fail` (incoerência dura). */
  drift: boolean;
  /** #pass / #total (0-100), só como sinal rápido. */
  score: number;
  checks: BlueprintAuditCheck[];
  resumo: string;
  auditado_em: string;
}

export interface AuditParametros {
  duracaoSemanas: number;
  semanasMissao: number[];
  semanasAvaliacao: number[];
}

const norm = (s: string): string =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Nível N1..N4 → número (default 1 quando ilegível). */
const nivelNum = (n: string | undefined): number => {
  const m = /n?([1-4])/i.exec(String(n || ''));
  return m ? Number(m[1]) : 1;
};

/**
 * Camada ESTRUTURAL: checks determinísticos sobre o blueprint. Não chama IA.
 * Cada check reporta a lista NOMINAL do que o motivou (não só um booleano).
 */
export function auditEstrutural(
  bp: DevelopmentBlueprint,
  params: AuditParametros,
): BlueprintAuditCheck[] {
  const checks: BlueprintAuditCheck[] = [];
  const comps = bp.competencias || [];
  const semanas = bp.trilha?.semanas || [];

  // Universo de ids de objetivos + nomes de competências/descritores.
  const objIds = new Set<string>();
  const objsPorComp = new Map<string, number>();
  for (const c of comps) {
    objsPorComp.set(c.nome, (c.objetivos_30_dias || []).length);
    for (const o of c.objetivos_30_dias || []) if (o?.id) objIds.add(o.id);
  }
  const compNomes = new Set(comps.map((c) => norm(c.nome)));

  // 1) Toda ação do PDI (objetivo_30_dias) é sustentada por ≥1 semana?
  const referenciados = new Set<string>();
  for (const s of semanas) for (const id of s.conexao_com_pdi || []) referenciados.add(id);
  const orfaos = [...objIds].filter((id) => !referenciados.has(id));
  checks.push({
    id: 'pdi-coberto',
    categoria: 'estrutura',
    titulo: 'Toda ação do PDI aparece na trilha',
    status: orfaos.length === 0 ? 'pass' : 'fail',
    detalhe: orfaos.length === 0
      ? `Todos os ${objIds.size} objetivos_30_dias são sustentados por ≥1 semana.`
      : `${orfaos.length} objetivo(s) do PDI sem nenhuma semana que os sustente.`,
    itens: orfaos.length ? orfaos : undefined,
  });

  // 2) Toda semana referencia objetivo EXISTENTE (sem id fantasma)?
  const fantasmas: string[] = [];
  for (const s of semanas) {
    for (const id of s.conexao_com_pdi || []) {
      if (!objIds.has(id)) fantasmas.push(`sem ${s.semana}→${id}`);
    }
  }
  checks.push({
    id: 'pdi-existente',
    categoria: 'estrutura',
    titulo: 'Semanas só referenciam objetivos existentes',
    status: fantasmas.length === 0 ? 'pass' : 'fail',
    detalhe: fantasmas.length === 0
      ? 'Nenhuma semana aponta id de objetivo inexistente.'
      : `${fantasmas.length} referência(s) a objetivo inexistente.`,
    itens: fantasmas.length ? fantasmas : undefined,
  });

  // 3) Toda semana tem conexão com o PDI (nenhuma órfã)?
  const semConexao = semanas
    .filter((s) => !Array.isArray(s.conexao_com_pdi) || s.conexao_com_pdi.length === 0)
    .map((s) => `sem ${s.semana}`);
  checks.push({
    id: 'semana-vinculada',
    categoria: 'estrutura',
    titulo: 'Nenhuma semana sem vínculo com o PDI',
    status: semConexao.length === 0 ? 'pass' : 'fail',
    detalhe: semConexao.length === 0
      ? 'Toda semana referencia ≥1 objetivo do PDI.'
      : `${semConexao.length} semana(s) sem conexao_com_pdi.`,
    itens: semConexao.length ? semConexao : undefined,
  });

  // 4) Nenhuma semana fora das competências foco?
  const foraDoFoco: string[] = [];
  for (const s of semanas) {
    for (const cf of s.competencia_foco || []) {
      if (!compNomes.has(norm(cf))) foraDoFoco.push(`sem ${s.semana}: "${cf}"`);
    }
  }
  checks.push({
    id: 'dentro-do-foco',
    categoria: 'estrutura',
    titulo: 'Toda semana fica nas competências foco',
    status: foraDoFoco.length === 0 ? 'pass' : 'fail',
    detalhe: foraDoFoco.length === 0
      ? 'Nenhuma semana usa competência fora das foco do plano.'
      : `${foraDoFoco.length} semana(s) com competência fora das foco.`,
    itens: foraDoFoco.length ? foraDoFoco : undefined,
  });

  // 5) Calendário: duração e semanas de missão/avaliação batem com o esperado?
  const nSem = semanas.length;
  const missaoBp = semanas.filter((s) => s.tipo === 'missao').map((s) => s.semana).sort((a, b) => a - b);
  const avalBp = semanas.filter((s) => s.tipo === 'avaliacao').map((s) => s.semana).sort((a, b) => a - b);
  const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  const problemasCal: string[] = [];
  if (nSem !== params.duracaoSemanas) problemasCal.push(`duração ${nSem}≠${params.duracaoSemanas}`);
  if (!eq(missaoBp, [...params.semanasMissao].sort((a, b) => a - b))) problemasCal.push(`missão ${JSON.stringify(missaoBp)}≠${JSON.stringify(params.semanasMissao)}`);
  if (!eq(avalBp, [...params.semanasAvaliacao].sort((a, b) => a - b))) problemasCal.push(`avaliação ${JSON.stringify(avalBp)}≠${JSON.stringify(params.semanasAvaliacao)}`);
  checks.push({
    id: 'calendario',
    categoria: 'estrutura',
    titulo: 'Calendário (duração/missão/avaliação) bate com o modo',
    // warn, não fail: o motor é AUTORITATIVO sobre missão/avaliação (Estágio 3),
    // então divergência aqui não quebra a trilha — mas sinaliza blueprint torto.
    status: problemasCal.length === 0 ? 'pass' : 'warn',
    detalhe: problemasCal.length === 0
      ? `Duração ${nSem}, missão ${JSON.stringify(missaoBp)}, avaliação ${JSON.stringify(avalBp)}.`
      : `Divergências: ${problemasCal.join('; ')}.`,
    itens: problemasCal.length ? problemasCal : undefined,
  });

  // 6) Carga compatível com N1 (não sobrecarrega quem está em lacuna)?
  const sobrecarga: string[] = [];
  for (const c of comps) {
    const nv = nivelNum(c.nivel_atual);
    const nObj = (c.objetivos_30_dias || []).length;
    if (nv === 1 && nObj > 2) sobrecarga.push(`${c.nome}: N1 com ${nObj} objetivos (máx 2)`);
  }
  checks.push({
    id: 'carga-nivel',
    categoria: 'estrutura',
    titulo: 'Carga de objetivos compatível com o nível (N1 ≤ 2)',
    status: sobrecarga.length === 0 ? 'pass' : 'warn',
    detalhe: sobrecarga.length === 0
      ? 'Nenhuma competência N1 sobrecarregada.'
      : `${sobrecarga.length} competência(s) N1 com objetivos demais.`,
    itens: sobrecarga.length ? sobrecarga : undefined,
  });

  return checks;
}

// ── Camada SEMÂNTICA (2ª IA) ─────────────────────────────────────────────────

const AUDIT_SYSTEM = `Você é um AUDITOR CRÍTICO de coerência de planos de desenvolvimento da plataforma Vertho.

Recebe um DEVELOPMENT BLUEPRINT (fonte única da qual PDI e trilha derivam) e deve procurar INCOERÊNCIAS com ceticismo — seu trabalho é ACHAR problema, não elogiar. Só aprove o que realmente se sustenta.

Julgue APENAS o que exige leitura semântica (o que um verificador de código não pega):
1. COBRE O QUE PROMETE: a trilha (semanas/missões) realmente desenvolve os objetivos_30_dias do PDI, ou há objetivo que nenhuma semana trabalha de fato?
2. MISSÃO ↔ EVIDÊNCIA: cada missão coleta evidência do(s) descritor(es) certo(s) para a competência daquela fase?
3. EXIGÊNCIA ↔ NÍVEL: a exigência das ações/missões cabe em quem está no nível avaliado (N1 não pode receber tarefa de N3)? Aponte exageros.
4. AVALIAÇÃO FINAL MEDE O PROMETIDO: as semanas de avaliação medem o que o PDI prometeu desenvolver?
5. GENÉRICO: há objetivo/ação/leitura que serviria para QUALQUER pessoa (sem ancoragem no cargo/dados)? Aponte.
6. TOM/SAÚDE: alguma linguagem clínica ou de saúde (deveria ser desenvolvimento profissional)?

Para CADA item, dê status: "pass" (coerente), "warn" (fraco/ambíguo, não quebra) ou "fail" (incoerência real). Seja concreto: cite a semana/objetivo/competência.

RETORNE APENAS JSON VÁLIDO (sem markdown):
{
  "checks": [
    { "id": "cobre-o-que-promete", "titulo": "", "status": "pass|warn|fail", "detalhe": "concreto, citando o item", "itens": ["opcional: lista nominal"] }
  ],
  "resumo": "1-2 frases: o blueprint é coerente? qual o maior risco?"
}
Use exatamente estes ids: cobre-o-que-promete, missao-evidencia, exigencia-nivel, avaliacao-mede, generico, tom-saude.`;

/** Serializa o blueprint de forma enxuta para o auditor (sem campos redundantes). */
function blueprintParaAuditoria(bp: DevelopmentBlueprint): string {
  const comps = (bp.competencias || []).map((c) => ({
    nome: c.nome,
    nivel_atual: c.nivel_atual,
    prioridade: c.prioridade,
    leitura: c.leitura,
    descritores_foco: (c.descritores_foco || []).map((d) => ({ nome: d.nome, gap: d.gap_observado, esperado: d.comportamento_esperado })),
    objetivos_30_dias: (c.objetivos_30_dias || []).map((o) => ({ id: o.id, objetivo: o.objetivo, acao: o.acao_principal, evidencia: o.evidencia_de_execucao, criterio: o.criterio_de_sucesso })),
    missoes_sugeridas: c.missoes_sugeridas,
  }));
  const semanas = (bp.trilha?.semanas || []).map((s) => ({
    semana: s.semana, tipo: s.tipo, comp: s.competencia_foco, desc: s.descritores_foco,
    objetivo_da_semana: s.objetivo_da_semana, conexao_com_pdi: s.conexao_com_pdi,
    evidencia: s.evidencia_esperada, criterio: s.criterio_de_sucesso,
  }));
  return JSON.stringify({ colaborador: bp.colaborador, foco_geral: bp.foco_geral, competencias: comps, trilha: { duracao_semanas: bp.trilha?.duracao_semanas, semanas } }, null, 2);
}

/** Constrói o par (system, user) da auditoria semântica. PURA. */
export function buildBlueprintAuditPrompt(bp: DevelopmentBlueprint): { system: string; user: string } {
  return {
    system: AUDIT_SYSTEM,
    user: `Audite o blueprint abaixo. Seja cético e concreto.\n\n═══ BLUEPRINT ═══\n${blueprintParaAuditoria(bp)}`,
  };
}

const IDS_SEMANTICOS = ['cobre-o-que-promete', 'missao-evidencia', 'exigencia-nivel', 'avaliacao-mede', 'generico', 'tom-saude'];

/** Converte a resposta da IA em checks semânticos (tolerante a lixo). */
export function parseAuditResponse(parsed: any): { checks: BlueprintAuditCheck[]; resumo: string } {
  const raw: any[] = Array.isArray(parsed?.checks) ? parsed.checks : [];
  const checks: BlueprintAuditCheck[] = raw
    .filter((c) => c && typeof c === 'object')
    .map((c) => {
      const status: AuditStatus = c.status === 'fail' ? 'fail' : c.status === 'warn' ? 'warn' : 'pass';
      const id = IDS_SEMANTICOS.includes(c.id) ? c.id : String(c.id || 'semantico');
      return {
        id,
        categoria: 'semantica' as const,
        titulo: String(c.titulo || id),
        status,
        detalhe: String(c.detalhe || ''),
        itens: Array.isArray(c.itens) && c.itens.length ? c.itens.map(String) : undefined,
      };
    });
  return { checks, resumo: String(parsed?.resumo || '') };
}

/** Funde estrutural + semântico num relatório com drift/score. */
export function montarRelatorioAuditoria(
  estrutural: BlueprintAuditCheck[],
  semantico: { checks: BlueprintAuditCheck[]; resumo: string },
  auditadoEm: string,
): BlueprintAuditReport {
  const checks = [...estrutural, ...semantico.checks];
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  const pass = checks.filter((c) => c.status === 'pass').length;
  // warn vale meio-ponto (fraco, não quebra) — um plano sem fails mas com warns
  // não deve despencar pra 50%; fail zera o peso do check.
  const score = checks.length ? Math.round(((pass + 0.5 * warns) / checks.length) * 100) : 0;
  return {
    ok: fails === 0,
    drift: fails > 0,
    score,
    checks,
    resumo: semantico.resumo || (fails === 0 ? 'Blueprint coerente.' : `${fails} incoerência(s) encontrada(s).`),
    auditado_em: auditadoEm,
  };
}
