import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { searchKnowledge } from './search';
import { BLOCOS_OFFLINE } from '@/lib/blocos-offline';
import { safeIpiHref, type KnowledgeIndex, type IpiEvidence } from './contracts';

let cached: Promise<KnowledgeIndex> | undefined;
function onlineHref(route: string | undefined, empresaId: string | null) {
  if (route && Object.keys(BLOCOS_OFFLINE).some(key => route.split('/').includes(key))) return;
  return safeIpiHref(route, empresaId);
}
export async function retrieveIpiKnowledge(query: string, pathname: string, empresaId: string | null): Promise<IpiEvidence[]> {
  cached ??= readFile(path.join(process.cwd(), '.ipi/knowledge.json'), 'utf8').then(JSON.parse).catch(error => { cached = undefined; throw error; });
  const index = await cached;
  return searchKnowledge(index.chunks, query, pathname).map((chunk, i) => ({
    id: `F${i + 1}`, kind: chunk.kind, title: chunk.title, reference: chunk.reference,
    href: onlineHref(chunk.route, empresaId), text: chunk.text,
  }));
}
