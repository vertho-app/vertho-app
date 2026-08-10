import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Qual commit está servindo AGORA. Público de propósito (o repo é público, o SHA
 * não é segredo) e sem gate: quem precisa dele é um check que roda antes de ter
 * qualquer sessão.
 *
 * Existe por causa de um defeito do próprio CI: o workflow do smoke test fazia
 * `sleep 90` para "esperar o deploy" e então testava produção. O build leva ~2
 * min (medido 10/08/2026), então o smoke media o deployment ANTERIOR e dizia
 * verde sobre código que ainda não estava no ar — a mesma família de
 * "instrumento que não pode falhar" que ele deveria vigiar. Agora o smoke espera
 * este endpoint devolver o SHA do commit que disparou o workflow.
 *
 * `VERCEL_GIT_COMMIT_SHA` é injetada pela Vercel em runtime.
 */
export async function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      env: process.env.VERCEL_ENV || 'local',
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
