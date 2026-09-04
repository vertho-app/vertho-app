'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requirePermissionAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';

export async function loadPlatformAdmins() {
  await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('platform_admins')
    .select('id, email, nome, role, created_at')
    .order('created_at');
  return data || [];
}

function normalizeRole(role: any): 'master' | 'socio' {
  return role === 'socio' ? 'socio' : 'master';
}

export async function adicionarAdmin(email: any, nome: any, role: any = 'master') {
  const ctx = await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!email?.trim()) return { success: false, error: 'Email obrigatorio' };

  const clean = email.trim().toLowerCase();

  const { data: existing } = await sb.from('platform_admins')
    .select('id').eq('email', clean).single();
  if (existing) return { success: false, error: 'Este email ja e admin' };

  const novo = normalizeRole(role);
  const { error } = await sb.from('platform_admins')
    .insert({ email: clean, nome: nome?.trim() || null, role: novo });
  if (error) return { success: false, error: error.message };

  // 🔴 CADASTRAR NÃO ERA DAR ACESSO (medido 04/09/2026).
  //
  // A linha em `platform_admins` concede o papel; quem deixa a pessoa ENTRAR é
  // a conta no Supabase Auth, e ela não nascia aqui. O login por e-mail chama
  // `generateLink` SEM criar usuário, então o admin recém-cadastrado recebia
  // "Falha ao gerar link" — e o sintoma não fala de cadastro nenhum. Aconteceu
  // com `simone@vertho.ai`: cadastrada como sócia, zero contas no Auth.
  //
  // A conta é criada com e-mail já confirmado: ela entra por magic link, e o
  // primeiro acesso não pode depender de um e-mail de confirmação que este
  // fluxo não envia.
  const acesso = await garantirContaDeAcesso(sb, clean, nome?.trim() || null);

  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'platform_admin.adicionar',
    alvo: clean,
    detalhes: { role: novo, acesso: acesso.status },
    resultado: acesso.status === 'falhou' ? 'parcial' : 'ok',
  });

  const sufixo = {
    criada: ' O acesso foi criado: ela já pode entrar pelo e-mail.',
    existente: ' Ela já tinha acesso e pode entrar pelo e-mail.',
    falhou: ` ⚠️ O papel foi concedido, mas o ACESSO não: ${acesso.erro}. Ela não vai conseguir entrar até isso ser resolvido.`,
  }[acesso.status];

  return {
    success: true,
    acesso: acesso.status,
    message: `${clean} adicionado como ${novo === 'socio' ? 'Admin Sócio' : 'Admin Master'}.${sufixo}`,
  };
}

/**
 * Garante a conta do Supabase Auth do admin — o que efetivamente deixa entrar.
 *
 * Não lança: o papel já foi concedido quando isto roda, e derrubar aqui deixaria
 * o cadastro pela metade sem dizer o que ficou faltando. O status volta na
 * mensagem e na auditoria, para o problema aparecer na hora e não no dia em que
 * a pessoa tenta entrar.
 */
async function garantirContaDeAcesso(
  sb: any,
  email: string,
  nome: string | null,
): Promise<{ status: 'criada' | 'existente' | 'falhou'; erro?: string }> {
  try {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: nome ? { name: nome } : {},
    });
    if (!error && data?.user?.id) return { status: 'criada' };

    // `email_exists` é o caso normal de quem já usa a plataforma (o Rodrigo, a
    // Juliane): o papel é novo, a conta não.
    const mensagem = String(error?.message || '');
    const jaExiste = (error as any)?.code === 'email_exists'
      || /already been registered|already exists/i.test(mensagem);
    if (jaExiste) return { status: 'existente' };

    console.error('[platform-admins] criar acesso:', mensagem);
    return { status: 'falhou', erro: mensagem || 'usuário não retornado' };
  } catch (e: any) {
    console.error('[platform-admins] criar acesso (exceção):', e?.message);
    return { status: 'falhou', erro: e?.message || 'erro inesperado' };
  }
}

export async function definirRoleAdmin(id: any, role: any) {
  const ctx = await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!id) return { success: false, error: 'ID obrigatório' };
  const { data: alvoAdmin } = await sb.from('platform_admins').select('email, role').eq('id', id).maybeSingle();
  // Self-protection: um master não pode rebaixar a si mesmo (se-lockout). Como
  // só é possível agir sobre OUTROS, o último master sempre sobrevive.
  if ((alvoAdmin as any)?.email && (alvoAdmin as any).email.toLowerCase() === ctx.email?.toLowerCase()) {
    return { success: false, error: 'Você não pode alterar o próprio papel de admin.' };
  }
  const novo = normalizeRole(role);
  const { error } = await sb.from('platform_admins').update({ role: novo }).eq('id', id);
  if (error) return { success: false, error: error.message };
  await logAdminAction({ adminEmail: ctx.email, acao: 'platform_admin.alterar_role', alvo: (alvoAdmin as any)?.email || id, detalhes: { de: (alvoAdmin as any)?.role, para: novo } });
  return { success: true, message: `Papel atualizado para ${novo === 'socio' ? 'Admin Sócio' : 'Admin Master'}` };
}

export async function removerAdmin(id: any) {
  const ctx = await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!id) return { success: false, error: 'ID obrigatorio' };
  const { data: alvoAdmin } = await sb.from('platform_admins').select('email, role').eq('id', id).maybeSingle();
  // Self-protection: um master não pode remover a si mesmo (se-lockout).
  if ((alvoAdmin as any)?.email && (alvoAdmin as any).email.toLowerCase() === ctx.email?.toLowerCase()) {
    return { success: false, error: 'Você não pode remover a si mesmo.' };
  }
  const { error } = await sb.from('platform_admins').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  await logAdminAction({ adminEmail: ctx.email, acao: 'platform_admin.remover', alvo: (alvoAdmin as any)?.email || id, detalhes: { role: (alvoAdmin as any)?.role } });
  return { success: true, message: 'Admin removido' };
}
