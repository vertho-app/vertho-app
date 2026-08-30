/**
 * Cria/repõe a conta de smoke do E2E no tenant Grupo Sinal (demo).
 *
 * A conta usa o MESMO molde da Helena (role `rh`: acumula dashboard, visão de
 * gestor e pipeline em /admin/empresas — o que `tests/fluxos-criticos.spec.js`
 * percorre) e é CLONE da linha dela no banco, para herdar as colunas de perfil
 * sem depender do formato do snapshot do reset.
 *
 * Por que um script próprio: as senhas das personas de acesso do demo são
 * ROTACIONADAS por reset (feature da entrega ao prospect), então o E2E precisa
 * de uma conta fora dessa rotação. Este script é IDEMPOTENTE e é o que se roda
 * depois de qualquer `reset:demo:gruposinal` (que apaga o colaborador).
 *
 * Uso: npx --yes tsx scripts/criar-smoke-e2e.ts
 * A senha é sempre rotacionada e gravada DIRETO no secret SMOKE_PASS do GitHub
 * (nunca impressa em log). SMOKE_EMAIL vai como env do workflow, não é segredo.
 */
import './_env';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { createSupabaseAdmin } from '@/lib/supabase';

const EMPRESA_SLUG = 'gruposinal';
const MOLDE_EMAIL = 'helena.demo@vertho.ai';
const SMOKE_EMAIL = 'smoke-e2e.demo@vertho.ai';
const SMOKE_NOME = 'Smoke E2E';
const SMOKE_CARGO = 'E2E — Verificação Automática';

async function main() {
  const sb = createSupabaseAdmin();

  const { data: empresa, error: empresaErro } = await sb
    .from('empresas').select('id, nome').eq('slug', EMPRESA_SLUG).maybeSingle();
  if (empresaErro || !empresa) throw new Error(`tenant ${EMPRESA_SLUG} não achado: ${empresaErro?.message}`);

  const { data: molde, error: moldeErro } = await sb
    .from('colaboradores').select('*')
    .eq('empresa_id', empresa.id).eq('email', MOLDE_EMAIL).maybeSingle();
  if (moldeErro || !molde) throw new Error(`molde ${MOLDE_EMAIL} não achado em ${empresa.nome}: ${moldeErro?.message}`);

  // Clone do molde: identidade trocada, chaves/timestamps de fora.
  const { id: _id, created_at: _c, updated_at: _u, auth_user_id: _a, ...colunas } = molde as Record<string, unknown>;
  const linha = { ...colunas, email: SMOKE_EMAIL, nome_completo: SMOKE_NOME, cargo: SMOKE_CARGO };

  const { error: delErro } = await sb.from('colaboradores')
    .delete().eq('empresa_id', empresa.id).eq('email', SMOKE_EMAIL);
  if (delErro) throw new Error('falha ao limpar smoke antigo: ' + delErro.message);

  const { error: insErro } = await sb.from('colaboradores').insert(linha);
  if (insErro) throw new Error('falha ao inserir colaborador smoke: ' + insErro.message);

  // Conta de auth: rotaciona a senha sempre, espelha o e-mail.
  const senha = `E2E-${randomBytes(12).toString('base64url')}-aA9!`;
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existente = (users?.users || []).find((u) => u.email === SMOKE_EMAIL);
  if (existente) {
    const { error } = await sb.auth.admin.updateUserById(existente.id, { password: senha, email_confirm: true });
    if (error) throw new Error('falha ao rotacionar senha: ' + error.message);
  } else {
    const { error } = await sb.auth.admin.createUser({ email: SMOKE_EMAIL, password: senha, email_confirm: true });
    if (error) throw new Error('falha ao criar conta: ' + error.message);
  }

  // Senha vai direto pro secret do GitHub e ao .env.local (gitignored) para
  // rodada local — nunca para o log.
  const gh = spawnSync('gh', ['secret', 'set', 'SMOKE_PASS', '--repo', 'vertho-app/vertho-app'], { input: senha });
  if (gh.status !== 0) {
    throw new Error('colaborador criado, mas o `gh secret set SMOKE_PASS` falhou (status ' + gh.status + '). Rode manualmente.');
  }
  const envPath = '.env.local';
  const envAtual = require('fs').existsSync(envPath) ? require('fs').readFileSync(envPath, 'utf8') : '';
  const envNovo = envAtual
    .split('\n').filter((l: string) => !/^(SMOKE_EMAIL|SMOKE_PASS)=/.test(l.trim()))
    .join('\n').replace(/\n+$/, '')
    + `\nSMOKE_EMAIL=${SMOKE_EMAIL}\nSMOKE_PASS=${senha}\n`;
  require('fs').writeFileSync(envPath, envNovo);

  console.log(`SMOKE OK: ${SMOKE_EMAIL} em ${empresa.nome} (${empresa.id})`);
  console.log('SMOKE_EMAIL (yaml do workflow):', SMOKE_EMAIL);
  console.log('DIAG_EMPRESA_ID (yaml do workflow):', empresa.id);
  console.log('secret SMOKE_PASS rotacionado no GitHub.');
}

main().catch((e) => { console.error('SMOKE FALHOU:', e?.message || e); process.exit(1); });
