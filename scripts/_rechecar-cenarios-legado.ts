/**
 * Re-checa sob o Terra os cenários cuja nota veio do auditor LEGADO (mig 228).
 *
 * Põe a base inteira numa régua só. Hoje 110 de 134 cenários carregam nota de um
 * auditor que não roda mais desde 22/07 — e a menor nota que ele deu na base
 * inteira foi **86**, ou seja, ele nunca reprovou nada. Enquanto essas notas
 * conviverem com as do Terra, `aprovado` de junho e `revisar` de agosto não
 * significam a mesma coisa, e nenhuma decisão de modelo no bloco E1 tem régua.
 *
 * Usa `checkCenarioIA3Core` — o caminho de PRODUÇÃO, com o escopo de tenant e a
 * persistência dele. Não escreve por fora.
 *
 * ⚠️ ESCREVE em dado de produção (`nota_check`, `status_check`, `checked_at`). A
 * mig 228 já copiou o parecer antigo para `*_legado`, então nada é perdido — mas
 * a expectativa medida é que a maioria caia de `aprovado` para `revisar`. Isso
 * não é o check quebrando: é a verdade alcançando o registro. Três famílias
 * independentes concordam que o acervo é elaborado demais.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_rechecar-cenarios-legado.ts
 *   LIMITE=5 ... para um ensaio curto antes do lote inteiro.
 */
import { setGlobalDispatcher, Agent } from 'undici';
import { createSupabaseAdmin } from '../lib/supabase';
import { checkCenarioIA3Core } from '../lib/ia3-cenarios';

setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));
const LIMITE = Number(process.env.LIMITE || 0);

async function main() {
  const sb = createSupabaseAdmin();
  let q = sb.from('banco_cenarios')
    .select('id, titulo, nota_check_legado, empresa_id')
    .not('nota_check_legado', 'is', null)
    .order('nota_check_legado', { ascending: false });
  const { data, error } = await q;
  if (error) { console.error('erro lendo cenários:', error.message); process.exit(1); }
  const alvos = (LIMITE ? (data || []).slice(0, LIMITE) : (data || [])) as any[];
  console.log(`re-checando ${alvos.length} cenário(s) sob o Terra (parecer legado já preservado)\n`);

  const antes: number[] = [], depois: number[] = [];
  let falhas = 0;
  for (const [i, cen] of alvos.entries()) {
    try {
      const r = await checkCenarioIA3Core(sb, { cenarioId: cen.id });
      if (!r.success || typeof r.nota !== 'number') {
        falhas++;
        console.log(`  ${String(i + 1).padStart(3)}/${alvos.length} ${String(cen.titulo).slice(0, 34).padEnd(36)} 🔴 ${String(r.error).slice(0, 40)}`);
        continue;
      }
      antes.push(cen.nota_check_legado); depois.push(r.nota);
      const seta = r.nota < cen.nota_check_legado ? '↓' : r.nota > cen.nota_check_legado ? '↑' : '=';
      console.log(`  ${String(i + 1).padStart(3)}/${alvos.length} ${String(cen.titulo).slice(0, 34).padEnd(36)} ${String(cen.nota_check_legado).padStart(3)} ${seta} ${String(r.nota).padStart(3)}  ${r.status}`);
    } catch (e: any) {
      falhas++;
      console.log(`  ${String(i + 1).padStart(3)}/${alvos.length} ${String(cen.titulo).slice(0, 34).padEnd(36)} 🔴 ${String(e?.message || e).slice(0, 40)}`);
    }
  }

  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
  const faixa = (v: number[]) => ({
    aprovado: v.filter((x) => x >= 90).length,
    ressalvas: v.filter((x) => x >= 80 && x < 90).length,
    revisar: v.filter((x) => x < 80).length,
  });
  const a = faixa(antes), d = faixa(depois);
  console.log(`\n── antes (auditor legado) ──  média ${media(antes).toFixed(1)} · aprovado ${a.aprovado} · ressalvas ${a.ressalvas} · revisar ${a.revisar}`);
  console.log(`── depois (Terra)          ──  média ${media(depois).toFixed(1)} · aprovado ${d.aprovado} · ressalvas ${d.ressalvas} · revisar ${d.revisar}`);
  console.log(`\n${falhas ? `⚠️ ${falhas} falha(s) — esses seguem com a nota legada em nota_check.` : '✅ nenhum erro'}`);
  console.log('A base passa a ter UMA régua. O parecer antigo continua em `*_legado` para explicar\n'
    + 'por que um cenário mudou de status — sem isso, a mudança pareceria arbitrária.');
  process.exit(0);
}

main();
