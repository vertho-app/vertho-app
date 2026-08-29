/* eslint-disable */
// Encerra boxes de render Hetzner — mas SÓ quando comprovadamente ociosas.
//
// Por que não basta "a fila de render secou": o worker roda a PERSONALIZAÇÃO
// (vídeo com "Olá, {nome}") DEPOIS do render do deck, serial por colaborador e
// fora do watchdog (F-V2 do docs/FMEA-PIPELINE.md). Matar a box nesse intervalo
// não perde o deck, mas deixa as pessoas daquela célula no vídeo genérico —
// permanentemente, porque não há re-disparo automático (F-V1).
//
// Critério de ócio (todos, por N ciclos seguidos):
//   · nenhuma célula em render_queued/rendering
//   · contagem de videos_personalizados NÃO cresceu
//
// Uso:  npx tsx scripts/_hetzner-encerrar-ocioso.ts            → observa e reporta
//       npx tsx scripts/_hetzner-encerrar-ocioso.ts --encerrar → encerra ao confirmar ócio
process.loadEnvFile('.env.local');
import { readFileSync } from 'fs';
import { createSupabaseAdmin } from '@/lib/supabase';

const ENCERRAR = process.argv.includes('--encerrar');
const CICLOS_SEM_PROGRESSO = 3;      // 3 × 2min = 6min parado
const INTERVALO_MS = 120_000;
// Teto de observação. Parametrizável porque 40min fixos não cobrem uma fila com
// várias células: em 27/07 o monitor expirou com trabalho ainda em curso (correto —
// não matou nada) e foi preciso relançar. Nunca aumentar isso "por garantia" sem
// olhar a fila: o script só encerra com ócio confirmado, então esperar mais é
// sempre seguro; o risco é o oposto — desistir cedo e deixar box ligada.
const CICLOS_MAX = Number(process.argv.find((a) => /^\d+$/.test(a))) || 20;

const TOKEN = (() => {
  for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('='); if (i < 0) continue;
    const k = l.slice(0, i).trim();
    if (/hetzner/i.test(k) && !/render_backend/i.test(k)) {
      const v = l.slice(i + 1).trim().replace(/^"|"$/g, '');
      if (v.length > 10) return v;
    }
  }
  return null;
})();
if (!TOKEN) throw new Error('token Hetzner ausente');

const hcloud = (p: string, opts: any = {}) =>
  fetch('https://api.hetzner.cloud/v1/' + p, {
    ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sb = createSupabaseAdmin();
  let semProgresso = 0;
  let anterior = -1;

  for (let ciclo = 1; ciclo <= CICLOS_MAX; ciclo++) {
    // A API Hetzner devolve `{ servers: [...] }`. Ler `.data` daqui (como fazem os
    // clients do Supabase) dá `undefined` → lista vazia → "nenhuma box ativa" com 3
    // rodando. Foi o que aconteceu na 1ª execução: o script se declarou satisfeito e
    // teria deixado as boxes ligadas. Por isso o `catch` também não engole mais — uma
    // falha de rede aqui vira 0 boxes, que é a resposta perigosa (a que manda embora).
    const resp = await hcloud('/servers?label_selector=role%3Drender-worker')
      .then((r) => r.json())
      .catch((e: any) => { throw new Error(`Hetzner indisponível: ${e?.message || e}`); }) as any;
    if (!Array.isArray(resp?.servers)) throw new Error(`resposta inesperada da Hetzner: ${JSON.stringify(resp).slice(0, 200)}`);
    const lista = resp.servers.filter((s: any) => ['initializing', 'starting', 'running'].includes(s.status));

    const { count: emFila } = await sb.from('videos_gerados')
      .select('id', { count: 'exact', head: true }).in('status', ['render_queued', 'rendering']);
    const { count: persoDone } = await sb.from('videos_personalizados')
      .select('id', { count: 'exact', head: true }).eq('status', 'done');
    const { count: persoAndamento } = await sb.from('videos_personalizados')
      .select('id', { count: 'exact', head: true }).in('status', ['processing', 'pending']);

    const hora = new Date().toISOString().slice(11, 19);
    const progrediu = anterior >= 0 && persoDone! > anterior;
    console.log(`[${hora}] boxes=${lista.length} fila=${emFila} personalizados=${persoDone}${progrediu ? ' (+)' : ''} emAndamento=${persoAndamento}`);

    if (!lista.length) { console.log('✅ nenhuma box ativa — nada a encerrar'); return; }

    const ocioso = emFila === 0 && anterior >= 0 && persoDone === anterior;
    semProgresso = ocioso ? semProgresso + 1 : 0;
    anterior = persoDone!;

    if (semProgresso >= CICLOS_SEM_PROGRESSO) {
      console.log(`\nócio confirmado (${CICLOS_SEM_PROGRESSO} ciclos sem fila e sem personalizar).`);
      if (!ENCERRAR) { console.log('>>> modo observação — use --encerrar para desligar <<<'); return; }
      for (const s of lista) {
        const r = await hcloud(`/servers/${s.id}`, { method: 'DELETE' });
        console.log(r.ok ? `  ✅ encerrada ${s.name}` : `  ❌ falha ao encerrar ${s.name}: ${r.status}`);
      }
      // Conferência pela API, sem label_selector: se uma box perder o label, ela some
      // do filtro e "0 restantes" seria uma resposta falsamente tranquilizadora.
      const restam = await hcloud('/servers').then((r) => r.json()) as any;
      const vivas = (restam?.servers || []).filter((s: any) => s.status !== 'deleting');
      console.log(`\nconferência pela API (todas as boxes, sem filtro de label): ${vivas.length} restante(s)`);
      for (const s of vivas) console.log(`  · ainda viva: ${s.name} (${s.status})`);
      return;
    }
    await sleep(INTERVALO_MS);
  }
  console.log(`\n⏱️ ${CICLOS_MAX} ciclos sem confirmar ócio — boxes seguem vivas, verificar à mão.`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
