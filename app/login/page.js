import { headers } from 'next/headers';
import { connection } from 'next/server';
import { resolveTenant, getTenantSlug } from '@/lib/tenant-resolver';
import LoginForm from './login-form';

export default async function LoginPage() {
  await connection();

  const h = await headers();
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
    accentColor: uiConfig.accent_color || '#00B4D8',
    bgGradientStart: uiConfig.bg_gradient_start || '#091D35',
    bgGradientEnd: uiConfig.bg_gradient_end || '#0F2A4A',
    subtitle: uiConfig.login_subtitle || 'Sua jornada de desenvolvimento',
  };

  return <LoginForm branding={branding} />;
}
