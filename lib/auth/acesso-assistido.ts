import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { tenantUrl } from '@/lib/domain';
import { logAdminAction } from '@/lib/audit';

/**
 * Acesso assistido: o admin da plataforma abre uma sessão COMO um usuário do cliente, sem senha.
 *
 * Existe desde 10/10/2026 para substituir a senha previsível que o dono usava para entrar no lugar
 * de uma pessoa (R-145). Aquela porta não era só dele: `?senha=1` mostra o formulário de senha em
 * qualquer endereço, a API do Auth aceita senha com a chave pública, e o padrão se adivinhava pelo
 * subdomínio. Esta porta exige sessão de platform admin com `users.impersonate` (o gate fica na
 * action) e deixa rastro de cada entrada.
 *
 * O mecanismo é o do acesso de demonstração do RC (`actions/sales/demo-access.ts`): o link de uso
 * único é gerado no servidor, NADA é enviado à pessoa, e o callback roda no host do tenant. O cookie
 * de sessão não declara `domain`, então a sessão nova nasce só naquele host e a do painel continua.
 *
 * Núcleo sem gate, fora de `'use server'`: quem chama já autenticou e autorizou.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESTINO = '/dashboard';
const POR_PAGINA = 1000;

// Os campos opcionais do outro ramo existem para a tela ler `r.error` sem depender de narrowing
// (o tsconfig do app não liga `strictNullChecks`).
export type ResultadoAcessoAssistido =
  | { success: true; url: string; nome: string; error?: undefined }
  | { success: false; error: string; url?: undefined; nome?: undefined };

const recusa = (error: string): ResultadoAcessoAssistido => ({ success: false, error });

/**
 * A conta de login já existe? O botão NÃO cria conta: quem nunca entrou não tem, e criar uma só
 * para olhar mudaria o que "tem conta" significa nas leituras de acesso da turma.
 */
async function contaDeLoginExiste(sb: ReturnType<typeof createSupabaseAdmin>, email: string): Promise<{ existe: boolean } | { erro: string }> {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) return { erro: error.message };
    const usuarios = data?.users || [];
    if (usuarios.some((u) => (u.email || '').trim().toLowerCase() === email)) return { existe: true };
    if (usuarios.length < POR_PAGINA) return { existe: false };
  }
  return { erro: 'contas demais para conferir' };
}

export async function abrirAcessoAssistido(p: {
  adminEmail: string;
  empresaId: string;
  colaboradorId: string;
}): Promise<ResultadoAcessoAssistido> {
  if (!UUID_RE.test(String(p.empresaId || '')) || !UUID_RE.test(String(p.colaboradorId || ''))) {
    return recusa('Pessoa inválida.');
  }
  const sb = createSupabaseAdmin();

  const { data: empresa, error: erroEmpresa } = await sb.from('empresas')
    .select('id, slug').eq('id', p.empresaId).maybeSingle();
  if (erroEmpresa) return recusa(`Não consegui ler a empresa: ${erroEmpresa.message}`);
  if (!empresa?.slug) return recusa('Empresa não encontrada.');

  const { data: colab, error: erroColab } = await tenantDb(p.empresaId).from('colaboradores')
    .select('id, nome_completo, email').eq('id', p.colaboradorId).maybeSingle();
  if (erroColab) return recusa(`Não consegui ler a pessoa: ${erroColab.message}`);
  if (!colab) return recusa('Pessoa não encontrada nesta empresa.');
  const email = String(colab.email || '').trim().toLowerCase();
  if (!email) return recusa('Esta pessoa não tem e-mail de login.');

  // Nunca como admin da plataforma: o gate das actions de plataforma é pelo e-mail da sessão, em
  // qualquer host, então entrar como outro admin seria herdar as permissões dele.
  const { data: admin, error: erroAdmin } = await sb.from('platform_admins')
    .select('id').eq('email', email).maybeSingle();
  if (erroAdmin) return recusa(`Não consegui conferir se a pessoa é admin da plataforma: ${erroAdmin.message}`);
  if (admin) return recusa('Não é possível entrar como um admin da plataforma.');

  const conta = await contaDeLoginExiste(sb, email);
  if ('erro' in conta) return recusa(`Não consegui conferir a conta de login: ${conta.erro}`);
  if (!conta.existe) return recusa('Esta pessoa ainda não tem conta de login (nunca entrou).');

  // O rastro vem ANTES do link: sem registro na auditoria, nada é aberto.
  const registrou = await logAdminAction({
    adminEmail: p.adminEmail,
    acao: 'acesso_assistido.entrar',
    empresaId: p.empresaId,
    empresaSlug: empresa.slug,
    alvo: colab.id,
    detalhes: { email, nome: colab.nome_completo || null, destino: DESTINO },
  });
  if (!registrou) return recusa('Não consegui registrar a entrada na auditoria, então nada foi aberto.');

  const { data: link, error: erroLink } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: tenantUrl(empresa.slug, DESTINO) },
  });
  const tokenHash = link?.properties?.hashed_token;
  if (erroLink || !tokenHash) return recusa(`Não consegui gerar o acesso: ${erroLink?.message || 'sem token'}`);

  const url = tenantUrl(
    empresa.slug,
    `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(DESTINO)}`,
  );
  return { success: true, url, nome: colab.nome_completo || email };
}
