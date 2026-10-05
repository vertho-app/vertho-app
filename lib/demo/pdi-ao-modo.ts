/**
 * Ajuste do PDI congelado ao modo de programa do ambiente demo.
 *
 * Mora fora de `reset-acme-demo.ts` porque o reset importa `next/headers` e o
 * cliente do banco: quem só precisa DESTAS duas funções (o pacote offline, que é
 * montado sem rede nem credencial) não pode arrastar o reset inteiro. O reset
 * reexporta os dois nomes, então os chamadores antigos não mudam.
 */
import { getProgramaConfigByModo } from '@/lib/season-engine/programa-config';

/**
 * Ajusta o conteúdo do PDI à mesma régua temporal da trilha. Além do total da
 * capa, compacta o mapa do blueprint, que alimenta a timeline interna do PDF.
 */
export function adaptarPdiFixtureAoModo(conteudo: any, programaModo?: string | null): any {
  if (!conteudo || programaModo !== 'jornada') return conteudo;

  const config = getProgramaConfigByModo('jornada');
  const mapa = conteudo.trilha_mapa;
  let semanasMapa = Array.isArray(mapa?.semanas) ? mapa.semanas : [];

  if (semanasMapa.length && (
    semanasMapa.length !== config.semanas
    || semanasMapa.some((semana: any) => Number(semana?.semana) > config.semanas)
  )) {
    const conteudos = semanasMapa
      .filter((semana: any) => semana?.tipo === 'conteudo')
      .slice(0, config.slotsConteudo.length)
      .map((semana: any, indice: number) => ({ ...semana, semana: config.slotsConteudo[indice] }));
    const avaliacao = [...semanasMapa]
      .reverse()
      .find((semana: any) => semana?.tipo === 'avaliacao');

    if (conteudos.length !== config.slotsConteudo.length || !avaliacao) {
      throw new Error(
        `mapa de PDI inválido para jornada: esperava ${config.slotsConteudo.length} conteúdos e uma avaliação; `
        + `encontrou ${conteudos.length} conteúdos e ${avaliacao ? 1 : 0} avaliação`,
      );
    }
    semanasMapa = [...conteudos, { ...avaliacao, semana: config.semanaCenarioB }];
  }

  return {
    ...conteudo,
    total_semanas: config.semanas,
    programa_modo: 'jornada',
    ...(mapa ? {
      trilha_mapa: {
        ...mapa,
        duracao_semanas: config.semanas,
        semanas: semanasMapa,
      },
    } : {}),
  };
}

/** PDFs antigos não podem sobreviver quando o conteúdo temporal do PDI muda. */
export function pdiDemoCompativelComModo(conteudo: any, programaModo?: string | null): boolean {
  if (programaModo !== 'jornada') return true;
  const config = getProgramaConfigByModo('jornada');
  if (conteudo?.programa_modo !== 'jornada' || Number(conteudo?.total_semanas) !== config.semanas) return false;
  const mapa = conteudo?.trilha_mapa;
  if (!mapa) return true;
  if (Number(mapa.duracao_semanas) !== config.semanas || !Array.isArray(mapa.semanas)) return false;
  return mapa.semanas.length === config.semanas
    && mapa.semanas.every((semana: any) => Number(semana?.semana) >= 1 && Number(semana?.semana) <= config.semanas);
}
