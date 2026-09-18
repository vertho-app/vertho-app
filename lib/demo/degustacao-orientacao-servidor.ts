import 'server-only';

import { tenantDb } from '@/lib/tenant-db';

/**
 * Resolve as personas que a orientação aponta, no momento da visita.
 *
 * O e-mail é a chave estável; o id não é. O reset das 04:00 recria os
 * colaboradores do tenant de demonstração, então o par (e-mail → id) só vale
 * para esta requisição. Falha de leitura devolve mapa vazio: a linha perde o
 * link daquela pessoa e o resto continua, em vez de a tela inteira quebrar por
 * causa de uma dica.
 */
export async function resolverPersonasDaOrientacao(
  empresaId: string,
  emails: readonly string[],
): Promise<Record<string, string>> {
  if (!empresaId || !emails.length) return {};
  const { data, error } = await tenantDb(empresaId).from('colaboradores')
    .select('id,email')
    .in('email', [...emails]);
  if (error) {
    console.warn('[degustacao/orientacao] resolver personas:', error.message);
    return {};
  }
  const mapa: Record<string, string> = {};
  for (const linha of (data || []) as Array<{ id: string; email: string }>) {
    if (linha?.email && linha?.id) mapa[linha.email] = linha.id;
  }
  return mapa;
}
