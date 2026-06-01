import fs from 'fs';
import path from 'path';

function walk(d) {
  let r = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) r = r.concat(walk(p));
    else if (e.name.endsWith('.ts')) r.push(p);
  }
  return r;
}

const files = [...walk('app'), ...walk('actions')].filter(f => {
  const s = fs.readFileSync(f, 'utf8');
  return /requireAdmin(Supabase|Action)/.test(s) && !f.includes('admin-supabase') && !f.includes('action-context');
});

const READ = /^(load|listar|list|get|ver|status|carregar|fetch|buscar|consultar|diagnose|obter)/i;
const GUARD = /require(AdminSupabase|AdminAction|PermissionAction)\(/;
const GUARD_WITH_ARG = /require(AdminSupabase|AdminAction|PermissionAction)\(\s*['"]/;

const out = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  // Particiona em funções exportadas (boundary = próxima 'export async function').
  const fns = [];
  let cur = null;
  for (let i = 0; i < src.length; i++) {
    const m = src[i].match(/export async function ([a-zA-Z0-9_]+)/);
    if (m) { cur = { name: m[1], line: i + 1, guards: [], anyArg: false }; fns.push(cur); }
    if (cur && GUARD.test(src[i])) {
      cur.guards.push(i + 1);
      if (GUARD_WITH_ARG.test(src[i])) cur.anyArg = true;
    }
  }
  for (const fn of fns) {
    if (fn.guards.length === 0) continue;       // sem gate (helper/colaborador-facing) — fora do escopo
    if (READ.test(fn.name)) continue;           // leitura — default admin.access ok
    if (fn.anyArg) continue;                    // já tem ≥1 gate com permissão — protegida
    out.push(`${f.split(path.sep).join('/')} :: ${fn.name} @${fn.line}`);
  }
}
console.log('ESCRITAS sem NENHUM gate com permissao:', out.length);
out.forEach(x => console.log('  ' + x));
