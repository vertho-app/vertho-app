import { headers } from 'next/headers';
import { connection } from 'next/server';
import { resolveTenant, getTenantSlug } from '@/lib/tenant-resolver';
import { getTranslations } from 'next-intl/server';
import LoginForm from './login-form';
import { ehNavegadorEmbutido, ehIos } from '@/lib/auth/navegador-embutido';
import { senhaDisponivelNoLogin } from '@/lib/auth/login-senha';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect?: string | string[]; senha?: string | string[] }>;
}) {
  await connection();
  const params = (await searchParams) ?? {};
  const umValor = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

  const h = await headers();
  const t = await getTranslations('Login');
  const slug = getTenantSlug(h);
  const tenant = slug ? await resolveTenant(slug) : null;

  // Extrai config de branding, com fallbacks para o tema padrão Vertho
  const uiConfig = tenant?.ui_config || {};
  const branding = {
    tenantName: tenant?.nome || 'Vertho',
    logoUrl: uiConfig.logo_url || null,
    fontColor: uiConfig.font_color || '#FFFFFF',
    fontColorSecondary: uiConfig.font_color_secondary || '#FFFFFF99',
    primaryColor: uiConfig.primary_color || '#0D9488',
    primaryColorEnd: uiConfig.primary_color_end || '#0F766E',
    accentColor: uiConfig.accent_color || '#34C5CC',
    bgGradientStart: uiConfig.bg_gradient_start || '#091D35',
    bgGradientEnd: uiConfig.bg_gradient_end || '#0F2A4A',
    subtitle: uiConfig.login_subtitle || t('defaultSubtitle'),
  };

  // Se esta tela apareceu dentro do navegador embutido de um app, é porque NESTE
  // navegador não há sessão — e a da pessoa pode estar no Safari/Chrome ou no app
  // instalado, noutro cookie jar. Decidido no servidor para o aviso não piscar.
  const ua = h.get('user-agent');

  return (
    <LoginForm
      branding={branding}
      embutido={ehNavegadorEmbutido(ua)}
      ios={ehIos(ua)}
      comOrganizacao={!!tenant}
      // Senha só onde ela existe (R-78): decidido no servidor para o botão não
      // piscar. Ver `lib/auth/login-senha.ts`.
      senhaDisponivel={senhaDisponivelNoLogin({
        tenantDemo: tenant?.is_demo === true,
        redirect: umValor(params.redirect),
        senha: umValor(params.senha),
      })}
    />
  );
}
