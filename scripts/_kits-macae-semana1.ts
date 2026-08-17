/* eslint-disable */
// Kits da SEMANA 1 dos diretores de Macaé — o que a coorte vai pedir amanhã.
//
// POR QUE ESTE SCRIPT, e não a tela: a geração leva ~1-2 min por DISC e a janela
// é hoje (a P1 sai amanhã 08:00 BRT). Aqui o plano é levantado pelo MESMO núcleo
// que o cron de horizonte usa (`levantarPlanoKitsCoorte`) — reimplementar "o que
// falta" produziria um plano que concorda consigo mesmo e diverge da entrega.
//
// ⚠️ SEM VÍDEO E SEM ÁUDIO de propósito: render de vídeo leva ~40 min por célula
// e satura o mesmo fornecedor de TTS que a narração usa (F-V4). A semana 1
// entrega texto + case; o vídeo não está no caminho da entrega de amanhã.
//
// ⚠️ SÍNCRONO (useBatch=false): o Batch API custa metade e devolve quando devolve
// — com prazo de horas, previsibilidade vale mais que 50% de desconto.
//
// Uso:  npx tsx scripts/_kits-macae-semana1.ts             → dry-run (só o plano)
//       npx tsx scripts/_kits-macae-semana1.ts --executar  → gera
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { levantarPlanoKitsCoorte } from '@/lib/season-engine/kit/plano-coorte';
import { gerarKitSemanal } from '@/actions/kits';

const MACAE = '44b632ae-b7b9-440d-bc74-92cead889d52';
const EXECUTAR = process.argv.includes('--executar');

async function main() {
  const sb = createSupabaseAdmin();

  const base = await levantarPlanoKitsCoorte(sb, MACAE, { semanaMax: 1 });
  if ('error' in base) throw new Error(String(base.error));

  console.log(`coorte: ${base.colaboradores} colaborador(es) com trilha`);
  console.log(`combinações da semana 1: ${base.plano.length} · DISC faltantes: ${base.totalFaltantes}\n`);

  for (const item of base.plano) {
    console.log(`── ${item.competencia} › ${item.descritor}`);
    console.log(`   cargo=${item.cargo} contexto=${item.contexto} nivel=${item.nivelMin}-${item.nivelMax}`);
    console.log(`   pessoas=${item.pessoas} · demandados=${item.demandadas.join(',')} · existentes=${item.existentes.join(',') || '(nenhum)'} · FALTAM=${item.faltantes.join(',') || '(nenhum)'}`);
  }

  if (!EXECUTAR) {
    console.log('\ndry-run — rode com --executar para gerar.');
    return;
  }

  for (const item of base.plano) {
    if (!item.faltantes.length) { console.log(`\n✓ ${item.descritor}: nada a fazer`); continue; }
    console.log(`\n▶ gerando ${item.faltantes.join(',')} · ${item.competencia} › ${item.descritor}`);
    const r = await gerarKitSemanal({
      competencia: item.competencia,
      descritor: item.descritor,
      discs: item.faltantes as any,
      nivelMin: item.nivelMin,
      nivelMax: item.nivelMax,
      cargo: item.cargo,
      contexto: item.contexto,
      empresaId: MACAE,
      sb,                     // injetado: sem sessão, sem gate de action
      useBatch: false,
      incluirVideo: false,
      renderAudio: false,
      onProgress: async (p) => console.log(`   ${p.done}/${p.total} · ${p.current}`),
    });
    console.log(`   ${r.success ? '✅' : '❌'} ${r.message || (r as any).error}`);
    for (const k of (r as any).kits || []) {
      console.log(`     ${k.disc}: ${k.ok ? 'ok' : 'FALHOU ' + k.error} · kit=${k.kitId ?? '-'} · formatos=${(k.conteudos || []).filter((c: any) => c.ok).length}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
