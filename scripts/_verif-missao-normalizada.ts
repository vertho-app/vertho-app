/**
 * Verificação read-only: roda o normalizador REAL sobre as trilhas do banco e conta
 * quantas missões de semana de aplicação ainda chegariam à tela como JSON cru.
 *
 * Existe porque o teste unitário prova o normalizador contra um fixture; só o banco
 * prova contra os 34 payloads que estão de fato em produção, cada um truncado num
 * ponto diferente. Não escreve nada.
 *
 *   npx tsx --env-file=.env.local scripts/_verif-missao-normalizada.ts [slug]
 */
import { Client } from 'pg';
import { normalizeTemporadaPlano } from '../lib/season-engine/normalize-temporada-plano';

const SLUG = process.argv[2] || null;

/** O que a tela mostraria: cru = a pessoa vê chaves de JSON / cerca de código. */
function pareceCru(texto: unknown): boolean {
  const t = String(texto || '');
  return t.includes('"missao_texto"') || t.includes('```') || t.trimStart().startsWith('{');
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const { rows } = await db.query(
    `select e.slug, t.id, t.temporada_plano
       from trilhas t join empresas e on e.id = t.empresa_id
      where t.temporada_plano is not null ${SLUG ? 'and e.slug = $1' : ''}`,
    SLUG ? [SLUG] : [],
  );

  const porTenant = new Map<string, { total: number; cruAntes: number; cruDepois: number; exemplo?: string }>();

  for (const r of rows) {
    const antes = Array.isArray(r.temporada_plano) ? r.temporada_plano : [];
    const depois = normalizeTemporadaPlano(antes);

    for (const sem of antes.filter((s: any) => s?.tipo === 'aplicacao' && s?.missao?.texto)) {
      const acc = porTenant.get(r.slug) || { total: 0, cruAntes: 0, cruDepois: 0 };
      acc.total++;
      if (pareceCru(sem.missao.texto)) acc.cruAntes++;

      const norm = depois.find((s: any) => s?.semana === sem.semana);
      if (pareceCru(norm?.missao?.texto)) {
        acc.cruDepois++;
        if (!acc.exemplo) acc.exemplo = `trilha ${r.id} · semana ${sem.semana}`;
      }
      porTenant.set(r.slug, acc);
    }
  }

  let restam = 0;
  console.log('tenant            missões  cru ANTES  cru DEPOIS');
  for (const [slug, a] of [...porTenant].sort()) {
    restam += a.cruDepois;
    console.log(
      `${slug.padEnd(18)}${String(a.total).padStart(7)}${String(a.cruAntes).padStart(11)}${String(a.cruDepois).padStart(12)}` +
      (a.exemplo ? `   ← ${a.exemplo}` : ''),
    );
  }
  console.log(restam === 0 ? '\nOK: nenhuma missão chega crua à tela.' : `\nFALHA: ${restam} missões ainda chegariam cruas.`);

  await db.end();
  process.exit(restam === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
