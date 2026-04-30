#!/usr/bin/env node
// Reprocessa leads que ficaram pendente (sem PDF gerado).
// Útil quando QStash não está configurado/falhou em produção.
//
// Uso: node scripts/reprocessar-leads-pendentes.mjs [--prod]
//   --prod usa APP_URL pra chamar o worker em produção
//          (requer INTERNAL_DISPATCH_SECRET configurado em prod)
//
// Sem flag, chama o worker em http://localhost:3000.
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.INTERNAL_DISPATCH_SECRET;
const isProd = process.argv.includes('--prod');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.vertho.ai';
const WORKER = isProd
  ? `${APP_URL}/api/radar/lead-pdf`
  : 'http://localhost:3000/api/radar/lead-pdf';
console.log(`Worker URL: ${WORKER}`);

if (!SECRET) {
  console.error('FALTA INTERNAL_DISPATCH_SECRET no .env.local');
  process.exit(1);
}

async function pg(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return r.json();
}

const pendentes = await pg('diag_leads?select=id,email,scope_type,scope_id,pdf_status,criado_em&pdf_status=eq.pendente&order=criado_em.asc&limit=50');
console.log(`Leads pendentes: ${pendentes.length}`);

for (const l of pendentes) {
  console.log(`Processando ${l.id} (${l.email} · ${l.scope_type}/${l.scope_id})...`);
  try {
    const r = await fetch(WORKER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-dispatch': SECRET,
      },
      body: JSON.stringify({ leadId: l.id }),
    });
    const txt = await r.text();
    console.log(`  → ${r.status} ${txt.slice(0, 200)}`);
  } catch (err) {
    console.error(`  → ERRO`, err.message);
  }
}
