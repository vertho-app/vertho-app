import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Cálculos derivados das 5 condicionalidades VAAR a partir dos dados que
 * já temos no banco (sem depender só do FNDE oficial).
 *
 * Cond II (participação ≥ 80% Saeb): CALCULÁVEL — usa diag_saeb_snapshots
 * Cond III (redução desigualdades raça/NSE): NÃO CALCULÁVEL — precisa microdados aluno-nível
 * Cond I, IV, V: aferição via SIMEC/CIF, não calculável dos nossos dados
 *
 * Útil pra mostrar transparência ao gestor — comparar dado oficial FNDE
 * com agregação direta dos snapshots Saeb importados.
 */

export type CondIIDerivado = {
  ano: number;
  etapas: Array<{
    etapa: '5_EF' | '9_EF' | '3_EM' | string;
    presentes: number;
    matriculados: number;
    taxa: number; // pct
    escolas: number;
    atende: boolean; // taxa >= 80
  }>;
  todasAtendem: boolean;
  algumaSemDado: boolean;
};

const ULTIMO_ANO_SAEB = 2023;

/**
 * Calcula cond_ii (participação Saeb >= 80%) derivado dos snapshots.
 *
 * - Para município, agrega presentes/matriculados das escolas da rede
 *   municipal (foco do FUNDEB municipal).
 * - Por etapa (5_EF, 9_EF) — 3_EM fica fora porque é responsabilidade
 *   estadual, não da rede municipal.
 */
export async function calcularCondIIDerivadoMunicipio(
  ibge: string,
  ano: number = ULTIMO_ANO_SAEB,
): Promise<CondIIDerivado | null> {
  const sb = createSupabaseAdmin();

  // 1. Pega INEP das escolas municipais
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep')
    .eq('municipio_ibge', ibge)
    .eq('rede', 'MUNICIPAL');

  const inepCodes = (escolas || []).map((e: any) => e.codigo_inep);
  if (inepCodes.length === 0) return null;

  // 2. Snapshots Saeb do ano (LP é suficiente — taxa de presença é por aluno, não disciplina)
  const { data: snaps } = await sb
    .from('diag_saeb_snapshots')
    .select('codigo_inep, etapa, disciplina, presentes, matriculados')
    .in('codigo_inep', inepCodes)
    .eq('ano', ano)
    .eq('disciplina', 'LP');

  if (!snaps || snaps.length === 0) return null;

  // 3. Agrega por etapa
  const byEtapa = new Map<string, { presentes: number; matriculados: number; escolas: Set<string> }>();
  for (const s of snaps as any[]) {
    if (s.presentes == null || s.matriculados == null) continue;
    if (!byEtapa.has(s.etapa)) byEtapa.set(s.etapa, { presentes: 0, matriculados: 0, escolas: new Set() });
    const acc = byEtapa.get(s.etapa)!;
    acc.presentes += Number(s.presentes) || 0;
    acc.matriculados += Number(s.matriculados) || 0;
    acc.escolas.add(s.codigo_inep);
  }

  const etapas = Array.from(byEtapa.entries()).map(([etapa, agg]) => {
    const taxa = agg.matriculados > 0 ? (agg.presentes / agg.matriculados) * 100 : 0;
    return {
      etapa,
      presentes: agg.presentes,
      matriculados: agg.matriculados,
      taxa: Math.round(taxa * 10) / 10,
      escolas: agg.escolas.size,
      atende: taxa >= 80,
    };
  }).sort((a, b) => a.etapa.localeCompare(b.etapa));

  if (etapas.length === 0) return null;

  return {
    ano,
    etapas,
    todasAtendem: etapas.every((e) => e.atende),
    algumaSemDado: etapas.some((e) => e.matriculados === 0),
  };
}

/**
 * Mapa estático de UFs com lei estadual do ICMS Educacional aprovada
 * (status público em mar/2026). Pra cond_iv visualizar mesmo em municípios
 * fora do dataset FNDE.
 *
 * Fonte: levantamento legislativo + Resolução CIF 15/2025.
 * Atualizar manualmente quando houver nova lei estadual.
 */
export const ICMS_EDUCACIONAL_POR_UF: Record<string, { temLei: boolean; lei?: string; observacao?: string }> = {
  AC: { temLei: true,  lei: 'Lei 4.038/2022' },
  AL: { temLei: true,  lei: 'Lei 7.776/2015 e atualizações' },
  AM: { temLei: true,  lei: 'Lei Complementar 256/2022' },
  AP: { temLei: true,  lei: 'Lei 1.789/2014' },
  BA: { temLei: true,  lei: 'Lei 7.529/1999, atualizada' },
  CE: { temLei: true,  lei: 'Lei 14.023/2007 (referência nacional)' },
  DF: { temLei: false, observacao: 'DF não é abrangido pelo ICMS Educacional municipal' },
  ES: { temLei: true,  lei: 'Lei Complementar 1.022/2022' },
  GO: { temLei: true,  lei: 'Lei 14.383/2003' },
  MA: { temLei: true,  lei: 'Lei 11.034/2019' },
  MG: { temLei: true,  lei: 'Lei 18.030/2009 (Lei Robin Hood)' },
  MS: { temLei: true,  lei: 'Lei 4.969/2017' },
  MT: { temLei: true,  lei: 'Lei 7.263/2000' },
  PA: { temLei: true,  lei: 'Lei 7.638/2012' },
  PB: { temLei: true,  lei: 'Lei 10.489/2015' },
  PE: { temLei: true,  lei: 'Lei 10.489/1990 e atualizações' },
  PI: { temLei: true,  lei: 'Lei 5.001/1998' },
  PR: { temLei: true,  lei: 'Lei Complementar 9/1992 atualizada' },
  RJ: { temLei: true,  lei: 'Lei 5.100/2007' },
  RN: { temLei: true,  lei: 'Lei 10.685/2020' },
  RO: { temLei: true,  lei: 'Lei Complementar 842/2015' },
  RR: { temLei: false, observacao: 'Aprovação em tramitação' },
  RS: { temLei: true,  lei: 'Lei 11.038/1997' },
  SC: { temLei: true,  lei: 'Lei 17.762/2019' },
  SE: { temLei: true,  lei: 'Lei 8.207/2017' },
  SP: { temLei: true,  lei: 'Lei 17.554/2022 e Decreto 67.292/2022' },
  TO: { temLei: true,  lei: 'Lei 1.844/2007' },
};

export function getStatusICMSEducacional(uf: string) {
  return ICMS_EDUCACIONAL_POR_UF[uf?.toUpperCase()] || null;
}
