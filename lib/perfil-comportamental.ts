/**
 * Helper unificado pra formatar perfil comportamental em prompts IA.
 *
 * Empresas com fonte externa (OPQ32, Hogan, etc.) configurada em
 * sys_config.perfil_externo_fonte usam o JSON estruturado salvo em
 * colaboradores.perfil_externo_dados em vez do DISC nativo.
 *
 * Quando NÃO há fonte externa, usa o DISC clássico (perfil_dominante +
 * d_natural/i_natural/s_natural/c_natural). Esse helper centraliza a
 * lógica pra que prompts (fase3, fase5, cenario-b, evolucao-granular,
 * etc.) não precisem fazer if/else espalhado.
 *
 * Os campos esperados em `colab` são select de:
 *   nome_completo, cargo,
 *   perfil_dominante, d_natural, i_natural, s_natural, c_natural,
 *   perfil_externo_fonte, perfil_externo_dados
 *
 * Quando algum desses não existe (ex: actions antigas), o helper degrada
 * graciosamente.
 */

export type ColabPerfil = {
  nome_completo?: string;
  cargo?: string | null;
  perfil_dominante?: string | null;
  d_natural?: number | null;
  i_natural?: number | null;
  s_natural?: number | null;
  c_natural?: number | null;
  perfil_externo_fonte?: string | null;
  perfil_externo_dados?: any;
};

/**
 * Retorna bloco de texto pronto pra injetar em prompts.
 * Sempre uma única linha (ou poucas linhas), foco em informação útil
 * pro modelo adaptar tom/exemplos.
 */
export function formatPerfilContext(colab: ColabPerfil): string {
  if (!colab) return 'Perfil comportamental: dado não disponível.';

  // 1) Fonte externa (OPQ32 etc.) — usa apenas se houver dados extraídos
  if (colab.perfil_externo_fonte === 'opq32' && colab.perfil_externo_dados) {
    const d = colab.perfil_externo_dados;
    const altas = (d?.resumo?.altas || []).slice(0, 5)
      .map((a: any) => `${a.nome} (sten ${a.sten})`)
      .join(', ');
    const baixas = (d?.resumo?.baixas || []).slice(0, 5)
      .map((b: any) => `${b.nome} (sten ${b.sten})`)
      .join(', ');
    const partes: string[] = ['Perfil OPQ32 (SHL):'];
    if (altas) partes.push(`escalas ALTAS — ${altas}`);
    if (baixas) partes.push(`escalas BAIXAS — ${baixas}`);
    if (partes.length === 1) {
      return 'Perfil OPQ32 (SHL): dado disponível mas sem destaques de altas/baixas.';
    }
    return partes.join('; ') + '.';
  }

  // 2) DISC nativo
  if (colab.perfil_dominante) {
    const d = colab.d_natural ?? 0;
    const i = colab.i_natural ?? 0;
    const s = colab.s_natural ?? 0;
    const c = colab.c_natural ?? 0;
    return `Perfil DISC: ${colab.perfil_dominante} (D=${d} I=${i} S=${s} C=${c}).`;
  }

  return 'Perfil comportamental: não mapeado.';
}

/**
 * Versão curta — só letra DISC ou top 1 escala OPQ32. Útil em logs/UI.
 */
export function formatPerfilCurto(colab: ColabPerfil): string {
  if (colab?.perfil_externo_fonte === 'opq32' && colab.perfil_externo_dados) {
    const top = colab.perfil_externo_dados?.resumo?.altas?.[0];
    return top ? `OPQ32 · ${top.nome} ${top.sten}` : 'OPQ32 · sem destaque';
  }
  if (colab?.perfil_dominante) return `DISC ${colab.perfil_dominante}`;
  return '—';
}

/**
 * Lista de colunas que actions devem incluir no SELECT pra usar este helper.
 * Útil pra evitar esquecer de incluir os campos novos.
 */
export const PERFIL_SELECT_COLS = [
  'perfil_dominante', 'd_natural', 'i_natural', 's_natural', 'c_natural',
  'perfil_externo_fonte', 'perfil_externo_dados',
].join(', ');
