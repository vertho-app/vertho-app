import type { KnowledgeChunk } from './contracts';

const STOP = new Set('para como onde qual quais esse essa esta este aqui isso uma uns das dos que por com nao meu minha tem algo pode pelo pela sao voce'.split(' '));
export function searchTerms(text: string): string[] {
  const words = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP.has(t));
  return [...new Set(words.map(word => word === 'perfis' ? 'perfil' : word.replace(/ais$/, 'al').replace(/oes$/, 'ao').replace(/ores$/, 'or').replace(/s$/, '')))];
}

/** Busca local: não executa código nem aceita caminhos para ler no disco. */
export function searchKnowledge(chunks: KnowledgeChunk[], query: string, pathname: string): KnowledgeChunk[] {
  const terms = searchTerms(query);
  const ranked = chunks.map(chunk => {
    const body = searchTerms(chunk.text).join(' ');
    const title = searchTerms(`${chunk.title} ${chunk.reference}`).join(' ');
    const coverage = terms.filter(term => body.includes(term) || title.includes(term));
    let score = coverage.reduce((sum, term) => sum + (title.includes(term) ? 4 : 1), 0);
    if (coverage.length > 1) score += coverage.length * 2;
    if (title.includes('externo') && !terms.includes('externo')) score -= 5;
    const route = chunk.route?.replace(/\[[^\]]+\]/g, '[id]');
    const current = pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[id]');
    if (route === current) score += 4;
    return { chunk, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  // Garante espaço para as duas fontes e limita repetição do mesmo arquivo.
  const result: KnowledgeChunk[] = [];
  for (const kind of ['manual', 'codigo'] as const) {
    const counts = new Map<string, number>();
    for (const item of ranked.filter(item => item.chunk.kind === kind)) {
      const file = item.chunk.reference.replace(/:\d+(?:-\d+)?$/, '');
      if ((counts.get(file) || 0) >= 2) continue;
      result.push(item.chunk);
      counts.set(file, (counts.get(file) || 0) + 1);
      if (result.filter(c => c.kind === kind).length >= 4) break;
    }
  }
  return result;
}
