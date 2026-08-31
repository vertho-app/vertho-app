import { NextResponse } from 'next/server';
import { csrfCheck } from '@/lib/csrf';
import { readLimiter } from '@/lib/rate-limit';
import { requireRepresentativeOrAdminRequest } from '@/lib/copiloto/auth';
import { descobrirRedesDoSite } from '@/lib/copiloto/social-discovery-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_SITE = 320;

/**
 * Lê o site da empresa e devolve os perfis oficiais que ele mesmo publica, para
 * pré-preencher o campo "Redes sociais oficiais" do planejamento.
 *
 * Sem banco, sem IA e sem tenant: é leitura de HTML público. A guarda anti-SSRF
 * (lib/net-guard) roda em cada hop, inclusive nos redirects.
 */
export async function POST(req: Request) {
  const csrf = csrfCheck(req);
  if (csrf) return csrf;
  const access = await requireRepresentativeOrAdminRequest(req);
  if (access instanceof Response) return access;
  const limited = await readLimiter.check(req, access.email);
  if (limited) return limited;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  }
  const site = typeof body?.site === 'string' ? body.site.trim().slice(0, MAX_SITE) : '';
  if (!site) return NextResponse.json({ error: 'Informe o site da empresa' }, { status: 400 });

  try {
    const descoberta = await descobrirRedesDoSite(site);
    if (descoberta.motivo === 'url_invalida') {
      return NextResponse.json({ error: 'Site inválido' }, { status: 400 });
    }
    return NextResponse.json({
      perfis: descoberta.perfis,
      siteLido: descoberta.siteLido,
      motivo: descoberta.motivo,
    });
  } catch (error: any) {
    console.error('[copiloto/redes-sociais]', error?.message || error);
    return NextResponse.json({ error: 'Não foi possível ler o site agora.' }, { status: 502 });
  }
}
