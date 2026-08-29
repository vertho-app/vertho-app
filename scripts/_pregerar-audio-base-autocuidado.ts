/* eslint-disable */
/**
 * Passo 4 do gap de áudio de Autocuidado (Ibipeba): gera o MP3-BASE dos áudios core.
 *
 * Roda pela rota `/api/internal/pregerar-podcast` porque o encoder MP3 (`lamejs`) NÃO
 * funciona no tsx — o TTS precisa do runtime Next (pegadinha 4 do docs/FMEA-PIPELINE.md).
 * Este script só orquestra: lista os áudios sem MP3 e chama a rota para cada um.
 *
 * Por que o BASE importa mesmo havendo TTS on-demand: a tela pede o áudio personalizado
 * (com "Olá, {nome}") e o sintetiza na hora se não houver cache — mas se esse TTS falhar,
 * o único fallback é o MP3-base. Sem base, a pessoa recebe 404 "Podcast ainda não gerado".
 * O pré-aquecimento POR COLABORADOR (~150 pares) é outra etapa, para perto da abertura
 * da semana 5 — antes disso a trilha ainda pode mudar e o cache viraria lixo.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_pregerar-audio-base-autocuidado.ts \
 *        [--base https://app.vertho.ai] [--um]
 */
import { createSupabaseAdmin } from '@/lib/supabase';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const argBase = process.argv.indexOf('--base');
const BASE = (argBase > -1 && process.argv[argBase + 1]) || process.env.NEXT_PUBLIC_APP_URL || 'https://app.vertho.ai';
const SEGREDO = process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  if (!SEGREDO) throw new Error('INTERNAL_API_KEY (ou service-role) ausente no .env.local');
  const sb = createSupabaseAdmin();

  const { data: audios } = await sb.from('micro_conteudos')
    .select('id, cargo, descritor, url, storage_path')
    .eq('empresa_id', EMP).eq('formato', 'audio').is('kit_id', null)
    .ilike('competencia', '%autocuidado%').eq('ativo', true);

  const pendentes = (audios || []).filter((a: any) => !a.url && !a.storage_path);
  const lista = process.argv.includes('--um') ? pendentes.slice(0, 1) : pendentes;
  console.log(`${audios?.length || 0} áudio(s) ativos · ${pendentes.length} sem MP3 · processando ${lista.length}`);
  console.log(`rota: ${BASE}/api/internal/pregerar-podcast\n`);

  let ok = 0, erros = 0;
  for (const a of lista) {
    process.stdout.write(`• ${String(a.cargo).padEnd(24)} | ${String(a.descritor).padEnd(28)} ... `);
    const t0 = Date.now();
    try {
      const r = await fetch(`${BASE}/api/internal/pregerar-podcast`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': SEGREDO },
        body: JSON.stringify({ id: a.id }),   // sem colaboradorId = áudio BASE
      });
      const j: any = await r.json().catch(() => ({}));
      const s = Math.round((Date.now() - t0) / 1000);
      if (!r.ok || j?.error) { erros++; console.log(`ERRO ${r.status}: ${j?.error || '?'} (${s}s)`); }
      else { ok++; console.log(`OK ${Math.round((j.bytes || 0) / 1024)}KB (${s}s)`); }
    } catch (e: any) {
      erros++;
      console.log(`EXCEÇÃO: ${e?.message} (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }
  console.log(`\nMP3-base gerado: ${ok} · erros: ${erros}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
