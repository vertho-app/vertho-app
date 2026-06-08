/**
 * Perfil Organizacional (DNA comportamental DISC) — agregação coletiva.
 *
 * Consolida o mapeamento DISC de todos os colaboradores de uma empresa:
 * perfil médio natural/adaptado, foco por fator, valores motivadores,
 * estilo de liderança, mapa de 16 competências, fatores altos/baixos,
 * distribuição de talentos (octógono) e destaques comportamentais.
 * Puro (sem IA, sem Next) — recebe um SupabaseClient. O PDF consome este output.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { derivarArquetipo } from '@/lib/disc-arquetipos';

export type Fator = 'D' | 'I' | 'S' | 'C';
export interface DiscMedia { d: number; i: number; s: number; c: number }

// Foco temático por fator (framing fixo da metodologia, espelha o exemplo).
export const FATOR_FOCO: Record<Fator, string> = {
  S: 'PREVISIBILIDADE', I: 'COMUNICAÇÃO', D: 'COOPERAÇÃO', C: 'INOVAÇÃO',
};
export const FATOR_NOME: Record<Fator, string> = {
  D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade',
};

const VALOR_LABEL: Record<string, { nome: string; motivacao: string }> = {
  val_teorico: { nome: 'Teórico', motivacao: 'Aprendizado Constante' },
  val_estetico: { nome: 'Estético', motivacao: 'Bem-estar e Qualidade de Vida' },
  val_social: { nome: 'Social', motivacao: 'Contribuir com o Coletivo' },
  val_politico: { nome: 'Político', motivacao: 'Reconhecimento e Destaque' },
  val_economico: { nome: 'Econômico', motivacao: 'Recompensa pelo Esforço Empreendido' },
  val_religioso: { nome: 'Religioso', motivacao: 'Conviver com Crenças e Opiniões Iguais' },
};

const COMP_LABEL: { key: string; nome: string; desc: string }[] = [
  { key: 'comp_ousadia', nome: 'Ousadia', desc: 'Ímpeto à ação em busca dos objetivos, encarando os acontecimentos como desafio.' },
  { key: 'comp_comando', nome: 'Comando', desc: 'Predisposição a assumir a liderança e o comando das situações.' },
  { key: 'comp_objetividade', nome: 'Objetividade', desc: 'Pessoas diretas que reagem rápido e decidem com foco.' },
  { key: 'comp_assertividade', nome: 'Assertividade', desc: 'Agir com exatidão, percebendo detalhes e variações do ambiente.' },
  { key: 'comp_persuasao', nome: 'Persuasão', desc: 'Capacidade de influenciar e persuadir a tomada de decisão.' },
  { key: 'comp_extroversao', nome: 'Extroversão', desc: 'Expansivo, comunicativo e sociável, com facilidade de socializar.' },
  { key: 'comp_entusiasmo', nome: 'Entusiasmo', desc: 'Energia e estilo animado, capaz de motivar outras pessoas.' },
  { key: 'comp_sociabilidade', nome: 'Sociabilidade', desc: 'Tendência à busca por relacionamento social, de forma extrovertida.' },
  { key: 'comp_empatia', nome: 'Empatia', desc: 'Compreender o sentimento da outra pessoa, imaginando-se nas mesmas circunstâncias.' },
  { key: 'comp_paciencia', nome: 'Paciência', desc: 'Esforço para manter calma e complacência diante do estresse.' },
  { key: 'comp_persistencia', nome: 'Persistência', desc: 'Facilidade de se concentrar e dar continuidade ao trabalho até o final.' },
  { key: 'comp_planejamento', nome: 'Planejamento', desc: 'Pessoas ponderadas que planejam suas ações e evitam agir por impulso.' },
  { key: 'comp_organizacao', nome: 'Organização', desc: 'Atenção minuciosa em busca da ordem de sistemas ou ambientes.' },
  { key: 'comp_detalhismo', nome: 'Detalhismo', desc: 'Exposição minuciosa de fatos, planos ou projetos, com atenção a detalhes.' },
  { key: 'comp_prudencia', nome: 'Prudência', desc: 'Nível de cautela para evitar erros e riscos desnecessários.' },
  { key: 'comp_concentracao', nome: 'Concentração', desc: 'Capacidade e necessidade de concentração para execução de um trabalho.' },
];

// 8 talentos do octógono, definidos pela assinatura de fatores DISC.
const TALENTOS: { nome: string; fatores: Fator[]; foco: string }[] = [
  { nome: 'Direção', fatores: ['D'], foco: 'Dominância' },
  { nome: 'Inspiração', fatores: ['D', 'I'], foco: 'Dominância e Influência' },
  { nome: 'Comunicação', fatores: ['I'], foco: 'Influência' },
  { nome: 'Relacionamento', fatores: ['I', 'S'], foco: 'Influência e Estabilidade' },
  { nome: 'Planejamento', fatores: ['S'], foco: 'Estabilidade' },
  { nome: 'Técnico', fatores: ['S', 'C'], foco: 'Estabilidade e Conformidade' },
  { nome: 'Análise', fatores: ['C'], foco: 'Conformidade' },
  { nome: 'Execução', fatores: ['C', 'D'], foco: 'Conformidade e Dominância' },
];

const LIDERANCA = {
  lid_executivo: { nome: 'Executivo', vinculo: 'Liderança com Resultado' },
  lid_motivador: { nome: 'Motivador', vinculo: 'Liderança com Inspiração' },
  lid_metodico: { nome: 'Metódico', vinculo: 'Liderança com Planejamento' },
  lid_sistematico: { nome: 'Sistemático', vinculo: 'Liderança com Estrutura' },
};

export interface ValorStat { key: string; nome: string; motivacao: string; media: number; classe: 'significativo' | 'circunstancial' | 'menor' }
export interface CompStat { key: string; nome: string; desc: string; natural: number; adaptado: number }
export interface TalentoStat { nome: string; foco: string; pct: number }
export interface FatorAltoBaixo { fator: Fator; nome: string; foco: string; pctAlto: number; pctBaixo: number; nAlto: number; nBaixo: number }
export interface PessoaDisc { numero: number; nome: string; perfil: string; arquetipo: string; natural: DiscMedia; adaptado: DiscMedia }
export interface DestaqueBipolar { esquerda: string; direita: string; ladoEsquerdo: boolean }
export interface LiderancaStat { nome: string; vinculo: string; pct: number; dist: { nome: string; pct: number }[] }

export interface PerfilOrg {
  avaliados: number;
  natural: DiscMedia;
  adaptado: DiscMedia;
  perfilDominante: string;
  arquetipo: { nome: string; desc: string };
  fatoresOrdem: { fator: Fator; nome: string; foco: string; media: number }[];
  valores: ValorStat[];
  lideranca: LiderancaStat;
  competencias: CompStat[];
  compMais: CompStat[];
  compMenos: CompStat[];
  temCompAdapt: boolean;
  fatoresAltoBaixo: FatorAltoBaixo[];
  talentos: TalentoStat[];
  destaques: DestaqueBipolar[];
  pessoas: PessoaDisc[];
  semDados: boolean;
}

const n = (v: any) => Number(v) || 0;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

function dominanteFromDisc(m: DiscMedia): string {
  const arr: [Fator, number][] = [['D', m.d], ['I', m.i], ['S', m.s], ['C', m.c]];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][0] + arr[1][0];
}

// destaques bipolares: cada par é decidido por uma métrica DISC do grupo médio.
function destaquesBipolares(m: DiscMedia): DestaqueBipolar[] {
  const pares: [string, string, boolean][] = [
    ['OTIMISTA', 'REALISTA', m.i >= m.c],
    ['COMUNICATIVO', 'ANALISTA', m.i >= m.c],
    ['GENERALISTA', 'DETALHISTA', m.d + m.i >= m.s + m.c],
    ['ESTILO AGRESSIVO', 'ESTILO CONSULTIVO', m.d >= m.s],
    ['MELHOR EM FALAR', 'MELHOR EM OUVIR', m.i >= m.s],
    ['AVERSO A ROTINA', 'ROTINEIRO', m.d + m.i >= m.s + m.c],
    ['DELEGA', 'CENTRALIZA', m.d >= m.c],
    ['COMPREENSIVO', 'IMPARCIAL', m.i + m.s >= m.d + m.c],
    ['CASUAL', 'FORMAL', m.i >= m.c],
    ['FOCO EM RELACIONAMENTOS', 'FOCO NAS TAREFAS', m.i + m.s >= m.d + m.c],
    ['ORIENTAÇÃO A RESULTADOS', 'ORIENTAÇÃO A PROCESSOS', m.d >= m.s],
    ['EMOCIONAL', 'RACIONAL', m.i + m.s >= m.d + m.c],
    ['DINÂMICO', 'ESTÁVEL', m.d + m.i >= m.s + m.c],
    ['AGE COM FIRMEZA', 'AGE COM CONSENTIMENTO', m.d >= m.s],
    ['COMANDANTE', 'CONCILIADOR', m.d >= m.s],
    ['ASSUME RISCOS', 'PRUDENTE', m.d >= m.c],
    ['OBJETIVO', 'SISTEMÁTICO', m.d >= m.c],
    ['CRIA DO ZERO', 'APRIMORA O QUE JÁ EXISTE', m.d + m.i >= m.s + m.c],
    ['MULTITAREFAS', 'ESPECIALISTA', m.i >= m.c],
    ['INSPIRADOR', 'TÉCNICO', m.i >= m.c],
    ['EXTROVERTIDO', 'INTROVERTIDO', m.i + m.s * 0.4 >= m.c + m.d * 0.4],
    ['OUSADO', 'CONSERVADOR', m.d >= m.c],
    ['AGE COM VELOCIDADE', 'AGE COM PLANEJAMENTO', m.d + m.i >= m.s + m.c],
    ['PRÁTICO', 'TEÓRICO', m.d >= m.c],
  ];
  return pares.map(([e, d, l]) => ({ esquerda: e, direita: d, ladoEsquerdo: l }));
}

export async function aggregatePerfilOrg(sb: SupabaseClient, empresaId: string): Promise<PerfilOrg> {
  const cols = [
    'nome_completo', 'perfil_dominante',
    'd_natural', 'i_natural', 's_natural', 'c_natural',
    'd_adaptado', 'i_adaptado', 's_adaptado', 'c_adaptado',
    ...Object.keys(VALOR_LABEL),
    ...Object.keys(LIDERANCA),
    ...COMP_LABEL.map((c) => c.key), ...COMP_LABEL.map((c) => c.key + '_adapt'),
  ].join(', ');
  const { data: rows } = await sb.from('colaboradores').select(cols)
    .eq('empresa_id', empresaId).not('d_natural', 'is', null).order('nome_completo');

  const empty: PerfilOrg = {
    avaliados: 0, natural: { d: 0, i: 0, s: 0, c: 0 }, adaptado: { d: 0, i: 0, s: 0, c: 0 },
    perfilDominante: '', arquetipo: { nome: '', desc: '' }, fatoresOrdem: [], valores: [],
    lideranca: { nome: '', vinculo: '', pct: 0, dist: [] }, competencias: [], compMais: [], compMenos: [], temCompAdapt: false,
    fatoresAltoBaixo: [], talentos: [], destaques: [], pessoas: [], semDados: true,
  };
  if (!rows || !rows.length) return empty;
  const R = rows as any[];

  const natural: DiscMedia = { d: r2(avg(R.map((x) => n(x.d_natural)))), i: r2(avg(R.map((x) => n(x.i_natural)))), s: r2(avg(R.map((x) => n(x.s_natural)))), c: r2(avg(R.map((x) => n(x.c_natural)))) };
  const adaptado: DiscMedia = { d: r2(avg(R.map((x) => n(x.d_adaptado)))), i: r2(avg(R.map((x) => n(x.i_adaptado)))), s: r2(avg(R.map((x) => n(x.s_adaptado)))), c: r2(avg(R.map((x) => n(x.c_adaptado)))) };
  const perfilDominante = dominanteFromDisc(natural);

  const fatoresOrdem = (['D', 'I', 'S', 'C'] as Fator[])
    .map((f) => ({ fator: f, nome: FATOR_NOME[f], foco: FATOR_FOCO[f], media: natural[f.toLowerCase() as keyof DiscMedia] }))
    .sort((a, b) => b.media - a.media);

  // valores
  const valoresRaw = Object.keys(VALOR_LABEL).map((k) => ({ key: k, ...VALOR_LABEL[k], media: r2(avg(R.map((x) => n(x[k])))) }))
    .filter((v) => v.media > 0).sort((a, b) => b.media - a.media);
  const valores: ValorStat[] = valoresRaw.map((v, idx) => ({ ...v, classe: idx < 2 ? 'significativo' : idx < 4 ? 'circunstancial' : 'menor' }));

  // liderança
  const lidMed = Object.keys(LIDERANCA).map((k) => ({ k, media: avg(R.map((x) => n((x as any)[k]))) }));
  const lidTotal = lidMed.reduce((s, x) => s + x.media, 0) || 1;
  const lidDist = lidMed.map((x) => ({ nome: (LIDERANCA as any)[x.k].nome, pct: r2((x.media / lidTotal) * 100) }));
  const lidTop = [...lidMed].sort((a, b) => b.media - a.media)[0];
  const lideranca: LiderancaStat = { nome: (LIDERANCA as any)[lidTop.k].nome, vinculo: (LIDERANCA as any)[lidTop.k].vinculo, pct: r2((lidTop.media / lidTotal) * 100), dist: lidDist };

  // competências (natural + adaptado)
  const competencias: CompStat[] = COMP_LABEL.map((c) => ({ key: c.key, nome: c.nome, desc: c.desc, natural: r2(avg(R.map((x) => n(x[c.key])))), adaptado: r2(avg(R.map((x) => n(x[c.key + '_adapt'])))) }));
  const byNat = [...competencias].sort((a, b) => b.natural - a.natural);
  const compMais = byNat.slice(0, 3);
  const compMenos = byNat.slice(-3).reverse();

  // fatores altos/baixos (natural > 50)
  const fatoresAltoBaixo: FatorAltoBaixo[] = (['D', 'I', 'S', 'C'] as Fator[]).map((f) => {
    const col = f.toLowerCase() + '_natural';
    const nAlto = R.filter((x) => n(x[col]) > 50).length;
    const nBaixo = R.length - nAlto;
    return { fator: f, nome: FATOR_NOME[f], foco: FATOR_FOCO[f], pctAlto: r2((nAlto / R.length) * 100), pctBaixo: r2((nBaixo / R.length) * 100), nAlto, nBaixo };
  });

  // talentos: cada pessoa conta nos talentos cujos fatores-assinatura estão "em evidência" (>50)
  const talentoCount: Record<string, number> = {};
  TALENTOS.forEach((t) => (talentoCount[t.nome] = 0));
  for (const x of R) {
    const m: DiscMedia = { d: n(x.d_natural), i: n(x.i_natural), s: n(x.s_natural), c: n(x.c_natural) };
    for (const t of TALENTOS) {
      const evidente = t.fatores.every((f) => m[f.toLowerCase() as keyof DiscMedia] > 50);
      if (evidente) talentoCount[t.nome]++;
    }
  }
  const talentos: TalentoStat[] = TALENTOS.map((t) => ({ nome: t.nome, foco: t.foco, pct: r2((talentoCount[t.nome] / R.length) * 100) })).sort((a, b) => b.pct - a.pct);

  // pessoas (anonimizável; numeradas na ordem alfabética)
  const pessoas: PessoaDisc[] = R.map((x, idx) => {
    const nat: DiscMedia = { d: n(x.d_natural), i: n(x.i_natural), s: n(x.s_natural), c: n(x.c_natural) };
    const adp: DiscMedia = { d: n(x.d_adaptado), i: n(x.i_adaptado), s: n(x.s_adaptado), c: n(x.c_adaptado) };
    const perfil = x.perfil_dominante || dominanteFromDisc(nat);
    return { numero: idx + 1, nome: x.nome_completo || `Colaborador ${idx + 1}`, perfil, arquetipo: derivarArquetipo(perfil).nome, natural: nat, adaptado: adp };
  });

  return {
    avaliados: R.length, natural, adaptado, perfilDominante, arquetipo: derivarArquetipo(perfilDominante),
    fatoresOrdem, valores, lideranca, competencias, compMais, compMenos,
    temCompAdapt: competencias.some((c) => c.adaptado > 0),
    fatoresAltoBaixo, talentos,
    destaques: destaquesBipolares(natural), pessoas, semDados: false,
  };
}
