/**
 * Navegação local do Estúdio de Conteúdo.
 *
 * Fica FORA de `actions.ts` porque aquele arquivo é `'use server'`, e ali todo
 * export tem de ser função async — exportar este array de lá quebra o build
 * ("A 'use server' file can only export async functions").
 */
export type Aba = { chave: string; rotulo: string; sub: string };

export const ABAS: Aba[] = [
  { chave: 'demandas', rotulo: 'Demandas', sub: 'Lacunas que pedem conteúdo' },
  { chave: 'producao', rotulo: 'Produção', sub: 'Extrações, kits e render' },
  { chave: 'revisao', rotulo: 'Revisão', sub: 'Qualidade antes de publicar' },
  { chave: 'publicado', rotulo: 'Publicado', sub: 'Acervo disponível na jornada' },
  { chave: 'cobertura', rotulo: 'Cobertura', sub: 'Busca, entrega e desempenho' },
];
