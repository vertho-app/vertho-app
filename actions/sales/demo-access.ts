'use server';

// Portal do Representante — acesso ao Ambiente de Demonstração (modo apresentação).
//
// Como funciona (sem "impersonation token" inventado): o RC entra no tenant de
// demonstração (acme-demo) COMO uma persona, num host separado
// (acme-demo.vertho.ai) — os cookies de auth são host-scoped, então a sessão do
// portal do RC (host do app) permanece intacta em outra aba.
//
// O acesso reutiliza o fluxo de magic link já existente: geramos um token_hash
// para a persona (server-side, SEM enviar nada) e devolvemos a URL de callback
// no host do demo. O /auth/callback verifica o token e cria a sessão da persona.
//
// Segurança: só RC ativo; só as personas ALLOWLISTADAS do acme-demo; o gate de
// envio (empresas.is_demo) garante que nenhuma mensagem real sai enquanto o RC
// navega/interage como persona.
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantUrl } from '@/lib/domain';
import { requireRepresentativeAction } from '@/lib/sales/permissions';
import { DEMO_PERSONAS } from '@/lib/sales/demo-personas';

const DEMO_SLUG = 'acme-demo';

/** Lista as personas disponíveis para o RC (sem tokens). */
export async function listarPersonasDemo() {
  await requireRepresentativeAction();
  return {
    success: true as const,
    personas: DEMO_PERSONAS.map(({ key, nome, papel, cenario, disc, hint }) => ({ key, nome, papel, cenario, disc, hint })),
  };
}

/**
 * Abre o Ambiente de Demonstração como a persona escolhida. Retorna a URL de
 * callback no host do demo (o cliente faz window.open). NÃO envia nada.
 */
export async function entrarNoDemoComoPersona(personaKey: string) {
  const ctx = await requireRepresentativeAction();
  const persona = DEMO_PERSONAS.find((p) => p.key === personaKey);
  if (!persona) return { success: false as const, error: 'Persona de demonstração inválida' };

  const sb = createSupabaseAdmin();

  // Confirma que o tenant de demo existe e É demo (defesa: nunca minta sessão
  // fora do acme-demo).
  const { data: empresa } = await sb.from('empresas').select('id, is_demo').eq('slug', DEMO_SLUG).maybeSingle();
  if (!empresa?.is_demo) return { success: false as const, error: 'Ambiente de demonstração indisponível' };

  // Garante o usuário auth da persona (idempotente — se já existe, ignora).
  try {
    await (sb as any).auth.admin.createUser({ email: persona.email, email_confirm: true });
  } catch { /* já existe → segue */ }

  // Confirma que a persona é colaboradora do acme-demo (senão o dashboard não
  // teria contexto). Se o demo ainda não foi semeado, orienta o reset.
  const { data: colab } = await sb.from('colaboradores')
    .select('id').eq('empresa_id', empresa.id).eq('email', persona.email).maybeSingle();
  if (!colab) return { success: false as const, error: 'Personas do demo não encontradas — rode o reset do ambiente (admin).' };

  const nextPath = persona.papel === 'Gestora' ? '/dashboard/gestor' : '/dashboard';
  const redirectTo = tenantUrl(DEMO_SLUG, nextPath);

  const { data: link, error } = await (sb as any).auth.admin.generateLink({
    type: 'magiclink',
    email: persona.email,
    options: { redirectTo },
  });
  if (error || !link?.properties?.hashed_token) {
    return { success: false as const, error: `Falha ao abrir o demo: ${error?.message || 'sem token'}` };
  }

  const url = tenantUrl(
    DEMO_SLUG,
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email&next=${encodeURIComponent(nextPath)}`,
  );

  console.log(`[demo-access] RC ${ctx.email} entrou no demo como ${persona.key}`);
  return { success: true as const, url, persona: { nome: persona.nome, papel: persona.papel } };
}
