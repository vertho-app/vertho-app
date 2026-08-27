/**
 * Gera a TAREFA integrada da semana (`kit_desafios_semana`) para os pares de
 * descritores que as trilhas em curso realmente entregam.
 *
 * POR QUE UM SCRIPT, e não geração na leitura
 * ───────────────────────────────────────────
 * A régua da casa: na ENTREGA, degrade registrando; na CONSTRUÇÃO, falhe alto.
 * Gerar o par quando alguém abre a conversa poria uma chamada de IA no caminho
 * da pessoa — latência imprevisível e custo que ninguém planejou. Aqui a
 * geração é um passo declarado, com denominador na tela antes de gastar.
 *
 * ⚠️ O CUSTO É REAL E CRESCE MAL (medido 27/08/2026): a matriz por PAR é ~2,5×
 * a por descritor, porque o par vem do blueprint de CADA pessoa — 37 descritores
 * viram 251 pares em ibipeba. Por isso o script **imprime o plano e só executa
 * com `--executar`**.
 *
 * O par só é gerado quando os DOIS descritores já têm brief publicado: o texto
 * ancora nos dois núcleos, e inventá-lo sem eles seria escrever sobre um tema
 * que ninguém curou.
 *
 * USO
 *   npx tsx scripts/_gerar-desafios-par.ts --empresa=<slug> [--limite=N] [--executar]
 *
 * Sem `--executar`, só mostra quantas células faltam e quais.
 */
process.loadEnvFile('.env.local');

import { createClient } from '@supabase/supabase-js';
import { gerarDesafioDaSemana, chaveDoPar } from '../lib/season-engine/kit/desafio-par';
import { normDescritor } from '../lib/blueprint/to-descriptors';
import { normalizarComp } from '../lib/workshop-competencias';
import { getProgramaConfigDaTrilha } from '../lib/season-engine/programa-config';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const executar = args.includes('--executar');
const slug = arg('empresa');
const limite = Number(arg('limite') || 0);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Celula {
  empresaId: string;
  competencia: string;
  descritores: string[];
  cargo: string;
  disc: string;
  pessoas: number;
}

