/**
 * Navegação local do Estúdio de Conteúdo.
 *
 * Fica FORA de `actions.ts` porque aquele arquivo é `'use server'`, e ali todo
 * export tem de ser função async — exportar este array de lá quebra o build
 * ("A 'use server' file can only export async functions").
 */
export type Aba = { chave: string; rotulo: string; sub: string };

export const ABAS: Aba[] = [
  { chave: 'biblioteca', rotulo: 'Biblioteca', sub: 'Módulos-base e micro-conteúdos' },
  { chave: 'producao', rotulo: 'Produção', sub: 'Extrações, jobs e erros' },
  { chave: 'kits', rotulo: 'Kits e cobertura', sub: 'Kit semanal por DISC' },
  { chave: 'fontes', rotulo: 'Fontes', sub: 'Knowledge base por cliente' },
  { chave: 'desempenho', rotulo: 'Desempenho', sub: 'Vídeos e consumo' },
];
