'use server';

import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { listarNumeros, type NumeroRemetente } from '@/lib/whatsapp/numeros';

/**
 * Catálogo de números remetentes para as telas (mig 252).
 *
 * Leitura pura de env — sem banco, sem segredo (só ids e rótulos). Precisa de
 * action porque `process.env` sem `NEXT_PUBLIC_` não chega ao cliente, e
 * expor os ids como públicos seria vazar topologia do canal.
 */
export async function listarNumerosRemetentes(): Promise<NumeroRemetente[]> {
  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) throw new Error('Acesso restrito à plataforma');
  return listarNumeros();
}
