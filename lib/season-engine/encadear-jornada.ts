/**
 * Encadeamento das jornadas (05/08/2026).
 *
 * O DUO deixou de ser "duas competências em paralelo por 14 semanas" e passou a
 * ser DUAS JORNADAS EM SEQUÊNCIA: 7 semanas na competência A (6 de conteúdo +
 * avaliação), fechamento completo — Cenário B, arguição, Evolution Report,
 * certificado — e só então 7 semanas na competência B.
 *
 * Cada jornada é uma TRILHA própria (`numero_temporada` 1 e 2, mig 199). Isso é
 * o que dá dois fechamentos independentes: o relatório da primeira não é
 * reescrito quando a segunda termina, e a pessoa fica com dois documentos.
 *
 * Quem chama: o fechamento, depois de marcar a trilha como concluída
 * (`evolution-report-core`). Best-effort — se a geração falhar, a jornada
 * concluída CONTINUA concluída e a degradação fica registrada; a próxima pode
 * ser gerada pelo admin, pelo caminho normal.
 */
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { getProgramaConfigDaTrilha } from './programa-config';

export interface ResultadoEncadeamento {
  /** false quando não havia o que encadear — não é erro. */
  encadeou: boolean;
  motivo?: 'modo-nao-encadeia' | 'sem-proxima-competencia' | 'falhou';
  competencia?: string;
  trilhaId?: string;
  numeroTemporada?: number;
}

/**
 * Competências do cargo, na ordem de prioridade em que devem ser percorridas.
 * `competencias_foco` (array, mig 091) é a fonte; `competencia_foco` é o
 * fallback de compatibilidade para cargos que só têm a âncora.
 */
function competenciasDoCargo(cargo: { competencias_foco?: string[] | null; competencia_foco?: string | null } | null): string[] {
  if (!cargo) return [];
  const lista = Array.isArray(cargo.competencias_foco) ? cargo.competencias_foco.filter(Boolean) : [];
  if (lista.length) return lista;
  return cargo.competencia_foco ? [cargo.competencia_foco] : [];
}

/**
 * Decide qual é a próxima competência: a primeira do cargo que a pessoa ainda
 * não percorreu. Comparação por texto normalizado porque `competencia_foco` é
 * texto livre gravado em dois lugares (cargo e trilha) — diferença de caixa ou
 * espaço faria a mesma competência ser servida duas vezes.
 */
export function proximaCompetencia(doCargo: string[], jaFeitas: string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const feitas = new Set(jaFeitas.filter(Boolean).map(norm));
  return doCargo.find((c) => !feitas.has(norm(c))) ?? null;
}

/**
 * @param gerar injeção do gerador (`gerarTemporadaCoreHeadless`) — evita ciclo
 *        de import com `trilha-core`, que importa este módulo indiretamente.
 */
export async function encadearProximaJornada(
  sbRaw: any,
  tdb: any,
  trilhaId: string,
  gerar: (args: { colaboradorId: string; competencia: string; novaJornada: boolean; empresaIdEsperado?: string }) => Promise<any>,
): Promise<ResultadoEncadeamento> {
  const { data: trilha } = await tdb.from('trilhas')
    .select('id, colaborador_id, empresa_id, programa_modo, competencia_foco, numero_temporada')
    .eq('id', trilhaId).maybeSingle();
  if (!trilha) return { encadeou: false, motivo: 'falhou' };

  // Só a jornada encadeia. Nos modos de 14 semanas, concluir é o fim do ciclo.
  const config = getProgramaConfigDaTrilha(trilha);
  if (trilha.programa_modo !== 'jornada' || config.semanas !== 7) {
    return { encadeou: false, motivo: 'modo-nao-encadeia' };
  }

  // `.eq('empresa_id', ...)` na MESMA cadeia: o app roda service-role, que
  // bypassa RLS — sem o filtro, um colaborador_id de outro tenant devolveria a
  // pessoa errada e a jornada seguinte nasceria no cargo dela. O empresa_id vem
  // da trilha que acabou de fechar, não do input.
  const { data: colab } = await sbRaw.from('colaboradores')
    .select('id, cargo, empresa_id')
    .eq('id', trilha.colaborador_id)
    .eq('empresa_id', trilha.empresa_id)
    .maybeSingle();
  if (!colab) return { encadeou: false, motivo: 'falhou' };

  const { data: cargo } = await tdb.from('cargos_empresa')
    .select('competencia_foco, competencias_foco').eq('nome', colab.cargo || '').maybeSingle();

  // TODAS as trilhas da pessoa — inclusive as de outros modos: se ela já
  // trabalhou a competência num formato antigo, repetir seria entregar o mesmo
  // conteúdo com outro rótulo.
  const { data: anteriores } = await tdb.from('trilhas')
    .select('competencia_foco').eq('colaborador_id', trilha.colaborador_id);

  const proxima = proximaCompetencia(
    competenciasDoCargo(cargo),
    (anteriores || []).map((t: any) => t?.competencia_foco).filter(Boolean),
  );
  if (!proxima) return { encadeou: false, motivo: 'sem-proxima-competencia' };

  try {
    const r = await gerar({
      colaboradorId: trilha.colaborador_id,
      competencia: proxima,
      novaJornada: true,
      empresaIdEsperado: trilha.empresa_id,
    });
    if (r?.error) throw new Error(r.error);
    return {
      encadeou: true,
      competencia: proxima,
      trilhaId: r?.trilhaId,
      numeroTemporada: (trilha.numero_temporada || 1) + 1,
    };
  } catch (e: any) {
    // A jornada concluída SEGUE concluída — o encadeamento é um extra que
    // falhou, não um passo que desfaz o fechamento. Fica registrado para o
    // health e para o admin gerar pelo caminho normal.
    await registrarDegradacao({
      fluxo: 'build',
      tipo: DEGRADACAO.JORNADA_ENCADEAMENTO_FALHOU,
      chave: `${trilha.colaborador_id}:${(trilha.numero_temporada || 1) + 1}`,
      empresaId: trilha.empresa_id,
      detalhe: { competencia: proxima, erro: e?.message || String(e) },
    });
    return { encadeou: false, motivo: 'falhou', competencia: proxima };
  }
}
