/* eslint-disable */
// INTERNO/descartável: prova o history caching fim-a-fim como os fluxos de chat
// vão usar (cacheHistory + userSuffix volátil por turno). Espera: turno 1 só
// write; turnos 2-3 cache_read crescente. uso: npx tsx scripts/_probe-cache-history.ts
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat } from '@/actions/ai-client';

const TK = 'probe_cache_hist';
// system grande o suficiente p/ passar o mínimo cacheável do sonnet-4-6 (2048 tok)
const SYSTEM = 'Você é um tutor socrático de teste. Responda SEMPRE com uma única frase curta.\n\n' +
  ('CONTEXTO DE PREENCHIMENTO (ignorar no conteúdo, serve só para volume do prefixo): ' +
    'desenvolvimento de competências, coordenação pedagógica, cultura formativa, autocuidado. ').repeat(120);

async function main() {
  const sb = createSupabaseAdmin();
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  for (let t = 1; t <= 3; t++) {
    msgs.push({ role: 'user', content: `Turno ${t}: cite uma cor diferente das anteriores.` });
    const r = await callAIChat(SYSTEM, msgs, {}, 100, {
      taskKey: TK, cacheHistory: true, userSuffix: `INSTRUÇÃO VOLÁTIL DO TURNO ${t}: seja breve.`,
    } as any);
    msgs.push({ role: 'assistant', content: r });
    const { data: led } = await sb.from('ia_usage_log')
      .select('input_tokens, cache_read_tokens, cache_write_tokens')
      .eq('feature', TK).order('created_at', { ascending: false }).limit(1).maybeSingle();
    console.log(`turno ${t}: fresh=${led?.input_tokens} read=${led?.cache_read_tokens ?? 0} write=${led?.cache_write_tokens ?? 0} | "${r.slice(0, 60)}"`);
  }
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
