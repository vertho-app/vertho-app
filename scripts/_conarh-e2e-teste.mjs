#!/usr/bin/env node
/**
 * Teste ponta a ponta CONARH (produção):
 * 1. Insere lead de teste em diag_leads (scope conarh-2026, classe A)
 * 2. Dispara o worker /api/conarh/artefato via x-internal-dispatch
 * 3. Busca o Mapa da Evolução público do lead
 * 4. Remove o lead de teste
 *
 * Uso: node --env-file=.env.local scripts/_conarh-e2e-teste.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const BASE = 'https://app.vertho.ai';
const secret = process.env.INTERNAL_DISPATCH_SECRET;
if (!secret) { console.error('INTERNAL_DISPATCH_SECRET ausente no .env.local'); process.exit(1); }

// 1. lead de teste
const { data: lead, error } = await sb.from('diag_leads').insert({
  nome: 'TESTE E2E (apagar)',
  organizacao: 'Vertho QA',
  cargo: 'Diretor de RH',
  email: 'conarh-e2e@vertho.ai',
  scope_type: 'comercial',
  scope_id: 'conarh-2026',
  scope_label: 'CONARH 2026',
  origem: 'evento-conarh',
  consentimento_lgpd: true,
  consentimento_em: new Date().toISOString(),
  pdf_status: 'nao_aplicavel',
  porta_escolhida: 2,
  competencia_critica: 'feedback sem rodeio',
  horizonte: 'ate_3m',
  classe: 'A',
  sessao: { nota_instintiva: 3, rotas_concluidas: [2, 3], divergencias: ['FBK-D01', 'FBK-D04'] },
}).select('id').single();
if (error) { console.error('ERRO insert:', error.message); process.exit(1); }
console.log('1. lead criado:', lead.id);

// 2. worker artefato
const r = await fetch(`${BASE}/api/conarh/artefato`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-internal-dispatch': secret },
  body: JSON.stringify({ leadId: lead.id }),
});
console.log('2. worker:', r.status, await r.text());

// 3. mapa público
const m = await fetch(`${BASE}/conarh/mapa/${lead.id}`);
const html = await m.text();
const checks = ['feedback sem rodeio', 'Avaliar com consistência', 'TESTE E2E'];
console.log('3. mapa:', m.status, checks.map((c) => `${html.includes(c) ? 'OK' : 'FALTA'} "${c}"`).join(' · '));

// 4. followup_step marcado?
const { data: depois } = await sb.from('diag_leads').select('followup_step').eq('id', lead.id).single();
console.log('4. followup_step após worker:', depois?.followup_step, '(esperado 1)');

// 5. limpeza
const { error: delErr } = await sb.from('diag_leads').delete().eq('id', lead.id);
console.log('5. lead removido:', delErr ? `ERRO ${delErr.message}` : 'ok');
