/* eslint-disable */
// Gera os kits DISC FALTANTES da coorte, headless — versão script do
// `planejarKitsCoorte` (actions/kits.ts:334), com duas diferenças que importam:
//
//   1. HERDA `contexto` e nível do brief que já existe para o tema. A action força
//      `contexto: 'educacional'` (kits.ts:425), mas os briefs em uso na Ibipeba
//      estão gravados como 'generico' — e `resolverOuCriarBrief` casa por
//      (competencia, descritor, nivel_min, nivel_max, cargo, contexto, empresa_id).
//      Passar 'educacional' num tema 'generico' não reusa: cria um brief PARALELO e
//      quebra a espinha compartilhada (armadilhas 2 e 3 do docs/KIT-SEMANAL.md — a
//      empresa já tem 13 briefs 'generico' e 10 'educacional', vários em pares).
//   2. Roda `gerarKitSemanal` DIRETO (sb service-role injetado = sem gate), em vez de
//      enfileirar no Trigger. Síncrono: o resultado é visível aqui e não depende do
//      deploy manual do trigger.
//
// incluirVideo=false por padrão: o vídeo do kit é caro (GPU) e, medido por
// `_predict-video-overlay`, só 2 células da semana 3 perderiam vídeo — essas se
// resolvem em separado, ancorando no módulo do CONTEÚDO (armadilha 6).
//
// Uso:  npx tsx scripts/_gerar-kits-faltantes.ts [semanaMax]            → DRY-RUN
//       npx tsx scripts/_gerar-kits-faltantes.ts [semanaMax] --executar → gera
//       npx tsx scripts/_gerar-kits-faltantes.ts [semanaMax] --empresa=<slug>
//
// `--empresa` (default `ibipeba`): o EMPRESA_ID era literal aqui, e a coorte de
// Macaé tinha a mesma lacuna sem nenhum jeito de rodar o script para ela. O slug
// é resolvido no banco — id cru na linha de comando não diz de quem é, e é o tipo
// de argumento que se erra em silêncio (aponta para outro tenant e "funciona").
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarKitSemanal } from '@/actions/kits';

const SLUG = (process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1] || 'ibipeba').trim();
const SEMANA_MAX = Number(process.argv[2]) || 3;
const EXECUTAR = process.argv.includes('--executar');
const COM_VIDEO = process.argv.includes('--com-video');
const DISC_OK = ['D', 'I', 'S', 'C'];
const ckey = (...p: string[]) => p.filter(Boolean).join(' ::: ');

