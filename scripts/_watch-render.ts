/* eslint-disable */
/**
 * Acompanha um lote de render até o fim — uma linha por MUDANÇA de estado.
 *
 * POR QUE EXISTE: o pipeline de vídeo passa por roteiro → narração → avatar →
 * render → Bunny, e cada etapa leva minutos. Sem um observador, a escolha é
 * entre consultar o banco de tempos em tempos (e esquecer) ou descobrir no dia
 * seguinte que uma célula morreu em `error` — que é como 2 células de Ibipeba
 * ficaram sem deck até o health estrutural acusar.
 *
 * Imprime só o que MUDOU: a saída é feita para virar evento/notificação, não
 * para ser lida em tempo real. Sai sozinho quando todas as células chegam a um
 * estado terminal (`done`/`error`) ou quando o teto de tempo estoura — e diz
 * qual dos dois aconteceu, porque "parou de imprimir" não é resposta.
 *
 * Uso:
 *   npx tsx scripts/_watch-render.ts --empresa=macae
 *   ... --desde=2026-08-17T22:00:00Z   (default: últimas 6h)
 *   ... --teto=180                     (minutos; default 180)
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const DESDE = arg('desde') || new Date(Date.now() - 6 * 3600_000).toISOString();
const TETO_MIN = Number(arg('teto')) || 180;
const INTERVALO_MS = 60_000;

const TERMINAIS = new Set(['done', 'error']);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: emp } = await sb.from('empresas').select('id, nome').eq('slug', SLUG).maybeSingle();
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);
  const empresaId = (emp as any).id as string;

  const visto = new Map<string, string>();
  const inicio = Date.now();

  while (true) {
    const { data, error } = await sb.from('videos_gerados')
      .select('id, disc_dominante, status, etapa, error, bunny_video_id')
      .eq('empresa_id', empresaId).gte('created_at', DESDE)
      .order('created_at');
    // Falha de leitura NÃO encerra o watch: rede oscila, e sair aqui seria
    // silêncio indistinguível de "tudo terminou".
    if (error) { console.log(`[watch] leitura falhou: ${error.message}`); await dormir(INTERVALO_MS); continue; }

    const linhas = (data || []) as any[];
    if (!linhas.length) { console.log('[watch] nenhuma célula na janela — nada a acompanhar'); return; }

    for (const v of linhas) {
      const estado = `${v.status}/${v.etapa ?? '-'}${v.bunny_video_id ? '+bunny' : ''}`;
      if (visto.get(v.id) === estado) continue;
      visto.set(v.id, estado);
      const marca = v.status === 'done' ? '✅' : v.status === 'error' ? '❌' : '·';
      console.log(`${marca} DISC ${v.disc_dominante} ${v.id.slice(0, 8)} → ${estado}${v.error ? ` · ${String(v.error).slice(0, 120)}` : ''}`);
    }

    const terminadas = linhas.filter((v) => TERMINAIS.has(v.status));
    if (terminadas.length === linhas.length) {
      const ok = linhas.filter((v) => v.status === 'done' && v.bunny_video_id).length;
      console.log(`[watch] FIM · ${ok}/${linhas.length} com deck assistível`);
      return;
    }

    if (Date.now() - inicio > TETO_MIN * 60_000) {
      const presas = linhas.filter((v) => !TERMINAIS.has(v.status));
      console.log(`[watch] TETO de ${TETO_MIN} min · ${presas.length} ainda em voo: ${presas.map((v) => `${v.disc_dominante}=${v.status}/${v.etapa}`).join(', ')}`);
      return;
    }

    await dormir(INTERVALO_MS);
  }
}

main().catch((e) => { console.log(`[watch] erro: ${e?.message || e}`); process.exit(1); });
