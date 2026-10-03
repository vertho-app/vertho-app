import { NextResponse } from 'next/server';
import type { UserContext } from '@/types';

/**
 * Quem pode ESCREVER na jornada de uma pessoa: só ela mesma (R-72, 03/10/2026).
 *
 * As rotas da jornada (`/api/temporada/reflection`, `evaluation`, `missao`,
 * `tira-duvidas`) autorizavam a escrita com `assertColabAccess`, que é régua de
 * LEITURA: libera o RH da empresa inteira e o gestor da mesma área, porque eles
 * acompanham a pessoa. Com ela, RH e gestor podiam responder as Evidências no
 * lugar do liderado, abrir o Cenário B, conduzir a arguição e disparar a nota
 * final. A tela já escondia esses botões na visão de acompanhamento; a rota não.
 *
 * Leitura continua com `assertColabAccess`. Escrita passa por aqui, DEPOIS
 * dela (que já resolveu tenant e área): esta função só decide a posse.
 *
 * Platform admin segue como exceção, a mesma de `assertColabAccess` hoje:
 * mudar isso é decisão do dono, registrada no relatório da fase 2.
 *
 * Fica fora de `request-context.ts` de propósito: é pura (sem banco), e os
 * testes de rota que simulam a sessão continuam exercitando a régua real.
 */
export function assertDonoDaTrilha(
  auth: Pick<UserContext, 'isPlatformAdmin' | 'colaborador'>,
  colabId: string | null | undefined,
): Response | null {
  if (!colabId) {
    return NextResponse.json({ error: 'colaboradorId obrigatório' }, { status: 400 });
  }
  if (auth.isPlatformAdmin) return null;
  if (auth.colaborador?.id === colabId) return null;
  return NextResponse.json(
    { error: 'Só a própria pessoa pode responder na jornada dela. Gestão e RH acompanham sem escrever.' },
    { status: 403 },
  );
}
