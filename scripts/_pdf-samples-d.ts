/**
 * INTERNO / não-versionar: gera 2 amostras dos PDFs de Adequação ao Cargo com
 * dados fictícios realistas (~8 pessoas, status variados) p/ padronização de
 * look-and-feel. Salva em ~/Downloads/vertho-pdf-samples.
 * Rodar de nextjs-app:  DEBUG=1 npx --yes tsx scripts/_pdf-samples-d.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AdequacaoCargo, PessoaAdequacao, SubScore, DiscFator, TracoDiag, TraitGap, PerfilIdeal,
} from '@/lib/adequacao-cargo/aggregate';
import type { KnockoutEvidencia } from '@/lib/adequacao-cargo/evidencia';
import { LABEL_ORIGEM } from '@/lib/adequacao-cargo/evidencia';
import type { Recommendation, Status } from '@/lib/scoring/engine';

const OUT = (process.env.PDF_OUT || path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples'));
fs.mkdirSync(OUT, { recursive: true });

async function save(nome: string, bytes: Uint8Array | Buffer) {
  const p = path.join(OUT, `${nome}.pdf`);
  fs.writeFileSync(p, Buffer.from(bytes));
  console.log('OK', nome, `${Buffer.from(bytes).length / 1024 | 0}KB`);
}

// ─────────────────── Perfil ideal do cargo (Coordenador Pedagógico) ───────────
type Dir = 'floor' | 'target' | 'ceiling';
const COMP: { key: string; label: string; dir: Dir; lo: number; hi: number }[] = [
  { key: 'comm', label: 'Comunicação Assertiva', dir: 'floor', lo: 60, hi: 100 },
  { key: 'plan', label: 'Planejamento e Organização', dir: 'target', lo: 45, hi: 78 },
  { key: 'confl', label: 'Gestão de Conflitos', dir: 'floor', lo: 55, hi: 100 },
  { key: 'result', label: 'Orientação a Resultados', dir: 'floor', lo: 50, hi: 100 },
  { key: 'escuta', label: 'Escuta Ativa', dir: 'target', lo: 40, hi: 72 },
  { key: 'dev', label: 'Desenvolvimento de Pessoas', dir: 'floor', lo: 55, hi: 100 },
];
const DISC: { f: 'D' | 'I' | 'S' | 'C'; nome: string; lo: number; hi: number; dir: Dir }[] = [
  { f: 'D', nome: 'Dominância', lo: 40, hi: 72, dir: 'target' },
  { f: 'I', nome: 'Influência', lo: 55, hi: 100, dir: 'floor' },
  { f: 'S', nome: 'Estabilidade', lo: 45, hi: 85, dir: 'target' },
  { f: 'C', nome: 'Conformidade', lo: 50, hi: 100, dir: 'floor' },
];

// fit contínuo 0..1 aproximado (direção-aware) — só p/ tornar os mocks coerentes.
function fit(bruto: number, lo: number, hi: number, dir: Dir): number {
  if (dir === 'floor') return bruto >= lo ? 1 : Math.max(0, bruto / lo);
  if (dir === 'ceiling') return bruto <= hi ? 1 : Math.max(0, (100 - bruto) / (100 - hi));
  if (bruto >= lo && bruto <= hi) return 1;
  if (bruto < lo) return Math.max(0, 1 - ((lo - bruto) / lo) * 1.15);
  return Math.max(0, 1 - ((bruto - hi) / (100 - hi)) * 1.15);
}
const classeDe = (pct: number) => (pct >= 85 ? 'alta' : pct >= 60 ? 'razoavel' : 'baixa') as SubScore['classe'];
const sub = (pct: number, total: number, aplicavel = true): SubScore => ({
  atendidos: Math.round((pct / 100) * total), total, pct: Math.round(pct * 10) / 10, classe: classeDe(pct), aplicavel,
});

interface PSpec {
  nome: string; id: string;
  comp: Record<string, number>;   // brutos das competências (0-100)
  disc: Record<'D' | 'I' | 'S' | 'C', number>;
  mapeamentoPct: number; liderancaPct: number; beta: number;
  status: Status; recomendacao: Recommendation;
  borderline?: boolean; betaSemDelta?: number;
  knockoutEvidencias?: KnockoutEvidencia[];
}

function build(p: PSpec): PessoaAdequacao {
  // tracos (competência + DISC) — fonte do gaps/Análise Individual.
  const tCompetencia: TracoDiag[] = COMP.map((c) => {
    const bruto = p.comp[c.key];
    return { key: c.key, label: c.label, bloco: 'Competência', direcao: c.dir, lo: c.lo, hi: c.hi, bruto, fitPct: Math.round(fit(bruto, c.lo, c.hi, c.dir) * 100) };
  });
  const tDisc: TracoDiag[] = DISC.map((d) => {
    const bruto = p.disc[d.f];
    return { key: d.f, label: d.nome, bloco: 'DISC', direcao: d.dir, lo: d.lo, hi: d.hi, bruto, fitPct: Math.round(fit(bruto, d.lo, d.hi, d.dir) * 100) };
  });
  const tracos = [...tCompetencia, ...tDisc];

  const disc: DiscFator[] = DISC.map((d) => {
    const score = p.disc[d.f];
    const dentro = score >= d.lo && score <= d.hi;
    const f = fit(score, d.lo, d.hi, d.dir);
    return { fator: d.f, score: Math.round(score), min: d.lo, max: d.hi, dentro, classe: classeDe(f * 100) };
  });

  const gaps: TraitGap[] = tracos
    .filter((t) => t.fitPct < 75)
    .sort((a, b) => a.fitPct - b.fitPct)
    .slice(0, 6)
    .map((t) => {
      const raw = t.bruto ?? 0;
      const lado: TraitGap['lado'] = t.lo != null && raw < t.lo ? 'abaixo' : t.hi != null && raw > t.hi ? 'acima' : null;
      return { traco: t.label, bloco: t.bloco, fitPct: t.fitPct, direcao: t.direcao, valorBruto: t.bruto, lo: t.lo, hi: t.hi, lado };
    });

  const compPct = tCompetencia.reduce((a, t) => a + t.fitPct, 0) / tCompetencia.length;
  const discPct = tDisc.reduce((a, t) => a + t.fitPct, 0) / tDisc.length;

  const evs = p.knockoutEvidencias ?? [];
  const origem = (() => {
    const blocos = new Set(evs.map((e) => e.bloco).filter(Boolean));
    if (!blocos.size) return null;
    const temComp = blocos.has('Competencia');
    const temComp2 = blocos.has('DISC') || blocos.has('Mapeamento') || blocos.has('Lideranca');
    return temComp && temComp2 ? 'misto' : temComp ? 'competencia' : 'comportamental';
  })() as PessoaAdequacao['origemBloqueio'];

  const STATUS_LABEL: Record<Status, string> = {
    recomendado: 'Recomendado', recomendado_com_ressalvas: 'Recomendado com ressalvas',
    abaixo_do_corte: 'Abaixo do corte', bloqueado: 'Bloqueado',
  };
  const REC_LABEL: Record<Recommendation, string> = {
    recomendado: 'Recomendado', recomendado_com_ressalvas: 'Recomendado com ressalvas', nao_recomendado: 'Não recomendado',
  };

  return {
    id: p.id, nome: p.nome, tracos, disc,
    mapeamento: sub(p.mapeamentoPct, 4),
    competencia: sub(compPct, COMP.length),
    lideranca: sub(p.liderancaPct, 4),
    discScore: sub(discPct, 4),
    beta: sub(p.beta, 0),
    recomendacao: p.recomendacao, recomendacaoLabel: REC_LABEL[p.recomendacao],
    status: p.status, statusLabel: STATUS_LABEL[p.status],
    borderline: !!p.borderline, betaSemDelta: p.betaSemDelta ?? 0,
    knockoutFailed: evs.length > 0,
    knockoutMotivos: evs.map((e) => e.consequencia),
    knockoutEvidencias: evs,
    origemBloqueio: origem,
    origemBloqueioLabel: origem ? LABEL_ORIGEM[origem] : null,
    gaps,
  };
}

const specs: PSpec[] = [
  { // recomendado forte
    nome: 'Helena Vasconcelos', id: 'p-helena',
    comp: { comm: 82, plan: 62, confl: 74, result: 78, escuta: 58, dev: 76 },
    disc: { D: 58, I: 74, S: 66, C: 71 },
    mapeamentoPct: 95, liderancaPct: 90, beta: 92.3,
    status: 'recomendado', recomendacao: 'recomendado',
  },
  { // recomendado
    nome: 'Rafael Monteiro', id: 'p-rafael',
    comp: { comm: 71, plan: 58, confl: 63, result: 70, escuta: 55, dev: 64 },
    disc: { D: 64, I: 68, S: 58, C: 63 },
    mapeamentoPct: 88, liderancaPct: 82, beta: 88.1,
    status: 'recomendado', recomendacao: 'recomendado',
  },
  { // com ressalvas — borderline no corte de recomendação (86,5)
    nome: 'Camila Ferreira', id: 'p-camila',
    comp: { comm: 66, plan: 52, confl: 60, result: 61, escuta: 48, dev: 59 },
    disc: { D: 60, I: 62, S: 62, C: 58 },
    mapeamentoPct: 84, liderancaPct: 78, beta: 85.9,
    status: 'recomendado_com_ressalvas', recomendacao: 'recomendado_com_ressalvas',
    borderline: true, betaSemDelta: 2.4,
  },
  { // com ressalvas — alguns gaps
    nome: 'Beatriz Andrade', id: 'p-beatriz',
    comp: { comm: 61, plan: 40, confl: 57, result: 52, escuta: 38, dev: 56 },
    disc: { D: 52, I: 57, S: 44, C: 54 },
    mapeamentoPct: 78, liderancaPct: 70, beta: 80.4,
    status: 'recomendado_com_ressalvas', recomendacao: 'recomendado_com_ressalvas',
  },
  { // abaixo do corte
    nome: 'Diego Nogueira', id: 'p-diego',
    comp: { comm: 48, plan: 34, confl: 46, result: 44, escuta: 30, dev: 47 },
    disc: { D: 74, I: 42, S: 40, C: 46 },
    mapeamentoPct: 70, liderancaPct: 58, beta: 71.2,
    status: 'abaixo_do_corte', recomendacao: 'recomendado_com_ressalvas',
  },
  { // abaixo do corte — borderline no corte de ressalvas (75,4)
    nome: 'Patrícia Lopes', id: 'p-patricia',
    comp: { comm: 52, plan: 30, confl: 44, result: 41, escuta: 26, dev: 43 },
    disc: { D: 48, I: 40, S: 38, C: 42 },
    mapeamentoPct: 66, liderancaPct: 55, beta: 74.6,
    status: 'abaixo_do_corte', recomendacao: 'recomendado_com_ressalvas',
    borderline: true, betaSemDelta: 1.8,
  },
  { // bloqueado — knockout de competência (traço)
    nome: 'Gustavo Teixeira', id: 'p-gustavo',
    comp: { comm: 42, plan: 44, confl: 40, result: 38, escuta: 34, dev: 41 },
    disc: { D: 66, I: 50, S: 42, C: 48 },
    mapeamentoPct: 62, liderancaPct: 50, beta: 58.7,
    status: 'bloqueado', recomendacao: 'nao_recomendado',
    knockoutEvidencias: [
      { traco: 'Comunicação Assertiva', bloco: 'Competencia', valorBruto: 42, piso: 60, consequencia: 'clareza e alinhamento pedagógico da equipe em risco', ehBloco: false },
    ],
  },
  { // bloqueado — knockout misto (bloco DISC + traço de competência)
    nome: 'Larissa Campos', id: 'p-larissa',
    comp: { comm: 55, plan: 36, confl: 48, result: 40, escuta: 32, dev: 38 },
    disc: { D: 80, I: 34, S: 30, C: 44 },
    mapeamentoPct: 58, liderancaPct: 46, beta: 52.1,
    status: 'bloqueado', recomendacao: 'nao_recomendado',
    knockoutEvidencias: [
      { traco: 'DISC', bloco: 'DISC', valorBruto: null, piso: null, consequencia: 'requisito comportamental do bloco não atendido', ehBloco: true, medidoPct: 48, minPct: 60 },
      { traco: 'Desenvolvimento de Pessoas', bloco: 'Competencia', valorBruto: 38, piso: 55, consequencia: 'formação e acompanhamento da equipe comprometidos', ehBloco: false },
    ],
  },
];

// Ordena por Beta desc; bloqueados/nao_recomendado ao fim (igual ao aggregate).
const pessoas = specs.map(build).sort((a, b) => {
  const ka = a.recomendacao === 'nao_recomendado' ? 1 : 0;
  const kb = b.recomendacao === 'nao_recomendado' ? 1 : 0;
  if (ka !== kb) return ka - kb;
  return b.beta.pct - a.beta.pct;
});

const perfilIdeal: PerfilIdeal = {
  caracteristicas: [
    { par: 'Introversão–Extroversão', polo: 'Extroversão', intensidade: 'moderada' },
    { par: 'Razão–Emoção', polo: 'Equilíbrio', intensidade: 'alta' },
    { par: 'Estabilidade–Adaptação', polo: 'Adaptação', intensidade: 'moderada' },
    { par: 'Foco em Tarefa–Foco em Pessoas', polo: 'Foco em Pessoas', intensidade: 'alta' },
  ],
  competencias: COMP.map((c) => ({ nome: c.label, dimensao: '', min: c.lo, max: c.hi, prioridade: '', direcao: c.dir })),
  lideranca: [
    { key: 'coaching', nome: 'Coaching', pct: 70 },
    { key: 'democratico', nome: 'Democrático', pct: 64 },
    { key: 'visionario', nome: 'Visionário', pct: 56 },
    { key: 'afiliativo', nome: 'Afiliativo', pct: 50 },
  ],
  estiloPredominante: 'Coaching',
  disc: DISC.map((d) => ({ fator: d.f, nome: d.nome, min: d.lo, max: d.hi, direcao: d.dir })),
  pesos: [
    { bloco: 'Competência', pct: 45 },
    { bloco: 'DISC', pct: 30 },
    { bloco: 'Liderança', pct: 15 },
    { bloco: 'Mapeamento', pct: 10 },
  ],
  liderancaAplicavel: true,
  gates: [
    { tipo: 'trait', label: 'Comunicação Assertiva', bloco: 'Competência', minPct: 60, piso: 60 },
    { tipo: 'trait', label: 'Desenvolvimento de Pessoas', bloco: 'Competência', minPct: 55, piso: 55 },
    { tipo: 'block', label: 'DISC', bloco: 'DISC', minPct: 60, piso: null },
  ],
  faixas: { recomendadoMin: 86.5, ressalvasMin: 75.4 },
};

// Narrativas por NOME (o código dos 2 PDFs indexa narrativas[p.nome], não por id).
const narrativas: Record<string, string> = {
  'Helena Vasconcelos': 'Perfil sólido e maduro para a coordenação pedagógica. Comunicação assertiva e desenvolvimento de pessoas bem acima do piso do cargo, com estilo de liderança orientado a coaching. Recomendada sem ressalvas; foco de integração em aprofundar rituais de acompanhamento de resultados.',
  'Rafael Monteiro': 'Bom encaixe geral, com escuta ativa e planejamento na faixa-alvo. Aderência consistente entre blocos e DISC equilibrado. Recomendado; sugere-se acompanhamento leve na gestão de conflitos nos primeiros 90 dias.',
  'Camila Ferreira': 'Candidata limítrofe no corte de recomendação — a nota provável cruza a linha dos 86,5%. Fortalezas em estabilidade e comunicação; escuta ativa abaixo do alvo. Recomendada com ressalvas, com plano de desenvolvimento curto e reavaliação.',
  'Beatriz Andrade': 'Aderência razoável com gaps localizados em planejamento e escuta ativa. Potencial claro de desenvolvimento no eixo organizacional. Recomendada com ressalvas; priorizar trilha de organização e rotina de feedback.',
  'Diego Nogueira': 'Abaixo do corte de recomendação por aderência insuficiente em competências-chave (comunicação, escuta e orientação a resultados). Dominância alta desalinhada da faixa-alvo. Não é bloqueio — é desenvolvimento; reavaliar após trilha dirigida.',
  'Patrícia Lopes': 'Abaixo do corte, limítrofe na linha de ressalvas. Múltiplos traços comportamentais abaixo do esperado para o papel relacional da coordenação. Indicada janela de desenvolvimento de 90 dias antes de nova avaliação.',
  'Gustavo Teixeira': 'Bloqueado por requisito eliminatório de competência: Comunicação Assertiva 42 contra piso 60 do cargo. A coordenação pedagógica exige alinhamento verbal frequente com equipe e famílias — requisito inegociável não atendido. Decisão sujeita a validação humana.',
  'Larissa Campos': 'Bloqueio misto: bloco DISC em 48% (mínimo 60%) e Desenvolvimento de Pessoas 38 contra piso 55. Perfil dominante e baixa estabilidade/influência tensionam o papel relacional. Não recomendada para esta vaga específica.',
};

async function main() {
  // ── 1) Relatório de Adequação ao Cargo ────────────────────────────────────
  {
    const { renderAdequacaoCargoPDF } = await import('@/lib/adequacao-cargo-pdf');
    const data: AdequacaoCargo = {
      cargo: 'Coordenador Pedagógico',
      avaliados: pessoas.length,
      perfilIdeal,
      pessoas,
      avisosCalibracao: [
        { traco: 'Escuta Ativa', pct: 62, tipo: 'piso' },
        { traco: 'Conformidade', pct: 55, tipo: 'teto' },
      ],
      semGabarito: false,
      semColaboradores: false,
    };
    const buf = await renderAdequacaoCargoPDF({
      data, empresaNome: 'Acme Educacao', dataISO: '2026-07-07', narrativas, mostrarCalibracao: true,
    });
    await save('11-adequacao-cargo', buf);
  }

  // ── 2) Ranking de Adequação ao Cargo (canônico) ───────────────────────────
  {
    const { renderRankingAdequacaoPDF } = await import('@/lib/adequacao-cargo/ranking-pdf');
    const elegiveis = pessoas.filter((p) => p.status !== 'bloqueado').sort((a, b) => b.beta.pct - a.beta.pct);
    const anexo = pessoas.filter((p) => p.status === 'bloqueado');
    const buf = await renderRankingAdequacaoPDF({
      empresaNome: 'Acme Educacao',
      cargo: 'Coordenador Pedagógico',
      dataISO: '2026-07-07',
      perfilIdeal,
      eixo: { label: 'Competência', peso: 45 },
      sep: 'DISC',
      divergencia: { eixo: 'Competência', real: 'DISC', sdEixo: 3.2 },
      elegiveis,
      anexo,
      narrativas,
    });
    await save('12-ranking-adequacao', buf);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
