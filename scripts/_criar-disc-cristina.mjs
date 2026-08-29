/**
 * Cria a colaboradora CRISTINA LÚCIA PEIXOTO PETRUCCI DIAS no tenant `macae`
 * (Secretaria Municipal, 44b632ae…) e importa o DISC dela da planilha CISv2.
 *
 *   node scripts/_criar-disc-cristina.mjs --telefone=2299xxxxxxx        # dry-run
 *   node scripts/_criar-disc-cristina.mjs --telefone=2299xxxxxxx --apply
 *   node scripts/_criar-disc-cristina.mjs --sem-telefone --apply        # cria sem WhatsApp
 *
 * Garantias:
 *  - só cria se NÃO existir ninguém com esse e-mail no tenant (insert é abortado senão);
 *  - o DISC é gravado no MESMO insert (não há update sobrescrevendo nada);
 *  - dry-run por padrão: sem --apply, nada é escrito.
 */
export {};
process.loadEnvFile('.env.local');
const ExcelJS = (await import('exceljs')).default;
const pg = (await import('pg')).default;

const APPLY = process.argv.includes('--apply');
const SEM_TEL = process.argv.includes('--sem-telefone');
const telArg = (process.argv.find(a => a.startsWith('--telefone=')) || '').split('=')[1];
const EMP = '44b632ae-b7b9-440d-bc74-92cead889d52';
const EMAIL = 'crispetruccidias@gmail.com';
const NOME = 'Cristina Lúcia Peixoto Petrucci Dias';
const CARGO = 'Diretor(a) Escolar';       // único cargo do tenant (104/104)
const GESTOR = 'Samuel Protetti';         // padrão do tenant (103/104)

// --- telefone: E.164 sem '+', padrão do tenant (55 + DDD + número) ---
function toE164(bruto) {
  const d = String(bruto).replace(/\D/g, '');
  const comDDI = d.startsWith('55') ? d : `55${d}`;
  if (comDDI.length < 12 || comDDI.length > 13) {
    throw new Error(`telefone com ${comDDI.length} dígitos (esperado 12 ou 13): ${comDDI}`);
  }
  return comDDI;
}
if (!telArg && !SEM_TEL) {
  console.error('ERRO: informe --telefone=... ou --sem-telefone (o tenant loga por WhatsApp).');
  process.exit(1);
}
const telefone = telArg ? toE164(telArg) : null;

// --- planilha: linha da Cristina ---
const num = (v) => { const n = Number(v?.result ?? v); return Number.isFinite(n) ? n : null; };
const R = (v) => { const n = num(v); return n == null ? null : Math.round(n); };
const R1 = (v) => { const n = num(v); return n == null ? null : Math.round(n * 10) / 10; };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/rdnav/Downloads/PERFIL COMPORTAMENTAL - CISv2.xlsx');
const ws = wb.worksheets[0];
let p = null;
ws.eachRow((row, n) => {
  if (n === 1) return;
  const email = (row.getCell(2).value?.text || row.getCell(2).value || '').toString().trim().toLowerCase();
  if (email !== EMAIL) return;
  const g = (c) => row.getCell(c).value;
  if (p) throw new Error('mais de uma linha com esse e-mail na planilha — dedup manual necessário');
  p = {
    linha: n, perfil: (g(5) ?? '').toString().trim(),
    d_natural: R(g(6)), i_natural: R(g(7)), s_natural: R(g(8)), c_natural: R(g(9)),
    d_adaptado: R(g(10)), i_adaptado: R(g(11)), s_adaptado: R(g(12)), c_adaptado: R(g(13)),
    lid_executivo: R1(g(14)), lid_motivador: R1(g(15)), lid_metodico: R(g(16)), lid_sistematico: R(g(17)),
    valores: { aesthetic: num(g(18)), economic: num(g(19)), political: num(g(20)), religious: num(g(21)), social: num(g(22)), theoretical: num(g(23)) },
    comp_ousadia: R(g(24)), comp_comando: R(g(25)), comp_objetividade: R(g(26)), comp_assertividade: R(g(27)),
    comp_persuasao: R(g(28)), comp_extroversao: R(g(29)), comp_entusiasmo: R(g(30)), comp_sociabilidade: R(g(31)),
    comp_empatia: R(g(32)), comp_paciencia: R(g(33)), comp_persistencia: R(g(34)), comp_planejamento: R(g(35)),
    comp_organizacao: R(g(36)), comp_detalhismo: R(g(37)), comp_prudencia: R(g(38)), comp_concentracao: R(g(39)),
  };
});
if (!p) throw new Error(`e-mail ${EMAIL} não encontrado na planilha`);

// consistência: perfil_dominante tem que bater com o fator natural mais alto
const nat = { D: p.d_natural, I: p.i_natural, S: p.s_natural, C: p.c_natural };
const maior = Object.entries(nat).sort((a, b) => b[1] - a[1])[0][0];
if (p.perfil[0] !== maior) throw new Error(`inconsistência: perfil=${p.perfil} mas maior natural=${maior}`);

console.log(`planilha linha ${p.linha} · perfil=${p.perfil} · nat D/I/S/C=${p.d_natural}/${p.i_natural}/${p.s_natural}/${p.c_natural} · adapt=${p.d_adaptado}/${p.i_adaptado}/${p.s_adaptado}/${p.c_adaptado}`);
console.log(`telefone: ${telefone ?? '(nenhum — login_por_whatsapp=false)'}`);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  // guard 1: e-mail já existe em QUALQUER tenant?
  const { rows: dup } = await c.query('select id, empresa_id, nome_completo from colaboradores where lower(email)=$1', [EMAIL]);
  if (dup.length) { console.error('ABORTA — e-mail já cadastrado:', dup); process.exit(1); }

  // guard 2: homônimo no tenant?
  const { rows: hom } = await c.query(
    `select id, nome_completo, email from colaboradores
     where empresa_id=$1 and unaccent(lower(nome_completo)) like '%petrucci%'`, [EMP]);
  if (hom.length) { console.error('ABORTA — possível homônimo no tenant:', hom); process.exit(1); }

  const set = {
    empresa_id: EMP, email: EMAIL, nome_completo: NOME, cargo: CARGO, gestor_nome: GESTOR,
    role: 'colaborador', login_por_whatsapp: !!telefone, telefone,
    perfil_dominante: p.perfil, mapeamento_em: new Date().toISOString(),
    disc_resultados: JSON.stringify({
      fonte: 'import_planilha_cisv2', match_via: 'criado_manual',
      valores: p.valores, importado_em: new Date().toISOString(),
    }),
  };
  for (const k of ['d_natural','i_natural','s_natural','c_natural','d_adaptado','i_adaptado','s_adaptado','c_adaptado',
    'lid_executivo','lid_motivador','lid_metodico','lid_sistematico',
    'comp_ousadia','comp_comando','comp_objetividade','comp_assertividade','comp_persuasao','comp_extroversao',
    'comp_entusiasmo','comp_sociabilidade','comp_empatia','comp_paciencia','comp_persistencia','comp_planejamento',
    'comp_organizacao','comp_detalhismo','comp_prudencia','comp_concentracao']) set[k] = p[k];

  if (!APPLY) {
    console.log('\n(dry-run — nada escrito). Campos que seriam gravados:');
    console.log(set);
    process.exit(0);
  }
  const keys = Object.keys(set);
  const q = `insert into colaboradores (${keys.map(k => `"${k}"`).join(', ')})
             values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`;
  const { rows } = await c.query(q, keys.map(k => set[k]));
  console.log(`\n✓ criada — id ${rows[0].id}`);
} finally {
  await c.end();
}