async function main() {
  const sb = createSupabaseAdmin();
  // `error` do supabase-js é RETORNADO, não lançado: sem checar, uma falha de
  // leitura viraria "empresa não encontrada" e o ABORT abaixo culparia o slug.
  const { data: emp, error: errEmp } = await sb.from('empresas')
    .select('id, slug, is_demo').eq('slug', SLUG).maybeSingle();
  if (errEmp) throw new Error(`falha ao resolver a empresa '${SLUG}': ${errEmp.message}`);
  if (!emp || emp.is_demo) throw new Error(`ABORT: empresa '${SLUG}' inválida ou is_demo`);
  const EMP = emp.id as string;

  // 1) Coorte ATIVA (fase4_envios), com DISC dominante e cargo.
  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, colaboradores!inner(id, perfil_dominante, cargo)')
    .eq('empresa_id', EMP).eq('status', 'ativo');
  if (!envios?.length) throw new Error('coorte vazia');

  // 2) Trilha mais recente por colaborador.
  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, competencia_foco, temporada_plano, numero_temporada').eq('empresa_id', EMP);
  const ultima = new Map<string, any>();
  for (const t of (trilhas as any[] || [])) {
    const prev = ultima.get(t.colaborador_id);
    if (!prev || Number(t.numero_temporada) > Number(prev.numero_temporada)) ultima.set(t.colaborador_id, t);
  }

  // 3) Demanda até a semana N: (competência × descritor × CARGO) → DISCs + pessoas.
  const demanda = new Map<string, { competencia: string; descritor: string; cargo: string; discs: Set<string>; pessoas: Set<string> }>();
  for (const e of (envios as any[])) {
    const c = e.colaboradores;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const cargo = c.cargo || 'todos';
    const t = ultima.get(e.colaborador_id);
    for (const s of (Array.isArray(t?.temporada_plano) ? t.temporada_plano : [])) {
      if (s?.tipo !== 'conteudo' || Number(s?.semana ?? 0) > SEMANA_MAX) continue;
      const itens = Array.isArray(s.conteudos_dia) && s.conteudos_dia.length
        ? s.conteudos_dia.map((cd: any) => ({ comp: cd.competencia || t.competencia_foco, desc: cd.descritor }))
        : [{ comp: t.competencia_foco, desc: s.descritor }];
      for (const { comp, desc } of itens) {
        if (!comp || !desc || !DISC_OK.includes(disc)) continue;
        const key = ckey(comp, desc, cargo);
        if (!demanda.has(key)) demanda.set(key, { competencia: comp, descritor: desc, cargo, discs: new Set(), pessoas: new Set() });
        demanda.get(key)!.discs.add(disc);
        demanda.get(key)!.pessoas.add(c.id);
      }
    }
  }

  // 4) Briefs + kits publicados (empresa OU global).
  const { data: briefs } = await sb.from('kit_briefs')
    .select('id, competencia, descritor, cargo, contexto, nivel_min, nivel_max, empresa_id')
    .or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const briefById = new Map((briefs || []).map((b: any) => [b.id, b]));
  const { data: kitsRows } = briefs?.length
    ? await sb.from('kits').select('brief_id, disc, status').in('brief_id', briefs.map((b: any) => b.id)).eq('status', 'published')
    : { data: [] as any[] };
  const publicado = new Set<string>();
  for (const k of (kitsRows as any[] || [])) {
    const b = briefById.get(k.brief_id);
    if (b) publicado.add(ckey(b.competencia, b.descritor, b.cargo || 'todos', k.disc));
  }

  // 5) Plano: faltantes + parâmetros HERDADOS do brief existente do tema.
  const plano: any[] = [];
  for (const d of demanda.values()) {
    const faltantes = [...d.discs].sort().filter((x) => !publicado.has(ckey(d.competencia, d.descritor, d.cargo, x)));
    if (!faltantes.length) continue;
    const briefTema = (briefs as any[] || []).find(
      (b) => b.competencia === d.competencia && b.descritor === d.descritor && (b.cargo || 'todos') === d.cargo && b.empresa_id === EMP,
    );
    plano.push({
      ...d, faltantes, pessoas: d.pessoas.size,
      contexto: briefTema?.contexto ?? 'generico',
      nivelMin: Number(briefTema?.nivel_min ?? 1), nivelMax: Number(briefTema?.nivel_max ?? 2),
      briefExistente: !!briefTema,
    });
  }
  plano.sort((a, b) => b.faltantes.length - a.faltantes.length);

  const totalKits = plano.reduce((s, p) => s + p.faltantes.length, 0);
  console.log(`=== KITS FALTANTES · ${emp.slug} · semanas 1–${SEMANA_MAX} ===`);
  console.log(`coorte ativa: ${envios.length} · combinações com lacuna: ${plano.length} · kits a gerar: ${totalKits}`);
  console.log(`vídeo: ${COM_VIDEO ? 'INCLUÍDO' : 'pulado (skipVideo)'}\n`);
  for (const p of plano) {
    console.log(`  ${p.briefExistente ? '↻ brief existente' : '✚ brief NOVO      '} | ${p.cargo} › ${p.competencia} › ${p.descritor}`);
    console.log(`     faltam: ${p.faltantes.join(',')} · ${p.pessoas} pessoa(s) · contexto='${p.contexto}' nivel ${p.nivelMin}–${p.nivelMax}`);
  }
  if (!EXECUTAR) { console.log('\n>>> DRY-RUN — nada gerado. Use --executar <<<'); return; }

  console.log('\n>>> GERANDO <<<\n');
  let ok = 0, erro = 0;
  for (const p of plano) {
    const t0 = Date.now();
    const r: any = await gerarKitSemanal({
      competencia: p.competencia, descritor: p.descritor, cargo: p.cargo,
      contexto: p.contexto, nivelMin: p.nivelMin, nivelMax: p.nivelMax,
      empresaId: EMP, discs: p.faltantes, sb,
      useBatch: false,          // síncrono: precisa estar pronto para a entrega de amanhã
      renderAudio: false,       // podcast renderiza on-demand (medido em _diag-narracao-kit)
      incluirVideo: COM_VIDEO,
    });
    const seg = Math.round((Date.now() - t0) / 1000);
    for (const k of (r.kits || [])) {
      if (k.ok) { ok++; console.log(`  ✅ ${p.descritor} · ${k.disc} (${seg}s)`); }
      else { erro++; console.log(`  ❌ ${p.descritor} · ${k.disc}: ${k.error}`); }
    }
    if (!r.kits?.length) { erro += p.faltantes.length; console.log(`  ❌ ${p.descritor}: ${r.error || 'sem retorno'}`); }
  }
  console.log(`\nRESUMO: ${ok} kit(s) publicado(s) · ${erro} falha(s)`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
