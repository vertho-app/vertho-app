/**
 * Cria no tenant `macae` (Secretaria Municipal, 44b632ae…) as pessoas da planilha CISv2
 * que NÃO têm cadastro, já com o DISC no mesmo INSERT.
 *
 *   node scripts/_criar-disc-nao-cadastrados-macae.mjs            # dry-run (default)
 *   node scripts/_criar-disc-nao-cadastrados-macae.mjs --apply
 *   node scripts/_criar-disc-nao-cadastrados-macae.mjs --apply --forcar=email1,email2
 *
 * Três baldes:
 *   JA_EXISTE  — casou por e-mail exato, ou por nome normalizado idêntico (o _import-disc-macae.mjs cuida)
 *   SUSPEITA   — nome PARCIAL bate com alguém do tenant (ex.: planilha "LIZANDRA" × base
 *                "Lizandra Souza da Silva"). NÃO cria sozinho: criaria duplicata da mesma pessoa.
 *                Liberar caso a caso com --forcar=<email>.
 *   CRIAR      — nenhum vestígio no tenant → insert.
 *
 * Sem telefone (planilha CISv2 não traz) → login_por_whatsapp=false. Autorizado pelo dono 28/07.
 */
export {};
process.loadEnvFile('.env.local');
const ExcelJS = (await import('exceljs')).default;
const pg = (await import('pg')).default;

