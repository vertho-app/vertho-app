/* eslint-disable */
// Acompanha o render das células disparadas por `_gerar-videos-faltantes-semana`
// e RE-DISPARA, no máximo UMA vez por célula, as que morrerem em falha transitória.
//
// Por que re-disparar: `resolverCelulaVideo` filtra `.neq('status','error')` — uma
// célula em erro é invisível para a entrega, então a pessoa fica sem vídeo e nada
// se auto-cura. Falhas vistas em 27/07 ao disparar 12 de uma vez: "TTS: resposta sem
// áudio após 4 tentativas" (saturação; o TTS tem teto de TPM). Por isso o re-disparo
// é SERIALIZADO, um de cada vez, e não em paralelo como o disparo original.
//
// O limite de 1 retry é deliberado: cada tentativa gasta HeyGen + render, e uma
// falha que persiste duas vezes é problema estrutural (env, quota), não azar.
//
// Uso:  npx tsx scripts/_watch-videos-semana.ts [semana] [minutosMax]
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { dispararVideoDoKit } from '@/actions/gerar-video';
import { resolverContextoEmpresa } from '@/lib/season-engine/kit/contexto-empresa';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = Number(process.argv[2]) || 3;
const MINUTOS_MAX = Number(process.argv[3]) || 90;
const TAG = `kit:sem${SEMANA}-faltante`;
const EM_ANDAMENTO = ['processing', 'rendering', 'render_queued'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sb = createSupabaseAdmin();
  const pppBrief = await resolverContextoEmpresa(sb, EMP).catch(() => null);
  const jaRetentado = new Set<string>();
  const limite = Date.now() + MINUTOS_MAX * 60_000;

  while (Date.now() < limite) {
    const { data: vids } = await sb.from('videos_gerados')
      .select('id, status, etapa, cargo, disc_dominante, modulo_base_id, kit_id, error')
      .eq('empresa_id', EMP).like('created_by', `${TAG}%`);
    const linhas = (vids as any[]) || [];
    const cont: Record<string, number> = {};
    for (const v of linhas) cont[v.status] = (cont[v.status] || 0) + 1;
    const hora = new Date().toISOString().slice(11, 19);
    console.log(`[${hora}] ${linhas.length} células · ` + Object.entries(cont).map(([k, n]) => `${k}=${n}`).join(' '));

    // Re-disparo serializado das que falharam (1× por célula).
    for (const v of linhas.filter((x) => x.status === 'error')) {
      const chave = `${v.modulo_base_id}|${v.cargo}|${v.disc_dominante}`;
      if (jaRetentado.has(chave)) continue;

      // ⚠️ O Set acima é memória do PROCESSO: numa nova execução do script ele nasce
      // vazio e a linha em 'error' (que fica no banco para sempre) parece nova. Foi o
      // que aconteceu em 27/07 — rodar o monitor de novo re-disparou 2 células que já
      // tinham retry CONCLUÍDO, queimando 2 renders à toa. A verdade tem que vir do
      // banco: se a célula lógica já tem uma linha viva (done ou em andamento), não há
      // nada a recuperar.
      const { data: viva } = await sb.from('videos_gerados')
        .select('id, status').eq('modulo_base_id', v.modulo_base_id).eq('empresa_id', EMP)
        .eq('cargo', v.cargo).eq('disc_dominante', v.disc_dominante)
        .neq('status', 'error').limit(1).maybeSingle();
      if (viva) {
        jaRetentado.add(chave);
        console.log(`   · ${v.cargo}·${v.disc_dominante}: já coberta por ${(viva as any).id} (${(viva as any).status}) — sem re-disparo`);
        continue;
      }
      jaRetentado.add(chave);
      let desafioTexto: string | undefined;
      if (v.kit_id) {
        const { data: kit } = await sb.from('kits').select('desafio').eq('id', v.kit_id).maybeSingle();
        desafioTexto = (kit as any)?.desafio?.desafio_texto;
      }
      const r: any = await dispararVideoDoKit(sb, {
        moduloBaseId: v.modulo_base_id, empresaId: EMP, cargo: v.cargo, disc: v.disc_dominante,
        desafioTexto, kitId: v.kit_id || undefined, pppBrief, createdBy: `${TAG}-retry`,
      }).catch((e: any) => ({ error: e?.message }));
      console.log(r.error ? `   ❌ retry ${v.cargo}·${v.disc_dominante}: ${r.error}`
        : `   ↻ retry ${v.cargo}·${v.disc_dominante} → ${r.id} (era: ${String(v.error).slice(0, 60)})`);
      await sleep(30_000); // espaça o TTS: o disparo em rajada foi o que saturou
    }

    const restam = linhas.filter((v) => EM_ANDAMENTO.includes(v.status)).length;
    if (!restam) {
      const done = linhas.filter((v) => v.status === 'done').length;
      const erro = linhas.filter((v) => v.status === 'error').length;
      console.log(`\nFIM: ${done} done · ${erro} error (de ${linhas.length} tentativas, incl. retries)`);
      return;
    }
    await sleep(60_000);
  }
  console.log(`\n⏱️ timeout de ${MINUTOS_MAX}min — ainda há células em andamento.`);
}
main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
