/**
 * Microrregião de Irecê (Bahia) — escopo do piloto V1 do Radar.
 *
 * 20 municípios oficialmente classificados pelo IBGE como pertencentes
 * à microrregião de Irecê (recorte histórico, ainda usado como referência
 * pela secretaria estadual da Bahia em diagnósticos educacionais).
 *
 * Códigos IBGE (7 dígitos) e nomes oficiais.
 */
export const MICRORREGIAO_IRECE_BA = {
  uf: 'BA',
  nome: 'Irecê',
  municipios: [
    { ibge: '2900801', nome: 'América Dourada' },
    { ibge: '2902708', nome: 'Barro Alto' },
    { ibge: '2902906', nome: 'Barra do Mendes' },
    { ibge: '2904902', nome: 'Cafarnaum' },
    { ibge: '2906105', nome: 'Canarana' },
    { ibge: '2907400', nome: 'Central' },
    { ibge: '2912012', nome: 'Gentio do Ouro' },
    { ibge: '2913101', nome: 'Ibipeba' },
    { ibge: '2913200', nome: 'Ibititá' },
    { ibge: '2914604', nome: 'Ipupiara' },
    { ibge: '2915205', nome: 'Irecê' },
    { ibge: '2915809', nome: 'Itaguaçu da Bahia' },
    { ibge: '2917509', nome: 'João Dourado' },
    { ibge: '2918506', nome: 'Jussara' },
    { ibge: '2919405', nome: 'Lapão' },
    { ibge: '2921005', nome: 'Mulungu do Morro' },
    { ibge: '2925006', nome: 'Presidente Dutra' },
    { ibge: '2929206', nome: 'São Gabriel' },
    { ibge: '2933000', nome: 'Uibaí' },
    { ibge: '2933505', nome: 'Xique-Xique' },
  ],
} as const;

export const IRECE_IBGE_SET = new Set<string>(
  MICRORREGIAO_IRECE_BA.municipios.map((m) => m.ibge),
);

export function isIreceMunicipio(ibge: string): boolean {
  return IRECE_IBGE_SET.has(ibge);
}

export function nomeMunicipioIrece(ibge: string): string | null {
  const m = MICRORREGIAO_IRECE_BA.municipios.find((x) => x.ibge === ibge);
  return m ? m.nome : null;
}
