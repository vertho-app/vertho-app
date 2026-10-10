import { Suspense } from 'react';
import SegundoFatorCliente from './segundo-fator-cliente';

export const dynamic = 'force-dynamic';

/**
 * Segundo fator (aplicativo autenticador) para o poder de plataforma (`lib/auth/segundo-fator.ts`).
 * Fica FORA de `/admin` de propósito: o layout do painel manda para cá quem é da equipe mas ainda
 * não provou o código, e um gate no próprio caminho trancaria a porta de saída.
 */
export default function SegundoFatorPage() {
  return (
    <Suspense fallback={null}>
      <SegundoFatorCliente />
    </Suspense>
  );
}
