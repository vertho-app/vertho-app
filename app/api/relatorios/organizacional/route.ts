import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-context';
import { tenantDb } from '@/lib/tenant-db';
import {
  assinarRelatorio,
  interpretarRefRelatorio,
  nomeDownloadRelatorio,
  podeLerRelatorio,
} from '@/lib/relatorios/relatorio-privado';

/**
 * Abre um relatório organizacional (Perfil Organizacional, DNA, Ranking de
 * Adequação, Adequação ao Cargo) por link ASSINADO e curto.
 *
 * R-74 (revisão de 02/10/2026): a central do RH recebia a URL pública e
 * permanente do bucket `conteudos`. Agora a tela recebe esta rota, e a decisão
 * acontece no clique, no servidor:
 *  1. sessão (cookie ou Bearer);
 *  2. a referência tem que ser de um formato que diz DE QUAL empresa ela é
 *     (`lib/relatorios/relatorio-privado.ts`); o cliente não escolhe o tenant;
 *  3. RH da própria empresa ou platform admin (`podeLerRelatorio`), ANTES de
 *     tocar o Storage;
 *  4. só então o link assinado (5 min) e o redirecionamento.
 *
 * Só PDF: o snapshot `.json` da adequação é insumo interno do ranking.
 */
export const dynamic = 'force-dynamic';

const semCache = (res: NextResponse) => {
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const ref = interpretarRefRelatorio(searchParams.get('ref'));
  if (!ref || !ref.nome.endsWith('.pdf')) {
    return semCache(NextResponse.json({ error: 'referência de relatório inválida' }, { status: 400 }));
  }

  if (!podeLerRelatorio(auth, ref.empresaId)) {
    return semCache(NextResponse.json({ error: 'sem acesso a este relatório' }, { status: 403 }));
  }

  const download = searchParams.get('download') === '1' ? nomeDownloadRelatorio(ref) : undefined;
  const assinado = await assinarRelatorio(tenantDb(ref.empresaId).storage, ref, { download });
  if ('erro' in assinado) {
    console.error('[relatorio-organizacional] link não gerado', {
      empresaId: ref.empresaId, tipo: ref.tipo, legado: ref.legado, erro: assinado.erro,
    });
    return semCache(NextResponse.json(
      { error: assinado.naoEncontrado ? 'relatório não encontrado' : 'relatório indisponível agora' },
      { status: assinado.naoEncontrado ? 404 : 503 },
    ));
  }

  return semCache(NextResponse.redirect(assinado.url, 302));
}
