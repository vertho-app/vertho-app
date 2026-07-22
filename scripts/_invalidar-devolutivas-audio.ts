/** Invalida o cache das devolutivas em voz já geradas (voz antiga, feminina).
 *  Apaga o MP3 do bucket e zera comportamental_audio_path/at → a próxima
 *  solicitação regenera com a voz atual do Beto (Achird).
 *  Rodar: npx tsx scripts/_invalidar-devolutivas-audio.ts [--apply] */
import './_env';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'relatorios-pdf';
const APPLY = process.argv.includes('--apply');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  // Manutenção deliberadamente cross-tenant (a voz mudou pra TODOS) — mas o
  // guard de leitura raw exige filtro de empresa_id na cadeia, então a
  // varredura itera POR empresa em vez de um select global.
  const { data: empresas, error: empErr } = await sb.from('empresas').select('id, slug');
  if (empErr) throw new Error(empErr.message);
  const alvos: any[] = [];
  for (const e of empresas || []) {
    const { data, error } = await sb
      .from('colaboradores')
      .select('id, nome_completo, empresa_id, comportamental_audio_path, comportamental_audio_at')
      .eq('empresa_id', e.id)
      .not('comportamental_audio_path', 'is', null);
    if (error) throw new Error(`${e.slug}: ${error.message}`);
    alvos.push(...(data || []));
  }

  console.log(`${alvos.length} devolutiva(s) em cache${APPLY ? '' : '  (DRY-RUN — use --apply)'}`);
  for (const c of alvos) console.log(`  · ${c.nome_completo} — ${c.comportamental_audio_at}`);
  if (!APPLY || !alvos.length) return;

  const paths = alvos.map((c) => c.comportamental_audio_path as string);
  const { error: delErr } = await sb.storage.from(BUCKET).remove(paths);
  if (delErr) console.warn(`  ⚠️ storage.remove: ${delErr.message} (segue mesmo assim — o path novo tem timestamp)`);

  let ok = 0;
  for (const c of alvos) {
    const { error: upErr } = await sb
      .from('colaboradores')
      .update({ comportamental_audio_path: null, comportamental_audio_at: null })
      .eq('id', c.id)
      .eq('empresa_id', c.empresa_id); // escopo de tenant explícito
    if (upErr) console.error(`  ❌ ${c.nome_completo}: ${upErr.message}`);
    else ok++;
  }
  console.log(`PRONTO ✅ ${ok}/${alvos.length} invalidada(s) — próxima escuta/envio regenera com Achird`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
