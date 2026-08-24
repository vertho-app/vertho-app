/**
 * Regenera `config/error-nao-checado-allowlist.json` a partir do estado ATUAL do
 * repositório (guard E11).
 *
 * ⚠️ A lista só pode ENCOLHER. Este script não julga: ele carimba o que existe
 * hoje. Rodá-lo depois de INTRODUZIR um site novo silencia o guard — que é
 * exatamente o bug que ele existe para pegar. O uso legítimo é um só: você
 * CORRIGIU sites e quer tirá-los da lista. Confira o diff antes de commitar; se
 * o total subiu, você está silenciando dívida nova (o script avisa).
 *
 * Uso:  npx tsx scripts/_atualizar-allowlist-erro.ts
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { varrerRepo } from '../tests/helpers/supabase-erro-ast';

const CAMINHO = 'config/error-nao-checado-allowlist.json';

const achados = varrerRepo();

/**
 * `{ arquivo: { fingerprint: quantas vezes } }`.
 *
 * A contagem por fingerprint não é redundante com o fingerprint: dois sites
 * IDÊNTICOS no mesmo arquivo (o mesmo `const { data } = await sb.from('x')
 * .select('id')` repetido) colapsam no mesmo hash. Sem o número, acrescentar uma
 * terceira cópia passaria batido — a dívida cresceria dentro de uma entrada já
 * aprovada. Com ele, cada cópia nova é um achado.
 */
const porArquivo: Record<string, Record<string, number>> = {};
for (const a of achados) {
  const hash = a.fingerprint.split('::')[1];
  const alvo = (porArquivo[a.file] ||= {});
  alvo[hash] = (alvo[hash] || 0) + 1;
}
for (const f of Object.keys(porArquivo)) {
  porArquivo[f] = Object.fromEntries(Object.entries(porArquivo[f]).sort(([a], [b]) => a.localeCompare(b)));
}

const anterior = existsSync(CAMINHO) ? JSON.parse(readFileSync(CAMINHO, 'utf-8')) : null;
// Compara com o TOTAL declarado antes — não com a contagem de chaves, que é
// outra métrica (dois sites idênticos dividem uma chave só).
const antes: number = anterior?.total_declarado ?? 0;

const conf = {
  description:
    'E11 (auditoria 22/08) — estoque CONGELADO da classe "error não checado": o supabase-js retorna ' +
    '{ data, error } e não lança, então quem ignora o retorno vira falha silenciosa. Chave = arquivo, ' +
    'valor = fingerprints (hash do trecho normalizado). Por fingerprint e não por contagem porque contagem ' +
    'deixa a dívida TROCAR DE LUGAR sem o guard ver (modo de falha documentado no E8). Esta lista SÓ ENCOLHE. ' +
    'Guard: tests/unit/security/error-nao-checado-guard.test.ts',
  total_declarado: achados.length,
  gerado_em: '2026-08-24',
  allowlist: Object.fromEntries(Object.entries(porArquivo).sort(([a], [b]) => a.localeCompare(b))),
};

writeFileSync(CAMINHO, JSON.stringify(conf, null, 2) + '\n');

console.log(`arquivos: ${Object.keys(porArquivo).length}`);
console.log(`sites   : ${achados.length}${anterior ? ` (antes: ${antes}, ${achados.length - antes >= 0 ? '+' : ''}${achados.length - antes})` : ''}`);
if (anterior && achados.length > antes) {
  console.log('\n🔴 A LISTA CRESCEU. Isto silencia dívida nova — confira o diff antes de commitar.');
}
