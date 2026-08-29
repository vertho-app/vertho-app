// Acompanha o lote de vídeo da semana 5 até estabilizar (nenhum em processing/rendering).
process.loadEnvFile('.env.local');
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const t0 = Date.now();
let ultimo = '';
for (;;) {
  const { data } = await sb.from('videos_gerados')
    .select('status').eq('empresa_id', EMP)
    .gte('created_at', new Date(Date.now() - 4 * 3600_000).toISOString());
  const por = {};
  for (const v of data || []) por[v.status] = (por[v.status] || 0) + 1;
  const ativos = (por.processing || 0) + (por.rendering || 0) + (por.render_queued || 0);
  const linha = Object.entries(por).map(([k, v]) => `${k}:${v}`).join(' · ');
  const min = ((Date.now() - t0) / 60000).toFixed(0);
  if (linha !== ultimo) { console.log(`[${min}min] ${linha}`); ultimo = linha; }
  // Para quando não há mais nada ativo E já passou tempo de o disparo terminar.
  if (!ativos && Number(min) > 8) { console.log(`[${min}min] FIM — ${linha}`); break; }
  if (Number(min) > 150) { console.log(`[${min}min] TETO 150min — ${linha}`); break; }
  await new Promise((r) => setTimeout(r, 60000));
}
