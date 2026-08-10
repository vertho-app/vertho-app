/**
 * Batches da Anthropic que ficaram órfãos — submetidos, nunca colhidos.
 *
 * Existe porque `submitClaudeBatch` faz o polling INLINE: se a lambda morre
 * (timeout, deploy, erro não tratado), o batch **continua rodando na Anthropic**.
 * Ele foi pago, produz o resultado e, sem o `batch_id` fora da memória, ninguém
 * mais consegue buscá-lo. A tabela `ia_batches` (mig 208) guarda esse id no
 * instante da submissão; este script é quem faz a pergunta.
 *
 * Só LÊ. Mostra o estado real na Anthropic ao lado do estado local — porque um
 * rastro parado em 'submetido' pode significar duas coisas bem diferentes: o
 * batch ainda está processando, ou ele terminou e o resultado está lá esperando.
 *
 * Uso: node --env-file=.env.local scripts/_batches-orfaos.mjs [horas]
 */
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const HORAS = Number(process.argv[2] || 2);
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY_IA = process.env.ANTHROPIC_API_KEY;
if (!URL_BASE || !SRK) {
  console.error('Rode com: node --env-file=.env.local scripts/_batches-orfaos.mjs');
  process.exit(1);
}

async function main() {
  const sb = createClient(URL_BASE, SRK, { auth: { persistSession: false } });
  const corte = new Date(Date.now() - HORAS * 3600_000).toISOString();

  const { data, error } = await sb.from('ia_batches')
    .select('batch_id, feature, itens, criado_em, empresa_id')
    .eq('status', 'submetido')
    .lt('criado_em', corte)
    .order('criado_em');

  if (error) { console.error('ia_batches:', error.message); return 1; }
  if (!data?.length) {
    console.log(`Nenhum batch submetido há mais de ${HORAS}h sem conclusão. ✅`);
    return 0;
  }

  console.log(`${data.length} batch(es) submetido(s) há mais de ${HORAS}h e ainda sem conclusão:\n`);
  const ia = KEY_IA ? new Anthropic({ apiKey: KEY_IA }) : null;

  for (const b of data) {
    let naAnthropic = KEY_IA ? '?' : '(sem ANTHROPIC_API_KEY: não consultado)';
    if (ia) {
      try {
        const s = await ia.messages.batches.retrieve(b.batch_id);
        const c = s.request_counts || {};
        naAnthropic = `${s.processing_status} · ok:${c.succeeded ?? 0} erro:${c.errored ?? 0} exp:${c.expired ?? 0}`;
      } catch (e) {
        naAnthropic = `não encontrado (${String(e?.message || e).slice(0, 60)})`;
      }
    }
    console.log(`  ${b.batch_id}`);
    console.log(`    feature=${b.feature || '(sem etiqueta)'} · itens=${b.itens} · submetido=${b.criado_em}`);
    console.log(`    na Anthropic: ${naAnthropic}`);
    console.log(`    → se 'ended', o resultado ainda pode ser colhido com fetchClaudeBatchResults('${b.batch_id}')\n`);
  }
  return 0;
}

// ⚠️ O resultado é impresso ANTES da saída — leia o stdout, não o exit code.
// Sem `process.exit`, o keep-alive do cliente HTTP do supabase-js segura o
// processo indefinidamente (medido: trava até o timeout). Com ele, o Node no
// Windows imprime `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` ao
// derrubar o socket ainda aberto — ruído do runtime no encerramento, depois do
// trabalho todo feito. Preferi um script que termina e resmunga a um que
// pendura.
const code = await main();
process.exit(code);