const APPLY = process.argv.includes('--apply');
const FORCAR = new Set(((process.argv.find(a => a.startsWith('--forcar=')) || '').split('=')[1] || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
const EMP = '44b632ae-b7b9-440d-bc74-92cead889d52';
const CARGO = 'Diretor(a) Escolar';   // único cargo do tenant
const GESTOR = 'Samuel Protetti';     // padrão do tenant (103/104)

const norm = s => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const toks = s => norm(s).split(' ').filter(t => t && !STOP.has(t));
const num = (v) => { const n = Number(v?.result ?? v); return Number.isFinite(n) ? n : null; };
const R = (v) => { const n = num(v); return n == null ? null : Math.round(n); };
const R1 = (v) => { const n = num(v); return n == null ? null : Math.round(n * 10) / 10; };
// Title Case preservando acento (a planilha tem nomes em CAIXA ALTA)
const titulo = s => s.trim().toLowerCase().split(/\s+/)
  .map(w => STOP.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const CORE = ['d_natural','i_natural','s_natural','c_natural','d_adaptado','i_adaptado','s_adaptado','c_adaptado',
  'lid_executivo','lid_motivador','lid_metodico','lid_sistematico'];
const COMP = ['comp_ousadia','comp_comando','comp_objetividade','comp_assertividade','comp_persuasao','comp_extroversao',
  'comp_entusiasmo','comp_sociabilidade','comp_empatia','comp_paciencia','comp_persistencia','comp_planejamento',
  'comp_organizacao','comp_detalhismo','comp_prudencia','comp_concentracao'];

// ---------- planilha ----------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/rdnav/Downloads/PERFIL COMPORTAMENTAL - CISv2.xlsx');
const ws = wb.worksheets[0];
const all = [];
ws.eachRow((row, n) => {
  if (n === 1) return;
  const g = (c) => row.getCell(c).value;
  const nome = (g(1) ?? '').toString().trim(); if (!nome) return;
  const email = (g(2)?.text || g(2) || '').toString().trim().toLowerCase();
  const end = g(40); const endT = end ? new Date(end.result ?? end).getTime() : Infinity;
  const p = { nome, email, endT, ord: n, perfil: (g(5) ?? '').toString().trim(),
    valores: { aesthetic: num(g(18)), economic: num(g(19)), political: num(g(20)),
               religious: num(g(21)), social: num(g(22)), theoretical: num(g(23)) } };
  [...CORE.slice(0, 8)].forEach((k, i) => { p[k] = R(g(6 + i)); });
  p.lid_executivo = R1(g(14)); p.lid_motivador = R1(g(15)); p.lid_metodico = R(g(16)); p.lid_sistematico = R(g(17));
  COMP.forEach((k, i) => { p[k] = R(g(24 + i)); });
  all.push(p);
});
// DEDUP por pessoa (email||nome): manter o MAIS ANTIGO — mesma regra do _import-disc-macae.mjs
const byKey = {};
for (const r of all) { const k = r.email || norm(r.nome); (byKey[k] = byKey[k] || []).push(r); }
const pessoas = Object.values(byKey).map(gr => gr.sort((a, b) => (a.endT - b.endT) || (a.ord - b.ord))[0]);
console.log(`planilha: ${all.length} linhas → ${pessoas.length} pessoas após dedup`);

// ---------- tenant ----------
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const criados = [];
try {
  const { rows: colabs } = await c.query(
    'select id, lower(email) email, nome_completo from colaboradores where empresa_id=$1', [EMP]);
  const { rows: globais } = await c.query('select lower(email) email, empresa_id from colaboradores');
  const emailGlobal = new Map(globais.filter(r => r.email).map(r => [r.email, r.empresa_id]));
  const porEmail = new Map(colabs.filter(r => r.email).map(r => [r.email, r]));
  const porNome = new Map();
  for (const r of colabs) { const k = norm(r.nome_completo); if (k) (porNome.get(k) || porNome.set(k, []).get(k)).push(r); }

  const baldes = { JA_EXISTE: [], SUSPEITA: [], CRIAR: [] };
  for (const p of pessoas) {
    if (porEmail.has(p.email)) { baldes.JA_EXISTE.push({ p, via: 'email' }); continue; }
    if (porNome.has(norm(p.nome))) { baldes.JA_EXISTE.push({ p, via: 'nome exato' }); continue; }
    // nome PARCIAL: todos os tokens de um lado contidos no outro (≥2 tokens, ou 1 token raro)
    const tp = toks(p.nome);
    const parciais = colabs.filter(r => {
      const tr = toks(r.nome_completo);
      if (!tp.length || !tr.length) return false;
      const contido = tp.every(t => tr.includes(t)) || tr.every(t => tp.includes(t));
      if (contido) return true;
      // primeiro + último nome iguais (nome do meio divergente)
      return tp.length > 1 && tr.length > 1 && tp[0] === tr[0] && tp[tp.length - 1] === tr[tr.length - 1];
    });
    if (parciais.length && !FORCAR.has(p.email)) { baldes.SUSPEITA.push({ p, parciais }); continue; }
    if (emailGlobal.has(p.email)) { baldes.SUSPEITA.push({ p, parciais: [{ nome_completo: `(e-mail existe em outro tenant: ${emailGlobal.get(p.email)})` }] }); continue; }
    baldes.CRIAR.push({ p });
  }

  console.log(`\nJA_EXISTE: ${baldes.JA_EXISTE.length} · SUSPEITA: ${baldes.SUSPEITA.length} · CRIAR: ${baldes.CRIAR.length}\n`);
  for (const { p, parciais } of baldes.SUSPEITA) {
    console.log(`SUSPEITA  ${p.nome} <${p.email}>`);
    for (const r of parciais) console.log(`             ↳ base: ${r.nome_completo}${r.email ? ` <${r.email}>` : ''}`);
  }
  console.log('');
  for (const { p } of baldes.CRIAR) {
    const nat = { D: p.d_natural, I: p.i_natural, S: p.s_natural, C: p.c_natural };
    const maior = Object.entries(nat).sort((a, b) => b[1] - a[1])[0][0];
    const ok = p.perfil[0] === maior ? '✔' : `✗ (maior natural=${maior})`;
    console.log(`${APPLY ? 'CRIA' : 'DRY '}  ${titulo(p.nome)} <${p.email}> · ${p.perfil} ${ok} · ${p.d_natural}/${p.i_natural}/${p.s_natural}/${p.c_natural}`);
    if (p.perfil[0] !== maior) throw new Error(`inconsistência em ${p.nome} — abortado antes de escrever`);
    if (!APPLY) continue;
    const set = {
      empresa_id: EMP, email: p.email, nome_completo: titulo(p.nome), cargo: CARGO, gestor_nome: GESTOR,
      role: 'colaborador', login_por_whatsapp: false, telefone: null,
      perfil_dominante: p.perfil, mapeamento_em: new Date().toISOString(),
      disc_resultados: JSON.stringify({ fonte: 'import_planilha_cisv2', match_via: 'criado_manual',
        valores: p.valores, importado_em: new Date().toISOString() }),
    };
    for (const k of [...CORE, ...COMP]) set[k] = p[k];
    const keys = Object.keys(set);
    // ON CONFLICT DO NOTHING: se um índice único de e-mail existir, corrida não vira duplicata
    const q = `insert into colaboradores (${keys.map(k => `"${k}"`).join(', ')})
               values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`;
    const { rows } = await c.query(q, keys.map(k => set[k]));
    criados.push({ nome: set.nome_completo, email: set.email, id: rows[0].id });
    console.log(`        → ${rows[0].id}`);
  }
  console.log(APPLY ? `\n✓ criados: ${criados.length}` : `\n(dry-run — nada escrito)`);
} finally {
  await c.end();
}
