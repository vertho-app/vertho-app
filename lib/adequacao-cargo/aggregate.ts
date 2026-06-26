/**
 * Relatório de Adequação ao Cargo — match colaborador × PERFIL IDEAL do cargo.
 *
 * Replica a metodologia do exemplo (Match Perfil Ideal): para cada colaborador,
 * conta quantos ITENS do gabarito do cargo ele "atende", em 4 dimensões:
 *   - Mapeamento  : características comportamentais (gabarito.tela1) — polo do colab
 *                   (derivado do DISC) bate com o polo escolhido do cargo.
 *   - Competência : subcompetências (gabarito.tela2) — comp_* dentro da faixa ideal.
 *   - Liderança   : 4 estilos (gabarito.tela3) — lid_* compatível com o ideal.
 *   - DISC        : 4 fatores (gabarito.tela4) — {d,i,s,c}_natural dentro da faixa.
 *
 * Cada sub-score = atendidos / total da dimensão. Beta = atendidos TOTAIS / itens
 * TOTAIS (não média de %). Validado contra o PDF de exemplo (ARIANY 34/44 = 77,3%).
 *
 * Puro (sem IA, sem Next) — recebe um SupabaseClient. O PDF + a narrativa consomem.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { COMP_LABEL, LIDERANCA, destaquesBipolares, type DiscMedia } from '@/lib/perfil-organizacional/aggregate';

export type Classe = 'alta' | 'razoavel' | 'baixa';
export interface SubScore { atendidos: number; total: number; pct: number; classe: Classe }

export interface DiscFator { fator: 'D' | 'I' | 'S' | 'C'; score: number; min: number; max: number; dentro: boolean }
export interface PessoaAdequacao {
  nome: string;
  disc: DiscFator[];                 // 4 fatores com score + faixa + dentro
  mapeamento: SubScore;
  competencia: SubScore;
  lideranca: SubScore;
  discScore: SubScore;
  beta: SubScore;                    // score geral (atendidos totais / itens totais)
}

export interface CompetenciaIdeal { nome: string; dimensao: string; min: number; max: number; prioridade: string }
export interface CaracteristicaIdeal { par: string; polo: string; intensidade: string }
export interface PerfilIdeal {
  caracteristicas: CaracteristicaIdeal[];
  competencias: CompetenciaIdeal[];
  lideranca: { nome: string; pct: number; key: string }[];
  estiloPredominante: string;
  disc: { fator: 'D' | 'I' | 'S' | 'C'; nome: string; min: number; max: number }[];
}

export interface AdequacaoCargo {
  cargo: string;
  avaliados: number;
  perfilIdeal: PerfilIdeal;
  pessoas: PessoaAdequacao[];        // ordenadas por Beta desc
  semGabarito: boolean;
  semColaboradores: boolean;
}

const num = (v: any) => Number(v) || 0;
const r1 = (v: number) => Math.round(v * 10) / 10;
const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const FATOR_NOME = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' } as const;
const LID_KEYS = Object.keys(LIDERANCA);
// tela3 usa "executor", mas a coluna é lid_executivo — mapa explícito.
const TELA3_KEY: Record<string, string> = { lid_executivo: 'executor', lid_motivador: 'motivador', lid_metodico: 'metodico', lid_sistematico: 'sistematico' };

/** "Alto (41-60)" / "Muito alto (61-80)" → {lo, hi}. Sem parse → faixa ampla. */
function parseFaixa(s: any): { lo: number; hi: number } {
  const m = String(s || '').match(/\(?\s*(\d{1,3})\s*[-–a]\s*(\d{1,3})\s*\)?/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  return { lo: 0, hi: 100 };
}
/** Faixa-alvo de um item = [min do limite inferior, max do limite superior]. */
function faixaDe(minStr: any, maxStr: any): { min: number; max: number } {
  const lo = parseFaixa(minStr).lo;
  const hi = parseFaixa(maxStr).hi;
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}
const classeDe = (pct: number): Classe => (pct >= 75 ? 'alta' : pct >= 50 ? 'razoavel' : 'baixa');
const sub = (atendidos: number, total: number): SubScore => {
  const pct = total > 0 ? r1((atendidos / total) * 100) : 0;
  return { atendidos, total, pct, classe: classeDe(pct) };
};

export async function aggregateAdequacao(sb: SupabaseClient, empresaId: string, cargo: string): Promise<AdequacaoCargo> {
  const base: AdequacaoCargo = { cargo, avaliados: 0, perfilIdeal: { caracteristicas: [], competencias: [], lideranca: [], estiloPredominante: '', disc: [] }, pessoas: [], semGabarito: false, semColaboradores: false };

  // 1) Gabarito (perfil ideal) do cargo.
  const { data: cargoRow } = await sb.from('cargos_empresa')
    .select('gabarito').eq('empresa_id', empresaId).eq('nome', cargo).limit(1).maybeSingle();
  const g = (cargoRow as any)?.gabarito;
  if (!g?.tela4) return { ...base, semGabarito: true };

  // Perfil ideal estruturado (p/ a página "Filtros e Mapeamento").
  const caracteristicas: CaracteristicaIdeal[] = (g.tela1?.caracteristicas || []).map((c: any) => ({ par: c.par || '', polo: c.polo_escolhido || '', intensidade: c.intensidade || '' }));
  const competenciasIdeal: CompetenciaIdeal[] = (g.tela2?.subcompetencias || []).map((c: any) => {
    const f = faixaDe(c.faixa_min, c.faixa_max);
    return { nome: c.nome || '', dimensao: c.dimensao || '', min: f.min, max: f.max, prioridade: c.prioridade || 'media' };
  });
  const liderancaIdeal = LID_KEYS.map((k) => ({ key: k, nome: (LIDERANCA as any)[k].nome, pct: num(g.tela3?.[TELA3_KEY[k]]) }));
  const discIdeal = (['D', 'I', 'S', 'C'] as const).map((f) => {
    const fx = faixaDe(g.tela4?.[f]?.min, g.tela4?.[f]?.max);
    return { fator: f, nome: FATOR_NOME[f], min: fx.min, max: fx.max };
  });
  const perfilIdeal: PerfilIdeal = { caracteristicas, competencias: competenciasIdeal, lideranca: liderancaIdeal, estiloPredominante: g.tela3?.estilo_predominante || '', disc: discIdeal };

  // 2) Colaboradores do cargo (com DISC mapeado).
  const cols = ['nome_completo', 'd_natural', 'i_natural', 's_natural', 'c_natural', ...LID_KEYS, ...COMP_LABEL.map((c) => c.key)].join(', ');
  const { data: rows } = await excludeInternalEmails(
    sb.from('colaboradores').select(cols).eq('empresa_id', empresaId).eq('cargo', cargo).not('d_natural', 'is', null),
  ).order('nome_completo');
  if (!rows?.length) return { ...base, perfilIdeal, semColaboradores: true };

  const compKeyDe = new Map(COMP_LABEL.map((c) => [norm(c.nome), c.key])); // nome → coluna comp_*
  const idealLidTotal = liderancaIdeal.reduce((s, x) => s + x.pct, 0) || 1;

  const pessoas: PessoaAdequacao[] = (rows as any[]).map((x) => {
    const m: DiscMedia = { d: num(x.d_natural), i: num(x.i_natural), s: num(x.s_natural), c: num(x.c_natural) };

    // DISC (4): score dentro da faixa ideal.
    const disc: DiscFator[] = discIdeal.map((d) => {
      const score = m[d.fator.toLowerCase() as keyof DiscMedia];
      return { fator: d.fator, score: Math.round(score), min: d.min, max: d.max, dentro: score >= d.min && score <= d.max };
    });
    const discScore = sub(disc.filter((d) => d.dentro).length, 4);

    // Competência (N do gabarito): comp_* dentro da faixa.
    let compOk = 0;
    for (const c of competenciasIdeal) {
      const key = compKeyDe.get(norm(c.nome));
      if (!key) continue;
      const v = num(x[key]);
      if (v >= c.min && v <= c.max) compOk++;
    }
    const competencia = sub(compOk, competenciasIdeal.length);

    // Mapeamento (N do gabarito): polo do colab (DISC) bate com o polo do cargo.
    const polos = destaquesBipolares(m); // {esquerda, direita, ladoEsquerdo}
    let mapOk = 0;
    for (const c of caracteristicas) {
      const polo = norm(c.polo);
      const par = polos.find((p) => norm(p.esquerda) === polo || norm(p.direita) === polo);
      if (!par) continue;
      const colabNoPolo = norm(par.esquerda) === polo ? par.ladoEsquerdo : !par.ladoEsquerdo;
      if (colabNoPolo) mapOk++;
    }
    const mapeamento = sub(mapOk, caracteristicas.length);

    // Liderança (4): estilo do colab não fica abaixo do ideal (tolerância 15pp).
    const lidColabTotal = LID_KEYS.reduce((s, k) => s + num(x[k]), 0) || 1;
    let lidOk = 0;
    for (const l of liderancaIdeal) {
      const colabPct = (num(x[l.key]) / lidColabTotal) * 100;
      const idealPct = (l.pct / idealLidTotal) * 100;
      if (colabPct >= idealPct - 15) lidOk++;
    }
    const lideranca = sub(lidOk, 4);

    // Beta: atendidos totais / itens totais (não média de %).
    const atend = mapeamento.atendidos + competencia.atendidos + lideranca.atendidos + discScore.atendidos;
    const total = mapeamento.total + competencia.total + lideranca.total + discScore.total;
    const beta = sub(atend, total);

    return { nome: x.nome_completo || 'Colaborador', disc, mapeamento, competencia, lideranca, discScore, beta };
  }).sort((a, b) => b.beta.pct - a.beta.pct);

  return { cargo, avaliados: pessoas.length, perfilIdeal, pessoas, semGabarito: false, semColaboradores: false };
}
