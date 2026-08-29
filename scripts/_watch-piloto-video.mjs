process.loadEnvFile('.env.local');
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ID = '204c2341-8772-4040-a122-7242e464e576';
const t0 = Date.now();
for (;;) {
  const { data } = await sb.from('videos_gerados').select('status, bunny_video_id, error').eq('id', ID).maybeSingle();
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`[${min}min] status=${data?.status} bunny=${data?.bunny_video_id ? 'sim' : 'não'} ${data?.error || ''}`);
  if (['done', 'error'].includes(data?.status) || (Date.now() - t0) > 45 * 60000) break;
  await new Promise((r) => setTimeout(r, 60000));
}
