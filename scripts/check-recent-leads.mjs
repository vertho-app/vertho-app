#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function pg(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return r.json();
}

const leads = await pg('diag_leads?select=id,email,nome,scope_type,scope_id,pdf_status,pdf_erro,criado_em,pdf_gerado_em&order=criado_em.desc&limit=10');
console.log('Últimos 10 leads:');
console.table(leads.map((l) => ({
  criado: l.criado_em?.slice(0, 19),
  email: l.email?.slice(0, 30),
  scope: `${l.scope_type}/${l.scope_id}`,
  status: l.pdf_status,
  erro: l.pdf_erro?.slice(0, 60) || '',
  gerado: l.pdf_gerado_em?.slice(0, 19) || '',
})));

console.log('\nResend API key configurada:', !!process.env.RESEND_API_KEY);
console.log('QStash current key configurada:', !!process.env.QSTASH_CURRENT_SIGNING_KEY);
console.log('QStash next key configurada:', !!process.env.QSTASH_NEXT_SIGNING_KEY);
console.log('QStash token configurada:', !!process.env.QSTASH_TOKEN);
