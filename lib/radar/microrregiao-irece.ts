/**
 * Microrregião de Irecê (Bahia) — escopo do piloto V1 do Radar.
 *
 * 19 municípios da microrregião oficial 29009 (IBGE). Lista validada
 * contra a API oficial em 2026-04-28:
 *   https://servicodados.ibge.gov.br/api/v1/localidades/microrregioes/29009/municipios
 *
 * Códigos IBGE (7 dígitos) e nomes oficiais.
 */
export const MICRORREGIAO_IRECE_BA = {
  uf: 'BA',
  nome: 'Irecê',
  municipios: [
    { ibge: '2901155', nome: 'América Dourada' },
    { ibge: '2903003', nome: 'Barra do Mendes' },
    { ibge: '2903235', nome: 'Barro Alto' },
    { ibge: '2905305', nome: 'Cafarnaum' },
    { ibge: '2906204', nome: 'Canarana' },
    { ibge: '2907608', nome: 'Central' },
    { ibge: '2911303', nome: 'Gentio do Ouro' },
    { ibge: '2912400', nome: 'Ibipeba' },
    { ibge: '2913101', nome: 'Ibititá' },
    { ibge: '2914406', nome: 'Iraquara' },
    { ibge: '2914604', nome: 'Irecê' },
    { ibge: '2918357', nome: 'João Dourado' },
    { ibge: '2918506', nome: 'Jussara' },
    { ibge: '2919157', nome: 'Lapão' },
    { ibge: '2922052', nome: 'Mulungu do Morro' },
    { ibge: '2925600', nome: 'Presidente Dutra' },
    { ibge: '2929255', nome: 'São Gabriel' },
    { ibge: '2930808', nome: 'Souto Soares' },
    { ibge: '2932408', nome: 'Uibaí' },
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

/** Normaliza nome de município pra comparação (uppercase + sem acentos + trim) */
function normalizarNome(nome: string): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

const IRECE_NORM_LOOKUP: Map<string, string> = new Map(
  MICRORREGIAO_IRECE_BA.municipios.map((m) => [normalizarNome(m.nome), m.ibge]),
);

/**
 * Lookup: nome do município + UF → código IBGE 7 dígitos.
 * Cobre os 20 municípios da microrregião de Irecê. Aceita variações
 * comuns (uppercase/lowercase, com/sem acento). Retorna null se UF != BA
 * ou município não está em Irecê.
 */
export function lookupIbgeIrece(municipio: string, uf?: string): string | null {
  if (uf && uf.toUpperCase().trim() !== 'BA') return null;
  const norm = normalizarNome(municipio);
  return IRECE_NORM_LOOKUP.get(norm) || null;
}
