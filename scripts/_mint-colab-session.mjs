// Minta uma sessão de colaborador para E2E/gravação de tela em produção.
// Uso: node scripts/_mint-colab-session.mjs [email]   (default: samuel@teste.macae.br)
//
// Receita (docs na memória "E2E em produção"): cria o auth user se faltar →
// generate_link magiclink → verify → sessão. Sai um JSON com o cookie
// sb-<ref>-auth-token pronto pra injetar via document.cookie no domínio do
// tenant. O arquivo vai pro TEMP do SO (token não fica no repo).
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EMAIL = process.argv[2] || 'samuel@teste.macae.br';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !SRK || !ANON) throw new Error('env faltando (.env.local)');

const admin = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

const created = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
  method: 'POST', headers: admin, body: JSON.stringify({ email: EMAIL, email_confirm: true }),
});
console.log('create user:', created.status === 200 ? 'criado' : 'já existia');

const linkRes = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
  method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
});
const link = await linkRes.json();
const hashed = link.hashed_token || link.properties?.hashed_token;
if (!hashed) { console.error('generate_link falhou:', linkRes.status); process.exit(1); }

const verifyRes = await fetch(`${URL_BASE}/auth/v1/verify`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
});
const session = await verifyRes.json();
if (!session.access_token) { console.error('verify falhou:', verifyRes.status); process.exit(1); }

// Cookie @supabase/ssr: "base64-" + base64url(JSON da sessão), chunks de 3180.
const ref = URL_BASE.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const payload = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
const chunks = [];
for (let i = 0; i < payload.length; i += 3180) chunks.push(payload.slice(i, i + 3180));
const cookies = chunks.length === 1
  ? [{ name: `sb-${ref}-auth-token`, value: chunks[0] }]
  : chunks.map((v, i) => ({ name: `sb-${ref}-auth-token.${i}`, value: v }));

const out = path.join(tmpdir(), `vertho-session-${EMAIL.replace(/[^a-z0-9]/gi, '_')}.json`);
writeFileSync(out, JSON.stringify({ ref, email: EMAIL, cookies, access_token: session.access_token }, null, 2));
console.log(`sessão emitida (${cookies.length} chunk(s)) → ${out}`);
console.log('Injetar no domínio do tenant (página neutra, ex. /robots.txt) e navegar:');
console.log(`  document.cookie = "<name>=<value>; path=/; max-age=3600; secure; samesite=lax"`);
console.log('⚠️ Sessão one-time frágil: se morrer (redirect pro /login), mintar outra.');
