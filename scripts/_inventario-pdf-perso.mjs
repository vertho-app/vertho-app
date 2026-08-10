/**
 * Inventário (SÓ LEITURA) dos PDFs personalizados no Storage — F9 da auditoria.
 *
 * Fechar a porta não apaga o que já saiu por ela: a chave de cache é
 * `final/perso/<contentId>/<empresaId>/<arquetipo>-<assinatura>.pdf`, então um
 * PDF gerado cross-tenant continua servível por URL pública depois do fix.
 * Cross-tenant = o `<empresaId>` da chave difere do dono do `<contentId>`
 * (`micro_conteudos.empresa_id`). Conteúdo global (`empresa_id` nulo) não conta.
 *
 * Uso: node --env-file=.env.local scripts/_inventario-pdf-perso.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SRK) {
  console.error('Faltam envs. Rode com: node --env-file=.env.local scripts/_inventario-pdf-perso.mjs');
  process.exit(1);
}

const sb = createClient(URL_BASE, SRK, { auth: { persistSession: false } });

async function listar(prefixo) {
  const out = [];
  for (let off = 0; ; off += 100) {
    const { data, error } = await sb.storage.from('conteudos').list(prefixo, { limit: 100, offset: off });
    if (error) { console.error(`[list ${prefixo}]`, error.message); break; }
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

const conteudos = await listar('final/perso');
console.log(`conteúdos com PDF personalizado em cache: ${conteudos.length}`);
if (!conteudos.length) process.exit(0);

const { data: mcs, error: errMc } = await sb.from('micro_conteudos').select('id, empresa_id');
if (errMc) { console.error('micro_conteudos:', errMc.message); process.exit(1); }
const donoDe = Object.fromEntries((mcs || []).map((m) => [m.id, m.empresa_id]));

const { data: emps } = await sb.from('empresas').select('id, nome');
const nomeDe = Object.fromEntries((emps || []).map((e) => [e.id, e.nome]));

let arquivos = 0, pastas = 0;
const cruzados = [];
for (const c of conteudos) {
  for (const p of await listar(`final/perso/${c.name}`)) {
    pastas++;
    const itens = await listar(`final/perso/${c.name}/${p.name}`);
    arquivos += itens.length;
    const dono = donoDe[c.name];
    if (dono && p.name !== 'global' && p.name !== dono) {
      cruzados.push({ conteudo: c.name, dono, pasta: p.name, itens: itens.map((i) => i.name) });
    }
  }
}

console.log(`pastas (conteúdo × empresa): ${pastas} · arquivos: ${arquivos}`);
console.log(`\nCROSS-TENANT — conteúdo de um tenant renderizado na pasta de outro: ${cruzados.length}`);
for (const x of cruzados) {
  console.log(`  ${x.conteudo}  dono=${nomeDe[x.dono] || x.dono}  →  pasta=${nomeDe[x.pasta] || x.pasta}`);
  for (const i of x.itens) console.log(`      final/perso/${x.conteudo}/${x.pasta}/${i}`);
}
if (!cruzados.length) console.log('  (nenhum — nada a remover)');
