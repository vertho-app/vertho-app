/**
 * Rotaciona a senha da conta de smoke do E2E e repõe a linha dela.
 *
 * ⚠️ A RECOMPOSIÇÃO NÃO DEPENDE MAIS DESTE SCRIPT (09/09/2026). A linha em
 * `colaboradores` é reposta pelo PRÓPRIO reset noturno, no último passo — ver
 * `lib/demo/conta-verificacao.ts`, que também guarda a medição dos 185 runs
 * vermelhos que a instrução "rode isto depois do reset" custou.
 *
 * O que só este script faz é a metade que o reset não pode fazer: rotacionar a
 * senha em `auth.users` e gravá-la no secret `SMOKE_PASS` do GitHub. Rode-o
 * quando a senha precisar mudar (ou quando o secret se perder), não como rotina
 * de manutenção do tenant.
 *
 * A conta usa o MESMO molde da Helena (role `rh`: acumula dashboard, visão de
 * gestor e pipeline em /admin/empresas — o que `tests/fluxos-criticos.spec.js`
 * percorre) e é CLONE da linha dela no banco, para herdar as colunas de perfil
 * sem depender do formato do snapshot do reset.
 *
 * Uso: npx --yes tsx scripts/criar-smoke-e2e.ts
 * A senha é sempre rotacionada e gravada DIRETO no secret SMOKE_PASS do GitHub
 * (nunca impressa em log). SMOKE_EMAIL vai como env do workflow, não é segredo.
 */
import './_env';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  VERIFICACAO_EMAIL as SMOKE_EMAIL,
  VERIFICACAO_TENANT_SLUG as EMPRESA_SLUG,
  reporContaDeVerificacao,
} from '@/lib/demo/conta-verificacao';

async function main() {
  const sb = createSupabaseAdmin();

  const { data: empresa, error: empresaErro } = await sb
    .from('empresas').select('id, nome').eq('slug', EMPRESA_SLUG).maybeSingle();
  if (empresaErro || !empresa) throw new Error(`tenant ${EMPRESA_SLUG} não achado: ${empresaErro?.message}`);

  // Mesma função que o reset noturno chama: duas cópias divergiriam, e a que
  // estivesse errada seria a que ninguém executa à mão.
  const reposta = await reporContaDeVerificacao(sb, empresa.id);
  if (!reposta.ok) throw new Error(`falha ao repor a conta: ${reposta.motivo}`);

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