async function main() {
  if (!slug) throw new Error('--empresa=<slug> é obrigatório');

  const { data: empresa, error: eErr } = await sb.from('empresas').select('id, slug').eq('slug', slug).maybeSingle();
  if (eErr) throw new Error(`empresas: ${eErr.message}`);
  if (!empresa) throw new Error(`empresa não encontrada: ${slug}`);

  const { data: trilhas, error: tErr } = await sb.from('trilhas')
    .select('id, colaborador_id, temporada_plano, programa_modo, programa_config')
    .eq('empresa_id', empresa.id);
  if (tErr) throw new Error(`trilhas: ${tErr.message}`);

  const { data: colabs, error: cErr } = await sb.from('colaboradores')
    .select('id, cargo, perfil_dominante').eq('empresa_id', empresa.id);
  if (cErr) throw new Error(`colaboradores: ${cErr.message}`);
  const porColab = new Map((colabs || []).map((c: any) => [c.id, c]));

  // ── Levantamento das células que as trilhas REALMENTE entregam ───────────
  const celulas = new Map<string, Celula>();
  let semFlag = 0;
  for (const t of trilhas || []) {
    const cfg = getProgramaConfigDaTrilha(t as any);
    // Sem o flag, a semana tem uma tarefa por entrega e o par não se aplica.
    if (!cfg.desafioUnicoPorCompetencia) { semFlag++; continue; }
    const colab: any = porColab.get(t.colaborador_id);
    const disc = String(colab?.perfil_dominante || '').trim().charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc)) continue;
    const cargo = String(colab?.cargo || 'todos').trim() || 'todos';

    for (const s of (Array.isArray(t.temporada_plano) ? t.temporada_plano : []) as any[]) {
      if (s?.tipo !== 'conteudo' || !Array.isArray(s.conteudos_dia)) continue;
      // Agrupa por competência: o par é dos descritores da MESMA competência.
      const grupos = new Map<string, { competencia: string; descritores: string[] }>();
      for (const e of s.conteudos_dia) {
        const k = normalizarComp(e?.competencia);
        if (!grupos.has(k)) grupos.set(k, { competencia: e?.competencia || '', descritores: [] });
        if (e?.descritor) grupos.get(k)!.descritores.push(e.descritor);
      }
      for (const g of grupos.values()) {
        const norm = chaveDoPar(g.descritores);
        if (norm.length < 2 || !g.competencia) continue;
        const id = `${g.competencia}|${norm.join('+')}|${cargo}|${disc}`;
        const existente = celulas.get(id);
        if (existente) { existente.pessoas++; continue; }
        celulas.set(id, { empresaId: empresa.id, competencia: g.competencia, descritores: g.descritores, cargo, disc, pessoas: 1 });
      }
    }
  }

  // ── O que já existe ───────────────────────────────────────────────────────
  const { data: jaTem, error: jErr } = await sb.from('kit_desafios_semana')
    .select('competencia, descritores_norm, cargo, disc').eq('empresa_id', empresa.id);
  if (jErr) throw new Error(`kit_desafios_semana: ${jErr.message}`);
  const existentes = new Set((jaTem || []).map((r: any) => `${r.competencia}|${(r.descritores_norm || []).join('+')}|${r.cargo}|${r.disc}`));

  const faltantes = [...celulas.values()].filter((c) =>
    !existentes.has(`${c.competencia}|${chaveDoPar(c.descritores).join('+')}|${c.cargo}|${c.disc}`));

  console.log(`empresa        : ${slug}`);
  console.log(`trilhas         : ${trilhas?.length ?? 0}${semFlag ? ` (${semFlag} sem desafioUnicoPorCompetencia — ignoradas)` : ''}`);
  console.log(`células no plano: ${celulas.size}`);
  console.log(`já geradas      : ${celulas.size - faltantes.length}`);
  console.log(`A GERAR         : ${faltantes.length}${limite ? ` (limitado a ${limite})` : ''}`);

  const alvo = limite ? faltantes.slice(0, limite) : faltantes;
  if (!executar) {
    for (const c of alvo.slice(0, 20)) {
      console.log(`  · [${c.disc}] ${c.cargo} · ${c.competencia} · ${c.descritores.join(' + ')} (${c.pessoas} pessoa${c.pessoas > 1 ? 's' : ''})`);
    }
    if (alvo.length > 20) console.log(`  … e mais ${alvo.length - 20}`);
    console.log('\nSem --executar, nada foi gerado.');
    return;
  }

  // ── Geração ───────────────────────────────────────────────────────────────
  let ok = 0, reused = 0, semBrief = 0, erro = 0;
  for (const [i, c] of alvo.entries()) {
    try {
      const nucleos = await buscarNucleos(empresa.id, c.competencia, c.descritores, c.cargo);
      if (nucleos.length < 2) {
        // Sem os dois núcleos curados, escrever a tarefa seria inventar sobre um
        // tema que ninguém revisou. Registra e segue — o consumidor cai no
        // desafio do descritor principal, que é o comportamento atual.
        semBrief++;
        console.log(`  ${i + 1}/${alvo.length} SEM BRIEF (${nucleos.length}/2) · ${c.competencia} · ${c.descritores.join(' + ')}`);
        continue;
      }
      const r = await gerarDesafioDaSemana(sb, {
        empresaId: c.empresaId, competencia: c.competencia, descritores: c.descritores,
        disc: c.disc, cargo: c.cargo, nucleos,
      });
      if (r.reused) reused++; else ok++;
      console.log(`  ${i + 1}/${alvo.length} ${r.reused ? 'já existia' : 'gerado'} [${c.disc}] ${c.descritores.join(' + ')}`);
    } catch (e: any) {
      erro++;
      console.error(`  ${i + 1}/${alvo.length} ERRO [${c.disc}] ${c.descritores.join(' + ')}: ${e?.message}`);
    }
  }
  console.log(`\ngerados: ${ok} · já existiam: ${reused} · sem brief: ${semBrief} · erros: ${erro}`);
  if (erro) process.exitCode = 1;
}

/** Núcleos dos briefs dos dois descritores (match tolerante, como o resolvedor de kit). */
async function buscarNucleos(empresaId: string, competencia: string, descritores: string[], cargo: string) {
  const { data, error } = await sb.from('kit_briefs')
    .select('descritor, cargo, brief, empresa_id')
    .eq('competencia', competencia)
    .or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
  if (error) throw new Error(`kit_briefs: ${error.message}`);

  const out: { descritor: string; ideia_central: string; pontos_chave: string[]; exemplo_ancora: string }[] = [];
  for (const d of descritores) {
    const alvo = normDescritor(d);
    const cands = (data || []).filter((b: any) => normDescritor(b.descritor) === alvo)
      .filter((b: any) => {
        const bc = String(b.cargo || '').trim().toLowerCase();
        return !bc || !cargo || bc === cargo.toLowerCase() || bc === 'todos';
      })
      // Preferência: cargo exato > exclusivo da empresa > resto (mesma de resolverDesafioDoKit).
      .sort((a: any, b: any) => {
        const ac = String(a.cargo || '').toLowerCase() === cargo.toLowerCase() ? 1 : 0;
        const bc = String(b.cargo || '').toLowerCase() === cargo.toLowerCase() ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return (b.empresa_id ? 1 : 0) - (a.empresa_id ? 1 : 0);
      });
    const n = cands[0]?.brief;
    if (n?.ideia_central) {
      out.push({
        descritor: d,
        ideia_central: n.ideia_central,
        pontos_chave: Array.isArray(n.pontos_chave) ? n.pontos_chave : [],
        exemplo_ancora: n.exemplo_ancora || '',
      });
    }
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
