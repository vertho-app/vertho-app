import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { authLimiter } from '@/lib/rate-limit';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { resolveAppLocale } from '@/lib/i18n';
import { montarParametroAcesso } from '@/lib/auth/magic-link-whatsapp';
import { sendAccessLink } from '@/lib/notifications/access-link-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Rate limit por IP — dispara WhatsApp (custo Z-API).
  const limited = await authLimiter.check(req);
  if (limited) return limited;

  try {
    const { email, redirectTo } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    const trimmed = email.trim().toLowerCase();
    const locale = resolveAppLocale(req.cookies.get('vertho-locale')?.value);
    const sb = createSupabaseAdmin();

    // Escopo de tenant: com subdomínio, só atende colaborador da própria empresa.
    // Sem subdomínio, o link é global por email → pega 1 registro representativo
    // (limit 1; o maybeSingle anterior quebrava com email duplicado em tenants).
    const slug = getTenantSlug(req);
    let q = sb.from('colaboradores')
      .select('nome_completo, telefone, empresa_id')
      .eq('email', trimmed);
    if (slug) {
      const { data: emp } = await sb.from('empresas').select('id').eq('slug', slug).maybeSingle();
      if (!emp) return NextResponse.json({ sent: false });
      q = q.eq('empresa_id', emp.id);
    }
    const { data: colabRows } = await q.limit(1);
    const colab = colabRows?.[0] as { nome_completo: string | null; telefone: string | null; empresa_id: string } | undefined;

    if (!colab?.telefone) return NextResponse.json({ sent: false });

    const { data: empresa } = await sb.from('empresas')
      .select('nome').eq('id', colab.empresa_id).maybeSingle();

    const redirect = resolveSafeAuthRedirect(req, redirectTo);

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: redirect.safeRedirectTo },
    });
    if (linkErr || !linkData?.properties) {
      console.error('[magic-link-whatsapp]', linkErr?.message);
      return NextResponse.json({ sent: false });
    }

    const tokenHash = linkData.properties.hashed_token;
    // `ibipeba.vertho.ai` → `ibipeba`. Sem slug utilizável (host sem tenant), o
    // template não é usado e o caminho legado assume — melhor um envio pelo
    // caminho antigo que um link que leva ao subdomínio errado.
    const slugDoTenant = (() => {
      try {
        const host = new URL(redirect.origin).hostname;
        const [primeiro, ...resto] = host.split('.');
        return resto.length >= 2 && primeiro && primeiro !== 'app' ? primeiro : null;
      } catch { return null; }
    })();
    const callbackLink = tokenHash
      ? `${redirect.origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(redirect.nextPath)}`
      : linkData.properties.action_link;

    const result = await sendAccessLink({
      to: trimmed,
      telefone: colab.telefone,
      nome: colab.nome_completo?.split(' ')[0] || '',
      empresaNome: empresa?.nome || 'Vertho',
      empresaId: (empresa as any)?.id ?? colab.empresa_id ?? null, // gate de tenant-demo
      locale,
      whatsappLink: callbackLink,
      // Parâmetro do BOTÃO do template aprovado: `<slug>~<token_hash>`. O slug
      // sai do host do redirect — é ele que diz em qual subdomínio a sessão
      // precisa nascer, e o cookie fica preso ao host exato.
      acessoParam: slugDoTenant && tokenHash
        ? montarParametroAcesso(slugDoTenant, tokenHash)
        : null,
      channels: ['whatsapp'],
    });

    if (result.whatsapp !== 'sent') {
      console.error('[magic-link-whatsapp] não enviado:', result.whatsappReason);
      return NextResponse.json({ sent: false, error: result.whatsappReason });
    }
    return NextResponse.json({ sent: true });
  } catch (err: any) {
    console.error('[magic-link-whatsapp]', err.message);
    return NextResponse.json({ sent: false });
  }
}
