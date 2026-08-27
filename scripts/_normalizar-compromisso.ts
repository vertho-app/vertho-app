/**
 * Reclassifica `compromisso_proxima` nas conversas já gravadas: separa o TEXTO
 * do compromisso da ORIGEM dele.
 *
 * POR QUE (27/08/2026)
 * ────────────────────
 * O campo carregava três coisas — compromisso assumido pela pessoa, compromisso
 * proposto pelo mentor no fechamento, e uma meta-observação dizendo que não
 * houve nenhum. Os dois painéis de admin exibiam os três com o mesmo 🎯, e quem
 * lê é o RH: a explicação ocupava o lugar da promessa.
 *
 * Censo das 88 conversas concluídas: 52 vazias, 16 meta-observação, 20 reais.
 *
 * ⚠️ DETERMINÍSTICO, sem IA. O padrão da meta-observação é textual e claro
 * ("nenhum compromisso foi assumido", "proposto pela IA"), e chamar modelo para
 * reclassificar 88 linhas seria pagar por uma decisão que uma regex resolve —
 * com o risco extra de o modelo reescrever o compromisso real de alguém.
 *
 * O que ele NÃO faz: inventar origem para as 20 conversas com compromisso real.
 * Extrações anteriores a hoje não registraram quem assumiu, e chutar
 * 'colaborador' seria carimbar como promessa da pessoa algo que ninguém
 * verificou. Elas ficam com origem `null` = "não registrada", e a UI diz isso.
 *
 * USO
 *   npx tsx scripts/_normalizar-compromisso.ts [--executar]
 */
process.loadEnvFile('.env.local');

import { createClient } from '@supabase/supabase-js';
import { normalizarCompromisso } from '../lib/season-engine/compromisso';

const executar = process.argv.includes('--executar');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await sb.from('temporada_semana_progresso')
    .select('id, reflexao')
    .not('reflexao', 'is', null);
  if (error) throw new Error(`temporada_semana_progresso: ${error.message}`);

  const mudancas: { id: string; de: string; para: string; origem: any; reflexao: any }[] = [];
  for (const r of data || []) {
    const antes = typeof r.reflexao?.compromisso_proxima === 'string' ? r.reflexao.compromisso_proxima : '';
    if (!antes.trim()) continue;
    const copia = { ...r.reflexao };
    normalizarCompromisso(copia);
    // Só grava quando o TEXTO muda. As linhas com compromisso real apenas
    // ganhariam `compromisso_origem: null` explícito — e `rotuloOrigemCompromisso`
    // já trata ausente e null igual ("origem não registrada"). Escrever 20 linhas
    // para não mudar nada é ruído no dado e no log de auditoria.
    if (copia.compromisso_proxima !== antes) {
      mudancas.push({ id: r.id, de: antes, para: copia.compromisso_proxima, origem: copia.compromisso_origem, reflexao: copia });
    }
  }

  console.log(`linhas com compromisso preenchido: ${(data || []).filter((r: any) => String(r.reflexao?.compromisso_proxima || '').trim()).length}`);
  console.log(`a reclassificar: ${mudancas.length}`);
  for (const m of mudancas.slice(0, 25)) {
    console.log(`\n· ${m.id}`);
    console.log(`  DE  : ${m.de.slice(0, 120)}`);
    console.log(`  PARA: ${m.para ? m.para.slice(0, 120) : '(vazio)'} · origem=${m.origem ?? 'não registrada'}`);
  }
  if (mudancas.length > 25) console.log(`\n… e mais ${mudancas.length - 25}`);
  if (!executar) { console.log('\nSem --executar, nada foi gravado.'); return; }

  let ok = 0, falhou = 0;
  for (const m of mudancas) {
    const { error: err } = await sb.from('temporada_semana_progresso')
      .update({ reflexao: m.reflexao }).eq('id', m.id);
    if (err) { falhou++; console.error(`  ERRO ${m.id}: ${err.message}`); continue; }
    ok++;
  }
  console.log(`\nreclassificados: ${ok} · falhas: ${falhou}`);
  if (falhou) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
