// Ajusta a cadência de envio do Ibipeba: pílula 2 de QUARTA (3) → TERÇA (2).
// Preserva o resto do sys_config. Uso: node scripts/_set-cadencia-ibipeba.mjs [--apply]
import fs from 'node:fs';
const env = fs.readFileSync('C:/GAS/Vertho App/nextjs-app/.env.local', 'utf8');
const g = (k) => (env.split(/\r?\n/).find(l => l.startsWith(k + '=')) || '').replace(k + '=', '').trim();
const URL = g('NEXT_PUBLIC_SUPABASE_URL'), KEY = g('SUPABASE_SERVICE_ROLE_KEY');
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const APPLY = process.argv.includes('--apply');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const r = await fetch(`${URL}/rest/v1/empresas?id=eq.${EMP}&select=nome,sys_config`, { headers: H });
const [row] = await r.json();
const sys = row?.sys_config || {};
const cad = { ...(sys.cadencia || {}) };
console.log('cadência ANTES:', JSON.stringify(cad));
cad.fase4_dia_pilula = cad.fase4_dia_pilula ?? 1;   // segunda
cad.fase4_dia_pilula2 = 2;                           // TERÇA (era 3=quarta)
cad.fase4_dia_evidencia = cad.fase4_dia_evidencia ?? 4; // quinta
const novo = { ...sys, cadencia: cad };
console.log('cadência DEPOIS:', JSON.stringify(cad), '(0=dom 1=seg 2=ter 3=qua 4=qui)');

if (!APPLY) { console.log('\n(dry-run — rode com --apply p/ gravar)'); process.exit(0); }
const p = await fetch(`${URL}/rest/v1/empresas?id=eq.${EMP}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ sys_config: novo }) });
const out = await p.json();
console.log(p.ok ? '✓ gravado. cadencia agora: ' + JSON.stringify(out?.[0]?.sys_config?.cadencia) : '⚠️ ERRO: ' + JSON.stringify(out).slice(0, 300));
