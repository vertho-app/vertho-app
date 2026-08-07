export type MunicipioIdebSourceRow = {
  ano: number;
  etapa: '5_EF' | '9_EF' | '3_EM' | string;
  codigo_inep: string | null;
  ideb: number | null;
  indicador_rendimento: number | null;
  nota_saeb: number | null;
};

export type MunicipioIdebAggregate = {
  ano: number;
  etapa: '5_EF' | '9_EF' | '3_EM' | string;
  idebAvg: number | null;
  rendimentoAvg: number | null;
  notaSaebAvg: number | null;
  totalEscolas: number;
};

type GrupoIdeb = {
  ano: number;
  etapa: string;
  escolas: Set<string>;
  idebSum: number;
  idebCount: number;
  rendSum: number;
  rendCount: number;
  notaSum: number;
  notaCount: number;
  oficial: MunicipioIdebSourceRow | null;
};

function criarGrupo(row: MunicipioIdebSourceRow): GrupoIdeb {
  return {
    ano: row.ano,
    etapa: row.etapa,
    escolas: new Set<string>(),
    idebSum: 0,
    idebCount: 0,
    rendSum: 0,
    rendCount: 0,
    notaSum: 0,
    notaCount: 0,
    oficial: null,
  };
}

/**
 * Combina o resultado oficial agregado do município com a cobertura escolar.
 *
 * O Ideb municipal NÃO é a média simples dos Idebs das escolas. Quando a linha
 * oficial existe, seus componentes são autoritativos; as linhas escolares só
 * informam quantas escolas publicaram resultado. A média escolar é mantida
 * apenas como fallback para ciclos ainda não carregados no escopo município.
 */
export function agregarIdebMunicipio(
  linhasEscola: MunicipioIdebSourceRow[],
  linhasOficiais: MunicipioIdebSourceRow[],
): MunicipioIdebAggregate[] {
  const grupos = new Map<string, GrupoIdeb>();
  const grupoDe = (row: MunicipioIdebSourceRow) => {
    const key = `${row.etapa}:${row.ano}`;
    if (!grupos.has(key)) grupos.set(key, criarGrupo(row));
    return grupos.get(key)!;
  };

  for (const row of linhasEscola) {
    const grupo = grupoDe(row);
    if (row.codigo_inep) grupo.escolas.add(row.codigo_inep);
    if (row.ideb != null) {
      grupo.idebSum += Number(row.ideb);
      grupo.idebCount++;
    }
    if (row.indicador_rendimento != null) {
      grupo.rendSum += Number(row.indicador_rendimento);
      grupo.rendCount++;
    }
    if (row.nota_saeb != null) {
      grupo.notaSum += Number(row.nota_saeb);
      grupo.notaCount++;
    }
  }

  for (const row of linhasOficiais) grupoDe(row).oficial = row;

  return Array.from(grupos.values())
    .map((grupo) => ({
      ano: grupo.ano,
      etapa: grupo.etapa,
      idebAvg: grupo.oficial
        ? grupo.oficial.ideb
        : grupo.idebCount > 0 ? grupo.idebSum / grupo.idebCount : null,
      rendimentoAvg: grupo.oficial
        ? grupo.oficial.indicador_rendimento
        : grupo.rendCount > 0 ? grupo.rendSum / grupo.rendCount : null,
      notaSaebAvg: grupo.oficial
        ? grupo.oficial.nota_saeb
        : grupo.notaCount > 0 ? grupo.notaSum / grupo.notaCount : null,
      totalEscolas: grupo.escolas.size,
    }))
    .sort((a, b) => a.etapa.localeCompare(b.etapa) || b.ano - a.ano);
}
